# GameDoc architecture & conventions

GameDoc renders controlled, schema-validated content into "specialized pages."
Every persisted feature flows through the same six layers. Read an existing
stack as a worked example before adding a new one — the **docs** stack and the
**templates** stack are the two canonical references.

## The layer spine

```
schema (Zod)  →  store (disk JSON)  →  API route  →  provider (client state)  →  components/widgets  →  page (route)
```

| Layer | Lives in | Job | Reference example |
|-------|----------|-----|-------------------|
| Schema | `src/lib/schema/*.ts` or `src/lib/<domain>/types.ts` | Zod definition + `z.infer` types + validation rules | `src/lib/schema/doc.ts`, `src/lib/templates/types.ts` |
| Store | `src/lib/<domain>/store.ts` | Read/validate/write the collection to `src/data/<domain>/content.json` **via `@/lib/store/json` (`readJsonFile`/`writeJsonFile`)** — never raw `fs.writeFile`. **Server-only.** | `src/lib/docs/store.ts`, `src/lib/templates/store.ts` |
| API route | `src/app/api/<domain>/route.ts` (+ `[id]/route.ts`) | GET/POST/PUT/DELETE, validating with the schema; returns 4xx with `error` on bad input | `src/app/api/docs/route.ts`, `src/app/api/templates/route.ts` |
| Provider | `src/components/<domain>/<Domain>Provider.tsx` | `'use client'` context holding the collection + CRUD that calls the API and updates local state | `src/components/docs/DocsProvider.tsx`, `src/components/templates/TemplatesProvider.tsx` |
| Components/widgets | `src/components/...` | Presentational + interactive UI; domain providers and editors live here | `src/components/docs/DocView.tsx`, `src/components/templates/TemplateForm.tsx`, `src/components/collections/CollectionEditor.tsx` |
| Page | `src/app/<route>/page.tsx` | App Router route; server component reads the store and wraps children in providers via `src/app/layout.tsx` | `src/app/docs/[id]/page.tsx`, `src/app/templates/page.tsx` |

Providers are wired once in `src/app/layout.tsx`, which reads each store on the
server and passes the initial collection down. Add a new provider there.

## Load-bearing conventions

These are the rules that keep the app coherent. Violating them is what produces
hard-to-debug drift, so follow them even when a shortcut looks tempting.

1. **Schema first, types derived.** Define the Zod schema, then
   `export type X = z.infer<typeof XSchema>`. Never hand-write the type — it
   will silently diverge from validation. When data doesn't fit, fix the data,
   not the schema.

2. **Stable slug IDs.** IDs match `^[a-z0-9]+(?:-[a-z0-9]+)*$`, are assigned
   once, and never change. Use `slugify()` from `src/components/docs/inline.tsx`.

3. **Cross-reference by ID, never display name.** Links, parent pointers, and
   relations store IDs; resolve to titles at render time.

4. **Controlled vocabulary in one place.** Enums and option lists live as Zod
   enums / exported constants (see `TONES`, `FIELD_KINDS` in
   `src/lib/templates/types.ts`), never as inline string literals in components.

5. **Tailwind v4 is build-time static.** The compiler only emits classes it can
   see literally in source. Dynamic names like `bg-${tone}-100` are dropped at
   build and silently render unstyled. Map values to literal class strings (see
   `TONE_STYLE` / `toneStyle()`).

6. **Respect the client/server boundary.** Disk/store code and `readX()` are
   server-only and must never be imported into a `'use client'` file. Anything
   using React state, hooks, or browser globals needs `'use client'`. Components
   that touch browser-only libs (e.g. BlockNote) are loaded via
   `next/dynamic` with `ssr: false` — see `src/components/docs/DocView.tsx`.

7. **Loose-but-validated persistence.** Page `data` is stored as
   `Record<string, unknown>` and coerced per-field at read time (`asText`,
   `asStringList`, `asBadges`) so a schema can evolve without migrating every
   row. Follow this pattern for evolvable structured content.

8. **All JSON writes go through `@/lib/store/json`.** A store must persist with
   `writeJsonFile` (atomic temp-file + rename, and serialized per path), never a
   bare `fs.writeFile`. Two overlapping `fs.writeFile` calls to the same
   `content.json` — easy to trigger with debounced autosave firing while a save
   is in flight — interleave their bytes and corrupt the file ("Unexpected
   non-whitespace character after JSON"). The shared helper makes that
   impossible; reuse it for every new store. See troubleshooting §9.

## Worked example: adding a new content type ("Item")

To add an Item specialized-content type end to end:

1. **Schema** — `src/lib/items/types.ts`: `ItemSchema` (Zod) + `type Item = z.infer<...>` + a `ItemCollectionSchema`.
2. **Store** — `src/lib/items/store.ts`: `readItems()`/`writeItems()` against `src/data/items/content.json` (create the JSON file with `[]` or seed data).
3. **API** — `src/app/api/items/route.ts` (GET/POST) and `src/app/api/items/[id]/route.ts` (PUT/DELETE), validating with `ItemSchema`, mirroring the docs routes.
4. **Provider** — `src/components/items/ItemsProvider.tsx`: context + `create/update/delete` calling the API; wire it into `src/app/layout.tsx`.
5. **Components** — reuse `src/components/widgets/` where possible; add item-specific UI only where the generic widgets don't fit.
6. **Page** — `src/app/items/page.tsx` and/or integrate into the docs tree as a templated node (see how templates attach to `DocNode.templateId`).
7. **Verify** — run `node .github/skills/create-feature/scripts/verify.mjs`.

Note: this app already has a generic template system. Before hard-coding a new
content type, check whether it can be expressed as a **page template** (see
`src/lib/templates/types.ts` and `src/components/templates/`) — that is usually
the lighter, more flexible path and is the direction the app is heading.
