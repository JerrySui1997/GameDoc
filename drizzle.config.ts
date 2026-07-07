import type { Config } from 'drizzle-kit';

// Dev-time-only config for `npx drizzle-kit generate` — points at the in-repo
// seed DB path, not the runtime DATA_DIR (which only the server process
// resolves via src/lib/store/paths.ts). Migrations are applied programmatically
// at server startup (server/migrate.ts), never via the drizzle-kit CLI in prod.
export default {
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: './src/data/auth.db',
  },
} satisfies Config;
