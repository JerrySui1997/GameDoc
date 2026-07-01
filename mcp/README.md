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

## Layout

```
mcp/
  src/
    server.ts   tool definitions + stdio transport
    data.ts     loaders that reuse the website's own pure helpers
  package.json
  tsconfig.json
```

`GAMEDOC_ROOT` overrides the project root if you ever run the server from
outside the repo.
