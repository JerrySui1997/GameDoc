// Side-effect-only: populates process.env from .env.local for the standalone
// collab relay (server/collab.ts). That entry point never touches the `next`
// package, so it misses the .env.local loading Next's own bootstrap normally
// does as a side effect (see server/index.ts, which calls next({...}) before
// attachCollab and therefore doesn't need this). Must be the first import in
// any file that needs it, since collab-core.ts reads env vars at module-load
// time (e.g. COLLAB_DB_DIR).
try {
  process.loadEnvFile?.('.env.local');
} catch {
  // No .env.local present — fine, rely on whatever's already in the environment.
}
