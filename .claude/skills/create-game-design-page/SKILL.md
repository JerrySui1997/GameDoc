---
name: create-game-design-page
description: Create beautiful, professional game-design pages in GameDoc through the gamedoc MCP. Use when asked to author, generate, design, or build a game design page, pitch, one-pager, or design doc — anything that should look polished with hero banners, card grids, color palettes, and badges. Drives the gamedoc MCP via .claude/skills/create-game-design-page/driver.mjs.
---

# Create beautiful game design pages (via the gamedoc MCP)

GameDoc renders doc pages from a stored `body` string. The pretty layout —
hero banners, card grids, color swatches, colored badges — only appears when
that body is the website's **v2 block JSON**. The gamedoc MCP's
`gamedoc_create_doc` accepts *any* string as the body and stores it **verbatim**
(`saveDocs` only schema-checks `body: z.string()`), so:

> **Plain markdown through the MCP → plain prose. v2 block JSON through the MCP → a beautiful page.**

The driver, [driver.mjs](.claude/skills/create-game-design-page/driver.mjs), is
the harness that makes this easy: you write a terse **page spec** (a list of
blocks), it **compiles** that to v2 block JSON (generating block IDs, escaping
the nested JSON props, validating tones), and pushes it through the live MCP
over stdio. It is a zero-dependency raw JSON-RPC MCP client — it spawns the
exact server from `.mcp.json` (`mcp/src/server.ts`) using the `tsx` already
vendored in `mcp/node_modules`, so it runs from anywhere with just `node`.

**All paths below are relative to the repo root (`D:\GameDoc`).** Run the
commands from there.

## Prerequisites

None beyond the repo's own install. The driver shells out to `node` and the
vendored `tsx`; no `apt-get`, no global installs. The gamedoc MCP being
*disabled in the Claude client* (`.claude/settings.local.json`) does **not**
matter — the driver launches the server itself.

> ⚠️ Writes hit the real seed file `src/data/docs/content.json` (this is not a
> git repo and there are no automatic backups). Before a batch of authoring,
> snapshot it: `cp src/data/docs/content.json src/data/docs/content.backup-$(date +%Y%m%d-%H%M%S).json`

## Run (agent path) — the driver

See the current site tree (cheap, ids + titles only):

```bash
node .claude/skills/create-game-design-page/driver.mjs list
```

Create the built-in showcase page (exercises every widget — good first sanity check):

```bash
node .claude/skills/create-game-design-page/driver.mjs demo
```

Author a real page from a spec file (see [example-spec.json](.claude/skills/create-game-design-page/example-spec.json)):

```bash
node .claude/skills/create-game-design-page/driver.mjs create .claude/skills/create-game-design-page/example-spec.json
```

Read a page back (`text` = clean prose, `raw` = stored v2 body):

```bash
node .claude/skills/create-game-design-page/driver.mjs get example-game-page
node .claude/skills/create-game-design-page/driver.mjs get example-game-page raw
```

Update (re-push the whole page) and delete:

```bash
node .claude/skills/create-game-design-page/driver.mjs update path/to/spec.json
node .claude/skills/create-game-design-page/driver.mjs delete example-game-page
```

The server prints `gamedoc MCP server ready (stdio).` to stderr on every call —
that line is noise, ignore it. Success prints the MCP's JSON result
(`{"action":"created","doc":{...}}`).

## The page spec format

A spec is JSON: `{ id, title, parentId?, order?, blocks: [...] }`.

- `id` — slug, `^[a-z0-9]+(?:-[a-z0-9]+)*$`, stable forever once set.
- `parentId` — an existing doc id to nest under, or `null`/omit for top-level.
- `blocks` — ordered list. Each block is a one-key object (bare strings become
  paragraphs):

| Spec | Renders as |
|------|-----------|
| `"some text"` or `{ "p": "…" }` | paragraph |
| `{ "h1": "…" }` / `{ "h2": "…" }` / `{ "h3": "…" }` | headings |
| `{ "quote": "…" }` / `{ "code": "…" }` | quote / code block |
| `{ "ul": ["a","b"] }` / `{ "ol": ["a","b"] }` | bullet / numbered list |
| `{ "bullet": "…" }` / `{ "numbered": "…" }` | single list item |
| `{ "divider": true }` | horizontal rule |
| `{ "beat": "…" }` | numbered beat marker (brass circle between rules; numbers auto-count page-wide) |
| `{ "hero": { "eyebrow","title","subtitle","tone" } }` | **lead banner** |
| `{ "cards": { "label","columns","items":[{eyebrow,title,body,tone}] } }` | **card grid** |
| `{ "swatch": { "label","colors":[{hex,name}] } }` | **color palette** |
| `{ "badges": { "label","items":[{label,tone}] } }` | colored badge row |
| `{ "tags": { "label","tone","items":[…] } }` | plain chip row |
| `{ "labeled": { "label","value","highlight","multiline" } }` | labeled value (highlight = amber callout) |
| `{ "status": { "label","value","tone" } }` | status chip |
| `{ "refs": { "label","items":["page-id",…] } }` | related-pages chip list (items are doc ids) |

**Tones** are validated by the driver (fail-fast with the allowed list):

- **hero** tone is `dark` \| `light` \| `accent` (its own palette — *not* the list below).
- **cards / badges / tags / status** tone is one of:
  `slate, green, yellow, orange, red, amber, purple, sky, blue`.

These mirror `HERO_TONES` in
`src/components/docs/widgets/RichWidgets.tsx` and `TONES` in
`src/lib/templates/types.ts`. If those lists change, update `driver.mjs`.

### What makes a page look professional

