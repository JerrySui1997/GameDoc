// ── First-boot seeding ─────────────────────────────────────────────────────
// A fresh production volume (DATA_DIR) starts empty. Copy the JSON collections
// baked into the image (the in-repo src/data snapshot) into the volume the
// first time each is missing, so a new deploy comes up with real content
// instead of failing to read. A no-op when DATA_DIR is the in-repo path (dev).

import { promises as fs } from 'fs';
import path from 'path';
import { DATA_DIR, dataFile } from '@/lib/store/paths';

const SEED_DIR = path.join(process.cwd(), 'src', 'data');
const COLLECTIONS = ['docs', 'collections', 'templates'] as const;

export async function ensureSeed(): Promise<void> {
  // In dev the data already lives at the seed path — nothing to copy.
  if (path.resolve(DATA_DIR) === path.resolve(SEED_DIR)) return;

  for (const name of COLLECTIONS) {
    const target = dataFile(name);
    try {
      await fs.access(target);
      continue; // already present on the volume
    } catch {
      // missing — seed it below
    }
    const source = path.join(SEED_DIR, name, 'content.json');
    try {
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.copyFile(source, target);
      console.log(`[seed] initialized ${name} → ${target}`);
    } catch (err) {
      console.error(`[seed] failed to seed ${name}:`, err);
    }
  }
}
