/**
 * backup-live.ts
 * Run: npm run backup-live
 *
 * Pulls every JSON collection (docs, collections, templates, boards) from the
 * LIVE server and writes it over the local src/data copies. The live store is
 * the single source of truth; the files this writes are passive
 * disaster-recovery backups — commit them to snapshot a restore point.
 *
 * All four collections are fetched and validated before anything is written,
 * so a failed or half-broken pull can never leave a partial backup behind.
 *
 * Not covered: board image binaries — those are on-disk files under DATA_DIR
 * on the Railway volume (src/lib/boards/images.ts), not part of boards
 * content.json.
 *
 * Env:
 *   GAMEDOC_LIVE_URL     base URL (default https://gamedoc-production.up.railway.app)
 *   GAMEDOC_AGENT_TOKEN  Bearer token; read from .env.local when not in the
 *                        environment (shells started before the token was
 *                        added don't have it — same workaround the MCP needs).
 */
import { promises as fs } from 'fs';
import path from 'path';
import { DocCollectionSchema } from '../src/lib/schema/doc';
import { writeJsonFile } from '../src/lib/store/json';
import { dataFile } from '../src/lib/store/paths';

const BASE_URL = (process.env.GAMEDOC_LIVE_URL || 'https://gamedoc-production.up.railway.app').replace(/\/$/, '');

// Which collections to back up, and how strictly each is validated. Docs get
// the full Zod parse because content.json seeds the collab relay — writing a
// malformed tree there would poison a later restore. The rest just have to be
// arrays (their schemas live behind API routes that already validate writes).
const COLLECTIONS: { name: string; validate: (raw: unknown) => unknown }[] = [
  { name: 'docs', validate: (raw) => DocCollectionSchema.parse(raw) },
  { name: 'collections', validate: assertArray },
  { name: 'templates', validate: assertArray },
  { name: 'boards', validate: assertArray },
];

function assertArray(raw: unknown): unknown {
  if (!Array.isArray(raw)) throw new Error(`expected a JSON array, got ${typeof raw}`);
  return raw;
}

async function agentToken(): Promise<string | undefined> {
  if (process.env.GAMEDOC_AGENT_TOKEN) return process.env.GAMEDOC_AGENT_TOKEN;
  try {
    const envFile = await fs.readFile(path.join(process.cwd(), '.env.local'), 'utf8');
    const line = envFile.split(/\r?\n/).find((l) => l.startsWith('GAMEDOC_AGENT_TOKEN='));
    return line?.slice('GAMEDOC_AGENT_TOKEN='.length).trim().replace(/^["']|["']$/g, '') || undefined;
  } catch {
    return undefined;
  }
}

async function fetchCollection(name: string, token: string | undefined): Promise<unknown> {
  const res = await fetch(`${BASE_URL}/api/${name}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`GET /api/${name} → ${res.status} ${res.statusText}`);
  return res.json();
}

async function main(): Promise<void> {
  const token = await agentToken();
  if (!token) {
    console.warn('⚠ No GAMEDOC_AGENT_TOKEN found — proceeding without auth (fails if the site password gate is on).');
  }
  console.log(`Backing up ${BASE_URL} → local src/data\n`);

  // Fetch + validate everything before writing anything.
  const pulled = await Promise.all(
    COLLECTIONS.map(async ({ name, validate }) => {
      const data = validate(await fetchCollection(name, token));
      return { name, data };
    }),
  );

  for (const { name, data } of pulled) {
    const file = dataFile(name);
    await writeJsonFile(file, data);
    const count = Array.isArray(data) ? data.length : '?';
    console.log(`  ${name.padEnd(12)} ${String(count).padStart(4)} items → ${path.relative(process.cwd(), file)}`);
  }

  console.log('\nDone. Commit the changed files to snapshot this restore point.');
}

main().catch((err) => {
  console.error(`\nBackup aborted — nothing was written unless listed above.\n${err}`);
  process.exit(1);
});