Lead with a **hero** (`accent` reads as a premium gradient, `dark` as a sleek
slate banner). Follow with a **badges** "at a glance" row. Use a 3-column
**cards** grid with per-card accent tones for pillars/zones/crew. Add one
highlighted **labeled** value as a design "north star." Close with a **swatch**
palette and a **tags** references row. The built-in `demo` page is a working
template of exactly this rhythm — copy its structure.

### Moment story pages

A "moment" page narrates one story beat (e.g. `the-child-prodigy`,
`the-crew-assembles`). These follow a canonical six-section stack — the same
one the website's UI seeds via the "Moment story" page style
(`src/lib/docs/momentScaffold.ts`):

1. **Tagline** — a `hero` (`tone: "dark"`, `eyebrow: "Moment"`).
2. **Sequence of Events** — `h2` + a `beat` marker before each paragraph of
   prose (beats auto-number; don't hand-number them).
3. **Purpose & Arc** — what story beat this moment serves, what it requires
   going in and makes true coming out.
4. **Characters & Motivations** — one `@mention` per character with what they
   want and what they won't do to get it, plus a `refs` widget.
5. **Tone & Pacing** — the emotional target and tempo, and where it pivots.
6. **Setting & Lore** — where it happens, what lore it depends on and
   establishes, `@mention`-ed, plus a `refs` widget.

Terse spec sketch (fill in the `…`):

```json
{ "blocks": [
  { "hero": { "eyebrow": "Moment", "title": "…", "subtitle": "…", "tone": "dark" } },
  { "h2": "Sequence of Events" },
  { "beat": "Opening image" }, { "p": "…" },
  { "beat": "Turn" }, { "p": "…" },
  { "beat": "Aftermath" }, { "p": "…" },
  { "h2": "Purpose & Arc" }, { "p": "…" },
  { "h2": "Characters & Motivations" },
  { "bullet": "@some-character — wants …, but will not …" },
  { "refs": { "label": "Characters", "items": ["some-character"] } },
  { "h2": "Tone & Pacing" }, { "p": "…" },
  { "h2": "Setting & Lore" }, { "p": "…ties to @some-lore-page…" },
  { "refs": { "label": "Lore & places", "items": ["some-lore-page"] } }
] }
```

## Verify the result renders (don't trust the JSON alone)

Author, then look at the actual page:

1. Start the dev server (config `dev` in `.claude/launch.json`) with the
   `preview_start` tool, or `npm run dev` and open `http://localhost:3000`.
2. Navigate to `/docs/<id>` and screenshot. The home route redirects to
   `/docs/overview`; doc pages live at `/docs/<id>`.
3. Confirm the hero/cards/swatch render as widgets (not literal JSON text) and
   check `preview_console_logs` for errors.

This is how the demo page above was verified — the `accent` hero, the green/sky/
purple badges, and the three pillar cards with green/red/amber accent bars all
rendered correctly.

## Gotchas

- **Markdown ≠ beautiful.** Calling `gamedoc_create_doc` directly with a
  markdown body (the obvious path the MCP's own description suggests) gives a
  page of plain text. The widgets require v2 block JSON. Always go through the
  driver's compiler, or hand-build `{"v":2,"blocks":[…]}`.
- **The doc page is the live editor, not a read-only view.** `/docs/<id>`
  mounts the editing UI (widgets show inline inputs/selects). That's expected —
  it still shows the real styled layout. There is no separate "published" view.
- **The open editor tab autosaves.** If a browser tab is open *on* the page you
  delete/replace via the MCP, its debounced autosave can write the old content
  back. Navigate the preview away (e.g. to `/docs/overview`) before deleting or
  re-creating that id. (This is why the verify/cleanup steps navigate away first.)
- **Resizing the preview reloads to `/docs/overview`.** After any
  `preview_resize`, re-navigate to `/docs/<id>` before screenshotting — set the
  viewport size *first*, then navigate, then capture.
- **`update` replaces the whole page**, not a patch — pass the complete block
  list every time. (The MCP's `gamedoc_update_doc` can patch single fields, but
  this driver always sends a full compiled body.)
- **Nested-JSON props are pre-escaped by the compiler.** Widget props like
  `cardsJson`/`badgesJson`/`swatchesJson` are *strings of JSON* inside the body
  JSON. Don't hand-edit the `raw` output; edit the spec and re-`create`.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `spawn EINVAL` | An earlier version spawned the `npx.cmd` shim with piped stdio (throws on Windows). The driver now runs `node mcp/node_modules/tsx/dist/cli.mjs` directly — re-pull the committed `driver.mjs`. |
| `Cannot find module 'D:\mcp\src\server.ts'` (root truncated) | `ROOT` mis-resolved. The skill dir is **3** levels under the repo root (`.claude/skills/create-game-design-page`); `driver.mjs` resolves `ROOT` with three `..`. |
| `Invalid tone "…"` | You used a tone outside the allowed set. The error lists the valid tones; hero tones differ from the rest (see the Tones note above). |
| `Doc "…" already exists` | Use `update` instead of `create`, or pick a new `id`. |
| `Parent "…" not found` | `parentId` must be an existing doc id — check `driver.mjs list`. |
| Page shows literal `{"v":2,...}` text | You stored markdown/raw text, not compiled JSON. Re-author through the driver. |
| MCP write seems lost | A live editor tab autosaved over it — close/navigate that tab, then redo. |

## Files

- [driver.mjs](.claude/skills/create-game-design-page/driver.mjs) — the harness:
  page-spec compiler + zero-dependency stdio MCP client + CLI.
- [example-spec.json](.claude/skills/create-game-design-page/example-spec.json) —
  a complete, working spec ("Emberfall") to copy from.
