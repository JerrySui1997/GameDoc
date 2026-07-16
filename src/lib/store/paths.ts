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

/** Absolute path to a per-user collection's content.json under DATA_DIR. */
export function userDataFile(userId: string, collection: string): string {
  return path.join(DATA_DIR, 'users', userId, collection, 'content.json');
}

// ── Custom workspaces (plans/06-multi-workspace-dashboard.md Phase 3) ──────
// A freshly-created (`kind: 'custom'`) workspace's content.json. The flagship
// and personal schemes above are untouched by design (see Phase 0's "why the
// migration can be additive") — this is a third case, not a replacement.

/** Absolute path to a custom workspace's collection content.json under DATA_DIR. */
export function workspaceDataFile(workspaceId: string, collection: string): string {
  return path.join(DATA_DIR, 'workspaces', workspaceId, collection, 'content.json');
}
