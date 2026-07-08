// ── Auth DB migrations ──────────────────────────────────────────────────────
// Applies the committed drizzle/ SQL migrations to auth.db on every boot.
// migrate() tracks applied migrations in a __drizzle_migrations table and
// no-ops when none are pending, so this is safe to call unconditionally
// alongside ensureSeed() — both fresh volumes and redeploys just work.

import path from 'path';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { db } from '@/db/client';

const MIGRATIONS_FOLDER = path.join(process.cwd(), 'drizzle');

export async function ensureAuthDb(): Promise<void> {
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
}
