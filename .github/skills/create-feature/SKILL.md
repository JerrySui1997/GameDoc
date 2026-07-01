---
name: create-feature
description: >-
  Scaffold and ship a new feature in the GameDoc Next.js app (schemas, stores,
  API routes, providers, components, pages) following the project's established
  architecture, then audit and verify it end-to-end. Use this whenever the user
  wants to add, build, or extend a feature, page, widget, content type, schema,
  template, or data model in GameDoc — even if they don't say "feature." Also
  use it when a change needs checking before it ships, when a Next.js build or
  runtime error appears (especially "Cannot find module './NNN.js'" or other
  webpack chunk errors, or a "Unexpected non-whitespace character after JSON"
  store-corruption error), or when the user asks to confirm code works against the
  current installed dependency and API versions rather than guesses from memory.
---

# Create & verify a GameDoc feature

GameDoc is a Next.js 15 (App Router) + React 19 + TypeScript app that turns
controlled, schema-validated content into rendered "specialized pages." The
whole app follows one repeating data-flow spine. A feature that respects that
spine is easy to extend and verify; one that fights it creates the kind of
silent drift and stale-cache breakage that prompted this skill.

The goal of this skill is twofold: **build the feature the way the codebase
already works**, and **prove it works** before declaring done — never claim a
build passes without having run it.

## Operating principle: verify against reality, not memory

Dependency and API surfaces drift between versions. Your training memory of
"how Next.js / React / Zod / BlockNote / the Anthropic API works" may be stale.
Before using an API, confirm it against what is actually installed:

- **Installed versions are the source of truth.** Read `package.json` and the
  real versions in `node_modules` (e.g. `node -e "console.log(require('next/package.json').version)"`).
  Currently: Next 15.3.x, React 19.1.x, Zod 3.24.x, Tailwind v4.
- **Other libraries** → if unsure about an API, check the installed package's
  types/`README` in `node_modules`, or fetch the official docs for that exact
  version with WebFetch/WebSearch. Prefer the version-pinned docs.
- When you rely on a non-obvious API detail, leave a one-line comment noting it
  so the next reader (and the audit) can see the assumption.

## Workflow

Follow these phases in order. Phases 1–2 are planning, 3 is the build, 4 is the
non-negotiable audit.

### 1. Understand the request and the slice it touches

Read `references/architecture.md` for the full layering and conventions. In
short, a GameDoc feature is a vertical slice through these layers:

```
schema (Zod)  →  store (disk JSON)  →  API route  →  provider (client state)  →  components/widgets  →  page (route)
```

Decide which layers the request actually needs — a pure presentational widget
may touch only components; a new content type touches all of them. Don't add
layers the feature doesn't need, but don't skip the schema when persisting data.

### 2. Confirm the plan with the user when the slice is non-trivial

If the feature spans more than a couple of layers or introduces a new content
type, briefly state the layers you'll add/modify and the key schema shape, then
proceed. For small, obvious changes, just build.

### 3. Build, following the conventions

Implement layer by layer, matching the surrounding code's idiom (read a
neighbouring example first — e.g. the docs or templates stacks). The load-
bearing conventions, detailed in `references/architecture.md`:

- **Schema first.** Define the Zod schema, then derive types with
  `z.infer` — never hand-write the TypeScript type. Fix data to satisfy the
  schema rather than loosening the schema.
- **Stable slug IDs**, referenced everywhere; cross-references store IDs, never
  display names.
- **Controlled vocabulary** lives in enums/constants, not inline literals.
- **Tailwind v4 is build-time static** — never construct class names
  dynamically (`bg-${x}-100` won't be emitted). Use a literal lookup map.
- **Client/server boundary**: anything touching browser globals or React state
  is a `'use client'` component; disk/store access stays server-only.

### 4. Audit & verify (do not skip)

Run the verification gauntlet via the bundled script:

```bash
node .github/skills/create-feature/scripts/verify.mjs
```

This runs, in order: a dependency sanity check, `tsc --noEmit` (typecheck),
`next build` (which also type-checks routes and lints if configured), and
`npm run validate` if that script exists. Critically, **if the build fails with
a webpack chunk error** (`Cannot find module './NNN.js'`, `ChunkLoadError`, or a
`webpack-runtime` require-stack failure), the script automatically deletes the
stale `.next` cache and retries once — that class of error is almost always a
corrupted incremental cache, not a code bug. See `references/troubleshooting.md`
for the why and for other recurring runtime errors.

If any step fails on real code issues, read the error, fix the cause (don't
loosen the schema or `// @ts-ignore` past it), and re-run the gauntlet until it
is green. Only report success after a clean run, and say which checks passed.

**Leave the project runnable.** Because the gauntlet runs `next build`, it
populates `.next` with a *production* cache that a later `next dev` cannot read
(mismatched chunk hashes → the `./NNN.js` error). The script therefore deletes
`.next` after verifying, so the user's next `npm run dev` starts fresh. When you
finish a feature, confirm to the user that `npm run dev` (or `npm.cmd run dev`
on Windows PowerShell) will start cleanly. If the dev server ever still errors
with a chunk error, tell them to run `npm run dev:fresh`, which clears the cache
and starts dev in one step. Never end a feature leaving dev in a broken state.

After the gauntlet is green, run the project cross-reference audit too:

```bash
npm run crossref
```

## What "done" means

A feature is done when: it follows the layering, the schema is the source of
truth for any persisted data, APIs were verified against installed versions,
`verify.mjs` passes clean, and cross-reference checks pass. Summarize for the
user what you added (by file), what you verified against, and the checks that
passed.

## Reference files

- `references/architecture.md` — the layer-by-layer spine, conventions, and a
  worked example of adding a content type. Read before building.
- `references/troubleshooting.md` — stale-cache and runtime error patterns
  (including the `./NNN.js` chunk error) and their fixes. Read when a build or
  runtime error appears.
