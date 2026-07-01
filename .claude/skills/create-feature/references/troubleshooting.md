# GameDoc build & runtime troubleshooting

Read this when a build or runtime error appears. Most failures in this app fall
into a few well-understood buckets. Diagnose the bucket before changing code —
several of these are environment/cache issues where editing source only hides
the symptom.

## 1. Webpack chunk error — `Cannot find module './NNN.js'`

**Symptoms** (any of):
- `Error: Cannot find module './611.js'` with a require stack through
  `.next/server/webpack-runtime.js`
- `ChunkLoadError`, `Loading chunk N failed`
- A `_document.js` / `_not-found` / `load-components` stack trace at startup

**Cause.** The `.next` directory holds an *incremental* build. Each compile
emits content-hashed chunk files (`611.js`, etc.) and a runtime that requires
them by name. When the cache gets out of sync — usually from **running
`next dev` and `next build` against the same `.next`**, interrupting a build,
switching branches, or a dependency change — the runtime references a chunk hash
that no longer exists on disk. It is a stale-cache problem, **not a code bug**.

**Fix.**
```bash
# from repo root
rm -rf .next        # Windows PowerShell: Remove-Item -Recurse -Force .next
npm run build       # or: npm run dev
```
`scripts/verify.mjs` does this automatically: if the build output matches the
chunk-error pattern, it wipes `.next` and retries the build once.

**Prevent.** Don't run `dev` and `build` concurrently in the same checkout. If
you must alternate, clear `.next` between them. If it recurs immediately after a
clean cache, then suspect a real bad import (next section).

## 2. Real module-not-found (a genuine bad import)

If `Cannot find module` names an actual package or source path (e.g.
`Cannot find module '@/lib/items/store'`) rather than a numeric `./NNN.js`
chunk, it is a real bug, and clearing the cache won't help. Check:
- The import path and `@/` alias (`@/*` → `src/*`, see `tsconfig.json`).
- The file exists and exports what you're importing.
- For a new dependency: it's in `package.json` **and** `npm install` was run.

## 3. Server code imported into a client component

**Symptoms:** errors about `fs`, `path`, or "Module not found: Can't resolve
'fs'", or hydration/runtime errors referencing Node built-ins in the browser.

**Cause:** a `'use client'` component (transitively) imported a store/`readX()`
or other server-only module. Stores touch the filesystem and must stay
server-side — read them in a server component (page/layout) and pass data down
through a provider, never import them into client code.

## 4. Tailwind classes not applying

If an element renders unstyled despite a correct-looking className, check for a
**dynamically constructed class name** (`bg-${x}-100`). Tailwind v4 only emits
classes it sees literally in source, so dynamic ones are silently dropped. Map
the value to a literal class string (see `TONE_STYLE`/`toneStyle()` in
`src/lib/templates/types.ts`).

## 5. Zod validation failures from the store / API

If `readX()` throws on startup or an API returns a 400 with a Zod `error`, the
on-disk JSON no longer matches the schema — commonly after adding a required
field. Either give the new schema field a `.default(...)` (so existing rows stay
valid, as `DocNode.templateId`/`data` do) or migrate `content.json`. **Fix the
data or add a default — do not loosen the schema to make the error go away.**

## 6. Hooks-order / "rendered fewer hooks" errors

React requires the same hook calls on every render of a component instance.
Don't early-`return` before some hooks when a route can switch a node between
two render modes — split into a thin dispatcher component that decides *which*
child to render (see how `DocView` dispatches to `TemplatedDocView` vs.
`FreeformDocView`), so each child calls its own hooks unconditionally.

## 7. Hydration mismatch on `<body>` / `<html>` from a browser extension

**Symptoms:** A console error "A tree hydrated but some attributes of the server
rendered HTML didn't match the client properties," pointing at `<body>` or
`<html>` in `layout.tsx`, with the diff showing extension-injected attributes
like `data-new-gr-c-s-check-loaded`, `data-gr-ext-installed` (Grammarly),
`cz-shortcut-listen` (ColorZilla), or `data-lt-installed` (LanguageTool).

