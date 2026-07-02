# Tasks

## Active

- [ ] **Phase 2b: turn on Railway deploys** - code + artifacts are in place (`Dockerfile`, `railway.json`, merged `server/index.ts`, `.github/workflows/deploy.yml`). Remaining is dashboard wiring: create the Railway project from the repo, set env (`DATA_DIR=/data`, `COLLAB_DB_DIR=/data/collab-db`, `HOST=0.0.0.0`), attach a `/data` volume, enable auto-deploy on `develop`, and add the `RAILWAY_TOKEN` secret + `RAILWAY_SERVICE` variable for tag deploys. See README → Deploy.

## Waiting On

## Someday

- [ ] **Set branch protection on `main`** - require PRs + green CI before merge; quick GitHub Settings/API change, not yet applied

## Done

- [x] ~~Phase 2a: make the runtime data dir env-configurable (`DATA_DIR`) across the docs/collections/templates stores~~ (2026-07-02)
- [x] ~~Scaffold repo files (.gitignore, .env.example, README, CI workflow)~~ (2026-07-01)
- [x] ~~git init, initial commit, develop branch, v0.1.0 tag~~ (2026-07-01)
- [x] ~~Verify CI pipeline locally~~ (2026-07-01)
- [x] ~~Create & push private GitHub repo (JerrySui1997/GameDoc)~~ (2026-07-01)
