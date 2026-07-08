# Plan: Narrative Moment page style + screenplay scaffold generator

## Overview

Add a new widget block, `momentCard` ("Narrative Moment"), to the homegrown v2
block editor. It carries: a **name**, a **tagline**, a **description**, and an
ordered **sequence of events** (each event has a title, a summary, and
optional character refs). A shared "generate screenplay scaffold" capability
reads that data and creates a **new child page** whose body is a screenplay-
formatted scaffold — exposed both as an MCP tool and an in-editor button.

Decisions locked in with the user before this plan was written:
- **Data shape**: a dedicated widget (mirrors `characterCard` /
  `narrativeTimeline`), not a composition of `hero`/paragraph/list blocks.
- **Trigger**: both an MCP tool (`gamedoc_generate_screenplay`) and a UI
  button, sharing one pure generator function.

---

## Phase 0 — Documentation Discovery (consolidated findings)

### Allowed APIs (cite before using — do not invent variants)

**Block model — `src/lib/docs/blocks.ts`**
- `PROSE_TYPES` (line 18) / `WIDGET_TYPES` (line 31) — controlled vocabularies.
  `WIDGET_TYPES` currently: `['labeled','statusBadge','badges','tags','refs','collection','studioPanel','characterCard','narrativeTimeline','hero','cards','swatch','hexelMap']`.
- `ProseBlock = { id, type, text, layout?, color? }`, `WidgetBlock = { id, type, props: Record<string, unknown>, layout? }` (lines 80–81).
- `emptyProse(type, text)` (line 114) — the only block-construction helper that exists; there is **no** `makeWidget()` helper — widget blocks are built as plain object literals `{ id: makeBlockId(), type, props }`.
- `makeBlockId()` (line 110), `serializeBlocks(blocks, legend?)` (line 317), `parseBody(body)` (line 288, always returns ≥1 block), `isWidgetBlock()` (line 93).