**Cause.** This is **not a code bug.** A browser extension mutates the
`<body>`/`<html>` tag after the server HTML arrives but before React hydrates,
so the client tree no longer matches the server tree. React can't reconcile the
injected attributes and warns.

**Fix.** Add `suppressHydrationWarning` to the affected element in
`src/app/layout.tsx`:
```tsx
<body suppressHydrationWarning className="...">
```
It suppresses mismatches **only one level deep on that element** — it does not
hide genuine hydration bugs in child components, so it's safe and is React's
documented remedy for exactly this case.

**Distinguish from a real hydration bug.** If the mismatch is on an element
*inside* your components (not `<body>`/`<html>`) or the differing values are
yours — `Date.now()`, `Math.random()`, `new Date().toLocaleString()`, reading
`localStorage`/`window` during render — then it IS a code bug. Fix the cause:
render the dynamic value in a `useEffect` after mount, or pass a server snapshot
down as a prop. Do not paper over a real mismatch with `suppressHydrationWarning`.

## 8. PowerShell execution policy — `npm.ps1 cannot be loaded`

**Symptoms:** `File npm.ps1 cannot be loaded because running scripts is disabled on this system. UnauthorizedAccess`

**Cause.** PowerShell's default `Restricted` policy blocks `.ps1` script files,
including the `npm.ps1` shim that the `npm` command resolves to. This is a
Windows security policy, not an app bug.

**Fix (pick one):**
```powershell
# A — Use the .cmd shim directly (no permission change needed)
npm.cmd run dev
npm.cmd run build

# B — Run through cmd.exe
cmd /c "npm run dev"

# C — Allow current user to run local scripts (no admin required)
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

Option A is the most reliable. The `verify.mjs` script already uses `npm.cmd`
on Windows internally, so running the gauntlet always works regardless of policy.

## 9. Corrupt `content.json` — "Unexpected non-whitespace character after JSON"

**Symptoms:** a runtime `SyntaxError: Unexpected non-whitespace character after
JSON at position N` thrown from `JSON.parse` inside a store's `readX()` (e.g.
`readDocs` in `src/lib/docs/store.ts`), usually at page/layout load. Inspecting
the file shows a complete valid value followed by **trailing leftover bytes**
(often a fragment of a longer earlier version).

**Cause.** Two `fs.writeFile` calls hit the same `content.json` concurrently and
their bytes interleaved: the shorter write finished, then the longer one’s tail
was left after it. The debounced autosave (title + data fields, or rapid edits)
makes this race easy to trigger. **It is a write-concurrency bug, not bad code
in the reader.**

**Fix (durable — already in the codebase).** Every store writes through
`@/lib/store/json` (`writeJsonFile`), which (1) writes a temp file then renames
it over the target (atomic — a reader never sees a partial file) and (2)
serializes writes per path through a promise queue (no interleaving). Any new
store MUST use this helper instead of `fs.writeFile`. If you find a store still
calling `fs.writeFile`/`fs.readFile` directly, that is the bug — migrate it.

**Repair a file that is already corrupted.** Truncate it back to the first
complete top-level value, then re-validate by parsing:

```bash
node -e '
const fs=require("fs"); const f="src/data/<domain>/content.json";
const raw=fs.readFileSync(f,"utf8");
const m=raw.match(/^[\s\S]*?\n\]\n/);        // first top-level array close
if(!m) throw new Error("no array end found");
JSON.parse(m[0]);                            // throws if still invalid
fs.writeFileSync(f,m[0],"utf8");
console.log("repaired");
'
```

(For an object-root file, match through the first top-level `\n}\n` instead.)
Then restart the dev server. If corruption recurs, a store is still bypassing
`writeJsonFile` — find and fix that, don't just re-truncate.

## General method

1. Read the **whole** error and its require stack; identify the bucket above.
2. If it's a cache/env bucket (1), heal the cache and re-verify before touching
   code.
3. If it's a code bucket, fix the cause — never `// @ts-ignore`, loosen a
   schema, or silence a validator just to get green.
4. Re-run `node .claude/skills/create-feature/scripts/verify.mjs` until clean.
