import fs from 'fs';
import os from 'os';
import path from 'path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema';

// Deliberately NOT under DATA_DIR/src/data in dev — WAL mode's -wal/-shm
// sidecar files churn on every write, and this repo has already hit a
// Turbopack dev-watcher panic once from an embedded DB's lock file living
// inside the watched tree (see y-leveldb/COLLAB_DB_DIR). Same fix: default
// outside the project root, override via env var for the mounted volume in
// production.
export const AUTH_DB_FILE =
  process.env.AUTH_DB_PATH || path.join(os.homedir(), '.gamedoc', 'auth.db');

// Unlike y-leveldb (which creates its directory tree on open), better-sqlite3
// requires the parent directory to already exist — it throws otherwise. A
// fresh checkout with no prior ~/.gamedoc/ (CI, a clean dev machine, a fresh
// Railway volume) hits this the first time anything imports this module,
// including `next build`'s page-data collection for auth-gated routes.
fs.mkdirSync(path.dirname(AUTH_DB_FILE), { recursive: true });

const sqlite = new Database(AUTH_DB_FILE);
sqlite.pragma('journal_mode = WAL');

export const db = drizzle(sqlite, { schema });

// Synchronous and idempotent (tracks applied migrations in its own table), so
// running it unconditionally at import time keeps auth.db up to date in every
// context that touches it — plain `next dev` included, which never goes
// through server/index.ts's explicit ensureAuthDb() boot step.
//
// Skipped during `next build` itself: page-data collection imports this module
// from several parallel workers, and they'd all race to CREATE TABLE against
// the same file (fine when it doesn't exist yet, a "table already exists"
// build failure when a prior deploy's volume already has it). The production
// boot path runs migrate() explicitly and serially via ensureAuthDb() instead.
if (process.env.NEXT_PHASE !== 'phase-production-build') {
  migrate(db, { migrationsFolder: path.join(process.cwd(), 'drizzle') });
}
