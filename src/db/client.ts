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

const sqlite = new Database(AUTH_DB_FILE);
sqlite.pragma('journal_mode = WAL');

export const db = drizzle(sqlite, { schema });

// Synchronous and idempotent (tracks applied migrations in its own table), so
// running it unconditionally at import time keeps auth.db up to date in every
// context that touches it — plain `next dev` included, which never goes
// through server/index.ts's explicit ensureAuthDb() boot step.
migrate(db, { migrationsFolder: path.join(process.cwd(), 'drizzle') });
