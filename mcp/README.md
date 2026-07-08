# GameDoc MCP

A small [MCP](https://modelcontextprotocol.io) server that exposes the
`nightmare-docs` website's content to AI/Claude as targeted tools — so you can
ask questions about (and author) your game design without pasting whole source
files into the chat. List/search tools return compact summaries; `get` tools
fetch one full record on demand. That keeps the context window (and your token
bill) small.

It reads the same data the website does — nightmare records (`src/data/nightmares`),
the docs tree, templates, collections, the glossary, and the controlled vocabulary —
reusing the project's own pure helpers, so it never drifts from the live source.

**Reads vs. writes:** nightmares, templates, and collections are read-only
(authored in code / the app). Docs are read-write — `create`/`update`/`delete`
tools persist through the project's atomic, schema-validated store, so writing
here is as safe as editing in the app. (The store guarantees no file corruption;
just don't drive the MCP and a live browser editor at the exact same moment, or
the later write wins.)

## Tools

| Tool | What it does |
| --- | --- |
| `gamedoc_list_nightmares` | Compact list of all nightmares (id, codename, tier, personality, teaches). |
| `gamedoc_get_nightmare` | Full design record for one nightmare by id (`t-01` …). |
| `gamedoc_search_nightmares` | Filter by tier / personality / evidence type / fearOfLight / free text. |
| `gamedoc_list_docs` | Indented outline of the docs tree (ids + titles, no bodies). |
| `gamedoc_get_doc` | One doc page as clean plain text (or `format:"raw"`). |
| `gamedoc_search_docs` | Full-text search across docs; returns ids + snippets. |
| `gamedoc_create_doc` | Create a doc page (body is markdown). |
| `gamedoc_update_doc` | Update a doc page; only the fields you pass change. |
| `gamedoc_delete_doc` | Delete a doc page; children are re-parented. |
| `gamedoc_glossary` | Evidence-type glossary definitions (all, or one term). |
| `gamedoc_vocabulary` | The controlled-vocabulary enums for authoring/validating records. |
| `gamedoc_list_templates` / `gamedoc_get_template` | Page templates. |
| `gamedoc_list_collections` / `gamedoc_get_collection` | Collections. |

## Setup

```bash
cd mcp
npm install
```

Smoke-test it boots and lists tools:

```bash
npm run inspect   # opens the MCP Inspector
```

## Register with a client

The server resolves the project root from its own file location, so the working
directory doesn't matter — an absolute path to `server.ts` is all a client needs.

### Claude Code

A project-scoped [`.mcp.json`](../.mcp.json) is already committed at the repo root,
so Claude Code picks it up automatically when run from `D:\GameDoc`. Or add it
explicitly:

```bash
claude mcp add gamedoc -- npx -y tsx D:\GameDoc\mcp\src\server.ts
```

### Claude Desktop

Add to `claude_desktop_config.json`
(`%APPDATA%\Claude\claude_desktop_config.json` on Windows):

```json
{
  "mcpServers": {
    "gamedoc": {
      "command": "npx",
      "args": ["-y", "tsx", "D:\\GameDoc\\mcp\\src\\server.ts"]
    }
  }
}
```

Then restart the app.

## Modes: local vs. live

By default (the `gamedoc` registration above) every tool reads and writes the
local repo checkout: `src/data/docs/content.json` on disk, plus this
machine's own collab relay for a page's body/title once its room exists.

Setting `GAMEDOC_APP_URL` switches every doc tool to a **different**,
distinctly-named registration — `gamedoc-live` in [`.mcp.json`](../.mcp.json)
— that reads and writes a *deployed* site instead (Railway, by default). This
is deliberately a separate MCP server registration, not an env var you flip
on the same one: local-vs-live is two different tool namespaces in Claude
Code (`mcp__gamedoc__*` vs `mcp__gamedoc-live__*`), so a "just testing
locally" edit can never land on production by accident. When live mode is
active, every mutating tool's title gets an `⚠ LIVE` prefix in Claude Code's
tool list as a second, visible confirmation before you call it.

Live mode still respects the same two write surfaces the app itself has:
tree metadata (`parentId`/`order`/`hue`) goes through the deployed site's
REST API; a page's title/body always goes through a live Yjs peer connection
to that page's actual collab room (never REST), because once a page has ever
been opened, its content is owned by that room — a raw file/REST write would
just get silently overwritten by the room's own next autosave. See
`mcp/src/collab.ts` and the mode-switch comment at the top of `mcp/src/data.ts`
for the full reasoning.

**Widget-drop guard:** `gamedoc_update_doc`'s `body` param accepts plain
markdown, but plain markdown can't represent widget blocks (`characterCard`,
`refs`, `hexelMap`, etc). In both modes, an update that would silently delete
existing widgets off a page is refused (naming the specific blocks) unless
you pass `dropWidgets:true`. Use `gamedoc_get_doc` with `format:"raw"` first
to get the full block JSON if you need to preserve widgets while editing.

**Auth:** the deployed site's mutation routes (`POST`/`PUT`/`PATCH`/`DELETE`
under `/api/docs`) are gated by a `GAMEDOC_AGENT_TOKEN` shared secret when one
is set server-side (see `.env.example`) — `gamedoc-live`'s `.mcp.json` entry
sends it via `${GAMEDOC_AGENT_TOKEN}` shell-env expansion, so export that
variable in the shell that launches Claude Code before using `gamedoc-live`.
**The `/collab` websocket itself is not gated** — the browser editor and this
live-write path both ride the same channel every visitor's browser already
uses, and a token baked into the public JS bundle wouldn't be a real secret
anyway. Real session auth for the whole site is a separate, bigger project.

## Layout

```
mcp/
  src/
    server.ts   tool definitions + stdio transport
    data.ts     loaders/dispatchers; mode switch + widget-drop guard live here
    collab.ts   Yjs peer client for live-mode body/title writes
    notify.ts   best-effort "AI agent is editing" presence signal
  package.json
  tsconfig.json
```

`GAMEDOC_ROOT` overrides the project root if you ever run the server from
outside the repo (local mode only — ignored once `GAMEDOC_APP_URL` is set).