**Widget data-model convention — `src/lib/timeline/types.ts`** (copy this file's shape wholesale for the new module)
- Structured widgets store their **entire** state as one JSON string in a single prop, conventionally named `dataJson` (confirmed by this file's own header comment, lines 4–6: "stores a whole story spine as JSON in its block prop (`dataJson`), exactly like the Character Studio panel").
- Every field is `.catch(...)`-healed (zod), so a hand-edited or partial value never breaks parsing (lines 11–14).
- Pattern per entity: a `*Schema` (zod) → `type X = z.infer<typeof XSchema>` — types are **never** hand-written.
- `mintId(prefix)` (line 114) mints unique-enough ids scoped to one spine.
- `emptyX()` seed factory returns a small, evocative, *non-empty* default so a freshly-inserted widget never looks blank (lines 162–206).
- `asX(value)` healer (line 213): treats an empty/invalid raw value as "use the seed", coerces ids, drops dangling cross-references (e.g. `moments.map(...)` strips an `actId` that no longer exists in `acts`, lines 220–230).
- `serializeX(x)` (line 236): `JSON.stringify`.
- Character refs are **plain page-id strings**, cross-referenced by id (e.g. `Moment.characters: z.array(z.string()).catch([])`, line 77) — not a dedicated ref object.

**Widget registration — three required touch points**
1. `src/lib/docs/blocks.ts` — add the new type string to `WIDGET_TYPES` (line 31–45).
2. `src/components/docs/widgets/registry.tsx` — add an entry to `WIDGETS: Record<WidgetType, WidgetEntry>`:
   ```ts
   type WidgetEntry = { type: WidgetType; title: string; aliases: string[]; defaults: Record<string, unknown>; Component: React.ComponentType<WidgetProps> };
   type WidgetProps = { props: Record<string, unknown>; onChange: (patch: Record<string, unknown>) => void };
   ```
   `WidgetHost` (lines 134–144) does `{ ...entry.defaults, ...block.props }` then `<Component props={merged} onChange={onChange} />` inside `contentEditable={false}`. `onChange` receives a **partial patch** that the host merges into `block.props` and persists.
3. `src/components/docs/catalog.tsx` — add an entry to `WIDGET_CATALOG: Record<WidgetType, CatalogEntry>`:
   ```ts
   type CatalogEntry = { icon: ReactNode; blurb: string; preview: ReactNode };
   ```
   Copy the `characterCard` entry (lines 260–273) as the literal template for shape/tone (16px `<Icon>` SVG, one-line blurb, tiny static non-interactive preview).

**Bound cross-page pattern — `src/components/docs/widgets/CharacterCard.tsx` + `src/lib/studio/card.ts`**
- Access all pages via `useDocs()` → `{ docs: DocNode[] }`.
- Resolve a source page: `docs.find(d => d.id === sourcePageId)`.
- Missing-source / missing-data / all-hidden states each render a specific inline placeholder string rather than throwing — copy this defensive-render style for any "pick a related page" UI in the new widget (e.g. picking characters for an event).

**Character name + hover-glimpse reuse — `src/lib/timeline/glimpse.ts` + `NarrativeTimeline.tsx`**
- `characterGlimpse(body: string): CharacterGlimpse` — **pure, generic, server-safe** (keyed only on a character page's body string; nothing timeline-specific despite its file location). Import it directly — do not duplicate its logic.
  ```ts
  type CharacterGlimpse = { portrait: string; name: string; tier: string | null; blurb: string; stats: GlimpseStat[] };
  ```
  `name` is "codename if set, else the studio title" (glimpse.ts lines 17–28, 50–71) — this is the canonical way this codebase resolves a "display name" for a character page.
- `NarrativeTimeline.tsx`'s `resolve(id)` (lines 271–276) is the canonical fallback chain to copy for resolving a character id to a name safely:
  ```ts
  const resolve = (id) => {
    const c = charById.get(id);
    if (c) return { title: c.title, glimpse: c.glimpse, exists: true };
    const d = docs.find(x => x.id === id);
    return { title: d?.title ?? id, glimpse: null, exists: !!d };
  };
  ```
- The hover tooltip (`CharacterChip`, lines 88–129) is plain CSS (`.tl-chip:hover .tl-glimpse { display: block }`), no portal/tooltip library, and is defined **locally inside** `NarrativeTimeline.tsx` (not exported/shared).

**Doc store / API — `src/lib/schema/doc.ts`, `src/app/api/docs/**`**
- `DocNode = { id, title, parentId, order, body, hue }` (doc.ts lines 7–35) — one page kind; body is an opaque string (v2 JSON or markdown); the old templateId/data split is retired (schema comment, lines 16–19).
- `POST /api/docs` creates; `PATCH /api/docs/[id]` is the **body-preserving** partial update (`{...current, ...patch}` merge, `[id]/route.ts` line 63) — the safe path for metadata-only edits; `PUT` demands a full node (dangerous — never use for a body-preserving edit).
- Client precedent for "spawn a child page from the current page": `DocsProvider.tsx:64`, `createDoc({ id, title, parentId: doc!.id, body: '' })`.

**MCP write path — `mcp/src/data.ts`, `mcp/src/server.ts`** (confirmed directly, not just summarized)
- `mcp/src/data.ts` is the MCP's data-access layer and reads/writes the **same** canonical `src/data/docs/content.json` (line 31: `dataFile('docs', 'content.json')`) that the Next.js app uses — confirmed, not assumed.
- Reusable exports (`data.ts`):
  - `loadDocs(): Promise<DocNode[]>` (line 39)
  - `saveDocs(docs: DocNode[]): Promise<void>` (line 48) — validates the **whole collection** and writes through the atomic, per-path-serialized store (`writeJsonFile`), so it can never race the live editor's autosave.
  - `nextOrder(docs, parentId): number` (line 53)
  - `validateDoc(node): {ok:true,doc} | {ok:false,error}` (line 59)
  - The exact **hexelMap precedent** to mirror for reading a widget's structured data off a doc body:
    ```ts
    // data.ts lines 106–110
    export function docHexelScenes(body: string): { blockId: string; scene: HexelScene }[] {
      return parseBody(body)
        .filter((b): b is WidgetBlock => isWidgetBlock(b) && b.type === 'hexelMap')
        .map((b) => ({ blockId: b.id, scene: asScene(parseDataJson(b.props.dataJson)) }));
    }
    ```
- The exact **create-doc precedent** (`server.ts` lines 222–233):
  ```ts
  async ({ id, title, body, parentId, order }) => {
    const docs = await loadDocs();
    if (docs.some((d) => d.id === id)) return fail(`Doc "${id}" already exists...`);
    const parent = parentId ?? null;
    if (parent && !docs.some((d) => d.id === parent)) return fail(`Parent "${parent}" not found...`);
    const result = validateDoc({ id, title, parentId: parent, order: order ?? nextOrder(docs, parent), body });
    if (!result.ok) return fail(`Invalid doc — ${result.error}`);
    await notifyStart(id);
    await saveDocs([...docs, result.doc]);
    await notifyCommit('created', id, result.doc);
    return json({ action: 'created', doc: result.doc });
  }
  ```
  `notifyStart` / `notifyCommit` must be reused as-is (they signal the live app/collab relay about the write) — do not skip them.

**Doc graph — `src/lib/docs/graph.ts`**
- `NODE_KINDS = ['page','character','timeline','space']`; kind is inferred in `buildNode()` from which widget a page carries (`studioPanel`→character, `narrativeTimeline`→timeline, `hexelMap`→space, else page).
- `EDGE_KINDS = ['child_of','mirrors','references','features','mentions']`; `child_of` comes from `parentId` alone — **free**, no extra code, for any parent/child relationship.

### Anti-patterns to avoid (do not do these)
- Do **not** invent a `makeWidget()` helper in `blocks.ts` — none exists; build widget block literals directly (`{ id: makeBlockId(), type: 'momentCard', props: {...} }`), matching every existing call site.
- Do **not** add a new `EDGE_KIND` (e.g. `'scaffolds'`) for the moment→screenplay link. Parenting the generated page under the moment page (`parentId`) already produces a `child_of` edge for free.
- Do **not** wire this into the page-**template** system (`src/data/templates/content.json`, `gamedoc_get_template`/`list_templates`). That system describes the older flat key-value field model, is purely advisory, and currently has exactly one entry (`nightmare`). It is not established practice to add new widgets there, and nothing in this feature needs it.
- Do **not** re-implement doc persistence (id-uniqueness check, `validateDoc`, `saveDocs`, `notifyStart`/`notifyCommit`) inside the new MCP tool — call the same primitives `gamedoc_create_doc` calls.
- Do **not** refactor `NarrativeTimeline.tsx` to export its `CharacterChip`/hover-glimpse UI as shared component. Copy the small pattern locally into the new widget — extracting shared UI (and its scoped CSS) is out of scope for this feature.
- Do **not** duplicate `characterGlimpse()` — import it from `src/lib/timeline/glimpse.ts`.

---

## Phase 1 — `momentCard` widget: data model + editable UI + registration

**What to implement**

1. `src/lib/moment/types.ts` (new file) — copy the structure of `src/lib/timeline/types.ts` wholesale:
   ```ts
   export const MomentEventSchema = z.object({
     id: z.string().catch(''),
     title: z.string().catch('New event'),
     summary: z.string().catch(''),
     characters: z.array(z.string()).catch([]), // page ids, cross-ref by id
   });
   export type MomentEvent = z.infer<typeof MomentEventSchema>;

   export const MomentCardSchema = z.object({
     name: z.string().catch('Untitled moment'),
     tagline: z.string().catch(''),
     description: z.string().catch(''),
     events: z.array(MomentEventSchema).catch([]),
   });
   export type MomentCard = z.infer<typeof MomentCardSchema>;
   ```
   Plus, mirroring `timeline/types.ts` 1:1: `mintId`-equivalent (or reuse a local counter same as timeline's), `makeEvent()`, `emptyMomentCard()` (a small seeded example — one moment, 3 evocative events, so a freshly-inserted widget is never blank, matching `emptyTimeline()`'s philosophy), `asMomentCard(value: unknown): MomentCard` (heals blank/invalid input to the seed, mints missing ids, drops dangling character ids that don't resolve to a real doc — **cannot** validate against `docs` here since this module must stay pure/server-safe with no React/store import; only drop empty-string ids, leave existence-checking to the render layer, same division of responsibility `asTimeline` uses for `actId`/`environment` vs how `NarrativeTimeline.tsx`'s `resolve()` handles a dangling character id at render time), `serializeMomentCard(m): string`.

2. `src/components/docs/widgets/MomentCard.tsx` (new file) — implements `WidgetProps = { props, onChange }`:
   - Read: `const moment = asMomentCard(safeJsonParse(props.dataJson))`.
   - Write: any edit calls `onChange({ dataJson: serializeMomentCard(next) })` — the whole object is replaced atomically on every edit (matches the single-`dataJson`-prop convention, avoiding partial-merge races since block props are a `Y.Map` with per-key last-writer-wins semantics).
   - Header chrome: name + tagline inputs (text inputs, like `CharacterCard.tsx`'s header controls, lines 211–236).
   - Description: a multiline textarea.
   - Events: an ordered, editable list — add/remove/reorder, each row has a title input, a summary textarea, and a character multi-picker sourced from `useDocs()` (mirror `CharacterCard.tsx`'s `docs.filter(...)` pattern for building the pickable list — pages that have a `studioPanel`, via the same `pageHasStudio(d.body)` helper from `src/lib/studio/card.ts`).
   - Each assigned character renders as a small chip with the **same hover-glimpse mechanism** as `NarrativeTimeline.tsx`'s `CharacterChip` (copy the pattern locally: `resolve(id)` fallback chain + `characterGlimpse()` import + a `.mc-chip`/`.mc-glimpse` CSS pair). **Before copying the CSS**, check whether `.tl-chip`/`.tl-glimpse` are defined globally or in a timeline-scoped stylesheet/module — if global, it may be reasonable to reuse the class names directly instead of porting new CSS; if scoped, write a new small `.mc-*` pair with the same visual behavior.

3. `src/lib/docs/blocks.ts` — add `'momentCard'` to `WIDGET_TYPES` (append after `'hexelMap'`, line ~44).

4. `src/components/docs/widgets/registry.tsx` — add:
   ```ts
   momentCard: {
     type: 'momentCard',
     title: 'Narrative Moment',
     aliases: ['moment', 'scene', 'beat', 'screenplay'],
     defaults: { dataJson: '' },
     Component: MomentCard,
   },
   ```

5. `src/components/docs/catalog.tsx` — add a `momentCard` entry to `WIDGET_CATALOG`, copying the `characterCard` entry's shape (icon, one-line blurb, static preview mock).

6. *Optional, in-convention, easy to skip*: extend `src/lib/docs/graph.ts` so a page carrying a `momentCard` infers `kind: 'moment'` — mirrors exactly how `narrativeTimeline`→`'timeline'` and `hexelMap`→`'space'` were added (`NODE_KINDS` array + one branch in `buildNode()`). This is what makes @mention chips to a moment page pick up a distinct color, same as character/timeline/space pages already do. Skip this sub-task entirely if you want the leanest possible diff — nothing else in this plan depends on it.

**Documentation references**: `src/lib/timeline/types.ts` (whole file, copy target), `src/components/docs/widgets/CharacterCard.tsx` (header chrome + defensive-render precedent), `src/components/docs/widgets/NarrativeTimeline.tsx` lines 88–129 + `src/lib/timeline/glimpse.ts` (chip/hover-glimpse precedent), `src/components/docs/catalog.tsx` lines 260–273, `src/components/docs/widgets/registry.tsx` lines 12–144.

**Verification checklist**
- `npm run typecheck` passes.
- `grep -rn "momentCard" src/` shows exactly the 4 expected touch points (blocks.ts, registry.tsx, catalog.tsx, the new component file) plus the new `src/lib/moment/` module.
- In the live preview (`npm run dev:all`): open the slash menu, insert "Narrative Moment", confirm the seeded example renders non-blank; add 3 events with mixed character assignments; reload the page and confirm the data survived (Yjs round-trip); hover an assigned character chip and confirm the glimpse tooltip shows portrait/tier/blurb, matching the timeline widget's existing hover behavior.

**Anti-pattern guards**: see Phase 0's list — no `makeWidget()` helper, no shared-component refactor of `NarrativeTimeline.tsx`, no duplicate `characterGlimpse()`.

---

## Phase 2 — Screenplay scaffold generator (pure, shared logic)

**What to implement**

`src/lib/moment/screenplay.ts` (new file) — pure, server-safe (no React, no store import — same class of module as `src/lib/timeline/glimpse.ts` / `src/lib/hexel/scene.ts`), so both the MCP tool (Phase 3) and the API route (Phase 4) can import it identically:

```ts
export function screenplayTitle(moment: MomentCard): string {
  return `${moment.name} — Screenplay Scaffold`;
}

export function generateScreenplayBlocks(
  moment: MomentCard,
  resolveCharacterName: (id: string) => string,
): DocBlock[] { /* ... */ }

export function generateScreenplayBody(
  moment: MomentCard,
  resolveCharacterName: (id: string) => string,
): string {
  return serializeBlocks(generateScreenplayBlocks(moment, resolveCharacterName));
}
```

**Formatting convention** (an explicit assumption — flag to the user in the PR/summary; trivial to restyle later since it's isolated to this one function):
- `hero` widget block: `{ id: makeBlockId(), type: 'hero', props: { eyebrow: 'Screenplay Scaffold', title: moment.name, subtitle: moment.tagline, tone: 'accent' } }` — reuse exactly the `eyebrow`/`title`/`subtitle`/`tone` keys the `hero` block already uses elsewhere (per `.claude/skills/create-game-design-page/driver.mjs`'s `compileBody` hero case) — do not invent new hero props. `tone` must be one of `dark|light|accent` (driver.mjs's `checkTone` — confirmed constraint on this specific widget, stricter than the general `TONES` list).
- One `paragraph` block: `moment.description`.
- One `heading2` block: `"Scenes"`.
- Per event, in order:
  - `heading3`: `` `SCENE ${i+1} — INT./EXT. [LOCATION] — [DAY/NIGHT] — ${event.title.toUpperCase()}` `` (a slugline placeholder — this codebase's prose model has no INT/EXT metadata to draw on, so the scaffold marks blanks explicitly rather than guessing).
  - `paragraph`: `event.summary || '(action)'`.
  - Per character id in `event.characters`: a `paragraph` with `resolveCharacterName(id).toUpperCase()` (stand-in for a centered character cue — this editor's `ProseBlock` has no text-alignment/bold flag, so caps text is the closest available convention) followed by a `quote` block `"(dialogue…)"` (its indentation is the closest available visual analog for a dialogue block).
  - `divider` block between events.
- Every block built via `emptyProse(type, text)` for prose, plain object literals for the one `hero` widget block — no new prose type invented.

`resolveCharacterName` is supplied by each call site (Phase 3 / Phase 4), not by this module — implement it identically in both places using the exact fallback chain from `NarrativeTimeline.tsx`'s `resolve()` (Phase 0): look up the doc, `characterGlimpse(doc.body).name`, else `doc.title`, else the raw id.

*Optional, matching an existing project convention*: add `scripts/moment-selftest.ts` (mirrors `scripts/hexel-selftest.ts` / the `npm run hexel-test` script) that feeds a sample `MomentCard` through `generateScreenplayBlocks` and asserts the output block count/shape, so this pure logic is testable without the dev server. Wire it as `"moment-test": "tsx scripts/moment-selftest.ts"` in `package.json` if added.

**Documentation references**: `src/lib/docs/blocks.ts` (`emptyProse`, `serializeBlocks`, `DocBlock`/`WidgetBlock` types), `.claude/skills/create-game-design-page/driver.mjs` (hero prop keys + tone validation), `src/lib/timeline/glimpse.ts` + `NarrativeTimeline.tsx`'s `resolve()` (name-resolution fallback chain), `scripts/hexel-selftest.ts` (selftest-script convention, if added).

**Verification checklist**
- Run (or write) `scripts/moment-selftest.ts`: feed a 2-event sample moment through `generateScreenplayBlocks`, assert block count matches `1(hero) + 1(paragraph) + 1(heading2) + events.length * (1 heading3 + 1 paragraph + characters.length * 2 + 1 divider)`.
- `serializeBlocks(generateScreenplayBlocks(...))` round-trips through `parseBody()` without throwing and without dropping blocks.

**Anti-pattern guards**: no invented `hero` props beyond `eyebrow/title/subtitle/tone`; no new `PROSE_TYPES` entry; this module imports nothing from React or `src/lib/docs/store.ts` (must stay usable from the MCP's Node process, which has no Next.js runtime).

---

## Phase 3 — MCP tool: `gamedoc_generate_screenplay`

**What to implement**

1. `mcp/src/data.ts` — add one small helper mirroring `docHexelScenes` exactly (lines 106–110):
   ```ts
   export function docMomentCards(body: string): { blockId: string; moment: MomentCard }[] {
     return parseBody(body)
       .filter((b): b is WidgetBlock => isWidgetBlock(b) && b.type === 'momentCard')
       .map((b) => ({ blockId: b.id, moment: asMomentCard(parseDataJson(b.props.dataJson)) }));
   }
   ```
   (`parseDataJson` already exists in this file, lines 98–103 — reuse it, don't redefine it.)

2. `mcp/src/server.ts` — register a new tool near `gamedoc_export_scene` (same "derive an artifact from a widget's structured data" precedent):
   ```ts
   server.registerTool(
     'gamedoc_generate_screenplay',
     {
       title: 'Generate screenplay scaffold',
       description: 'Read a page\'s Narrative Moment widget and create a new child page scaffolded as a screenplay (scene headings, action, character cues, dialogue placeholders) from its sequence of events.',
       inputSchema: {
         id: z.string().describe('Doc id of the page with the Narrative Moment widget.'),
         blockId: z.string().optional().describe('Which momentCard block (defaults to the first).'),
         childId: z.string().describe('Stable slug id for the new screenplay page.'),
         title: z.string().optional().describe('Title for the new page; defaults to "<name> — Screenplay Scaffold".'),
       },
       annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
     },
     async ({ id, blockId, childId, title }) => {
       const docs = await loadDocs();
       const doc = docs.find((d) => d.id === id);
       if (!doc) return fail(`No doc "${id}". Use gamedoc_list_docs to see valid ids.`);
       const cards = docMomentCards(doc.body);
       if (!cards.length) return fail(`Doc "${id}" has no Narrative Moment widget.`);
       const target = blockId ? cards.find((c) => c.blockId === blockId) : cards[0];
       if (!target) return fail(`No momentCard block "${blockId}" on "${id}".`);

       if (docs.some((d) => d.id === childId)) return fail(`Doc "${childId}" already exists. Choose a different childId or delete it first.`);

       const resolveCharacterName = (charId: string) => {
         const c = docs.find((d) => d.id === charId);
         if (!c) return charId;
         return characterGlimpse(c.body).name || c.title;
       };
       const body = generateScreenplayBody(target.moment, resolveCharacterName);
       const pageTitle = title ?? screenplayTitle(target.moment);
       const result = validateDoc({ id: childId, title: pageTitle, parentId: id, order: nextOrder(docs, id), body });
       if (!result.ok) return fail(`Invalid doc — ${result.error}`);
       await notifyStart(childId);
       await saveDocs([...docs, result.doc]);
       await notifyCommit('created', childId, result.doc);
       return json({ action: 'created', doc: result.doc });
     },
   );
   ```
   This is deliberately built as `gamedoc_create_doc`'s own body (Phase 0 citation) with the `body` swapped for the generated scaffold and `parentId` forced to the moment page's `id` — reuse, don't reinvent.

**Documentation references**: `mcp/src/data.ts` lines 39–64, 98–110 (exact functions to import/mirror), `mcp/src/server.ts` lines 208–233 (create-doc precedent to mirror), 340–347 (describe-space precedent for "read a widget off a doc, then act").

**Verification checklist**
- This session already has `gamedoc-live-dryrun` MCP tools loaded — after implementing, restart the MCP dev process if needed and call `gamedoc_generate_screenplay` against a doc seeded with a test `momentCard` (2–3 events, at least one with a character ref).
- Confirm via `gamedoc_get_doc` that the new child page's body parses to the expected block sequence, and via `gamedoc_list_docs` that it's nested under the moment page in the indented outline (proves `parentId` took effect — the `child_of` graph edge comes free from this, no `graph.ts` change needed).
- Confirm calling the tool again with the same `childId` fails with the "already exists" message rather than silently overwriting.

**Anti-pattern guards**: no reimplementation of `validateDoc`/`saveDocs`/id-uniqueness checks; no new `EDGE_KIND`; `docMomentCards` must be a near-verbatim mirror of `docHexelScenes`, not a divergent new pattern.

---

## Phase 4 — UI trigger: button + API route

**What to implement**

1. `src/app/api/docs/[id]/generate-screenplay/route.ts` (new file, `POST`) — the Next.js-side twin of Phase 3's MCP handler. Same logic shape (find the doc via `src/lib/docs/store.ts`'s read path, locate the `momentCard` block, resolve character names, call `generateScreenplayBody`, then create the child doc via whatever function backs `POST /api/docs` today — do **not** hand-roll a second doc-creation path; import and call the same one). Body: `{ blockId?: string, childId: string, title?: string }`.
2. A "Generate Screenplay Scaffold" button in `MomentCard.tsx`'s header chrome (next to name/tagline, same slot style as `CharacterCard.tsx`'s header controls). On click: prompt/derive a `childId` (e.g. slugify `${pageId}-screenplay`, adjusting on collision), `POST` to the new route, then navigate to (or show a link to) the created page.
3. Confirm `notifyTreeChanged()` (or whatever the POST /api/docs handler already calls, per `src/app/api/docs/route.ts` lines 12–33) fires on this new route too, so the sidebar tree updates without a manual refresh.

**Documentation references**: `src/app/api/docs/route.ts` (POST handler, id/parent validation, `notifyTreeChanged()`), `src/app/api/docs/[id]/route.ts` (id-existence + validation conventions), `src/components/docs/widgets/CharacterCard.tsx` lines 211–236 (header-button chrome precedent), Phase 2's `screenplay.ts` (shared generator — import, don't reimplement).

**Verification checklist**
- In the live preview: click the button on a filled-in Narrative Moment widget; confirm the sidebar tree gains a new child page under the moment page; open it and confirm it renders the expected scene/action/character-cue/dialogue structure.
- Click the button again against an existing `childId` and confirm it surfaces a clear "already exists" error in the UI rather than corrupting the existing page.
- Restart `npm run dev:collab` before this testing pass if any block/serialization code changed since the last collab-relay start (known project gotcha: the relay has no hot-reload for these changes).

**Anti-pattern guards**: the API route must call the same doc-creation primitive `POST /api/docs` already uses — do not write a second parallel implementation; do not let the client (`MomentCard.tsx`) construct the screenplay body itself — generation logic lives only in `src/lib/moment/screenplay.ts`.

---

## Final Phase — Full verification pass

1. **Static checks**: `npm run typecheck`. If a lint script exists by the time this runs, run it too (none is currently defined in `package.json`).
2. **Anti-pattern grep sweep**:
   - `momentCard` appears in exactly: `blocks.ts` (WIDGET_TYPES), `registry.tsx` (WIDGETS), `catalog.tsx` (WIDGET_CATALOG), the new `MomentCard.tsx` — no fifth ad hoc registration path.
   - No second implementation of `validateDoc`/`saveDocs`/doc-creation outside the two call sites that are supposed to share Phase 2's generator.
   - No new `EDGE_KIND`, no new `PROSE_TYPES` entry, no `src/data/templates/content.json` edit.
3. **End-to-end browser pass** (`npm run dev:all`, Preview tools):
   - Insert a Narrative Moment widget, fill tagline/description/3 events (mixed character refs), reload to confirm persistence.
   - Click "Generate Screenplay Scaffold" → verify the child page and its content.
   - Call `gamedoc_generate_screenplay` via MCP against a second, separately-seeded moment page → verify via `gamedoc_get_doc`/`gamedoc_list_docs`.
   - Hover a character chip on the widget → confirm the glimpse tooltip.
4. **Cleanup**: delete any test pages created during manual verification (`gamedoc_delete_doc` or the UI) and `git diff src/data/docs/content.json` before committing, since this file is the tracked canonical seed — don't leave scratch test docs committed.
