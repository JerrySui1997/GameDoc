# Tasks

## Active

## Waiting On

## Someday

- [ ] **Set branch protection on `main`** - require PRs + green CI before merge; quick GitHub Settings/API change, not yet applied
- [ ] **Phase 2a: run stable + iteration locally side-by-side** - make the content file path env-configurable in `src/lib/docs/store.ts` (mirrors the existing `COLLAB_DB_DIR` pattern), then run two instances on separate ports with separate content files
- [ ] **Phase 2b: pick a deploy host and wire auto-deploy** - `develop` → auto-deploy, `main` → deploy on tag; data model (per-env volume persistence) already decided, only the host (Railway recommended) is still open

## Done

- [x] ~~Scaffold repo files (.gitignore, .env.example, README, CI workflow)~~ (2026-07-01)
- [x] ~~git init, initial commit, develop branch, v0.1.0 tag~~ (2026-07-01)
- [x] ~~Verify CI pipeline locally~~ (2026-07-01)
- [x] ~~Create & push private GitHub repo (JerrySui1997/GameDoc)~~ (2026-07-01)
