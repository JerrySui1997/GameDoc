import path from 'path';

// ── Data directory ─────────────────────────────────────────────────────────
// Root for every runtime-mutable JSON collection (docs, collections,
// templates). In dev these live in-repo under src/data; in production set
// DATA_DIR to a mounted persistent volume (e.g. /data on Railway) so edits made
// through the editor and API survive redeploys. Mirrors the COLLAB_DB_DIR knob
// the collab relay already uses for its LevelDB.

export const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'src', 'data');

/** Absolute path to a named collection's content.json under DATA_DIR. */
export function dataFile(collection: string): string {
  return path.join(DATA_DIR, collection, 'content.json');
}
