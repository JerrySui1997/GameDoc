# GameDoc (`nightmare-docs`)

A collaborative game-design documentation app: a Next.js 15 / React 19 front end with a homegrown
block-based page editor and real-time multi-user editing over Yjs.

## Architecture at a glance

GameDoc runs as **two processes** — Next.js can't host a long-lived WebSocket under Turbopack, so the
collaboration relay runs alongside it:

| Process          | Command              | Purpose                                                            |
| ---------------- | -------------------- | ----------------------------------------------------------------- |
| Next.js app      | `npm run dev`        | SSR, REST API routes, the editor UI                               |
| Yjs collab relay | `npm run dev:collab` | WebSocket server ([server/collab.ts](server/collab.ts)) for live editing |

`src/data/docs/content.json` is the **canonical source of truth** (SSR, search, scripts, the MCP
server). The relay seeds each Yjs room from it and debounce-writes edits back. CRDT durability lives
in LevelDB at `~/.gamedoc/collab-db` (outside the repo).

## Quickstart

```bash
npm install
npm run dev:all   # app (:3000) + collab relay (:1234) together
```

Then open http://localhost:3000.

Copy `.env.example` → `.env.local` and set `NEXT_PUBLIC_COLLAB_URL` for LAN/remote access. It's a
build-time `NEXT_PUBLIC_*` var, so rebuild after changing it.

## Scripts

| Script               | What it does                                          |
| -------------------- | ---------------------------------------------------- |
| `npm run dev:all`    | App + collab relay together (dev)                    |
| `npm run dev`        | Next.js dev server only                              |
| `npm run dev:collab` | Collab WebSocket relay only                          |
| `npm run build`      | Production build (`next build`)                      |
| `npm run start`      | Serve the production build                           |
| `npm run typecheck`  | `tsc --noEmit`                                        |
| `npm run validate`   | Validate content (`scripts/validate-nightmares.ts`)  |
| `npm run crossref`   | Cross-reference audit (`scripts/crossref.ts`)        |

## Branches

| Branch    | Role                                                                          |
| --------- | ---------------------------------------------------------------------------- |
| `main`    | **Stable.** Protected; merge via PR with CI green. Releases tagged `v0.x.y`. |
| `develop` | **Iteration.** Day-to-day integration branch; the future auto-deploy target. |

Work on feature branches → PR into `develop`. Promote `develop` → `main` for a stable release.

## CI

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on every PR and push to `main`/`develop`:
install, typecheck, content validation, cross-reference audit, and a production build.
