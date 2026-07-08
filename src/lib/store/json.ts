import { promises as fs } from 'fs';
import path from 'path';

// ── Safe JSON file store ──────────────────────────────────────────────────
// Shared read/write primitives for the on-disk JSON collections (docs,
// templates, collections, …). Every store MUST write through writeJsonFile so
// concurrent saves can never corrupt a file.
//
// Two guarantees, both load-bearing:
//
//  1. Atomic writes. We write to a temp file in the same directory and then
//     rename it over the target. A rename is atomic on a single filesystem, so
//     a reader either sees the entire old file or the entire new file — never a
//     half-written one. (Node's fs.rename replaces the destination on both
//     POSIX and Windows.)
//
//  2. Serialized writes per path. Without this, two overlapping fs.writeFile
//     calls to the same path interleave their bytes and leave trailing garbage
//     after the valid JSON ("Unexpected non-whitespace character after JSON").
//     The debounced autosave makes that race easy to hit. We chain all writes
//     to a given path through a per-path promise queue so they run one at a
//     time, in order.

const writeQueues = new Map<string, Promise<unknown>>();

/**
 * Run `fn` after any in-flight operation queued under `key` settles;
 * serializes per key. Exported so callers with their own read-modify-write
 * sequences over a keyed resource (e.g. server/collab-core.ts's debounced
 * content.json write-back) can serialize a whole read+write cycle, not just
 * the final write — this store's own per-path key space (absolute file
 * paths) never collides with such callers' own key conventions.
 */
export function enqueue<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = writeQueues.get(key) ?? Promise.resolve();
  // Run `fn` regardless of whether the previous write resolved or rejected.
  const run = prev.then(fn, fn);
  // Keep the queue alive but swallow errors so one failure can't wedge it.
  writeQueues.set(key, run.then(() => undefined, () => undefined));
  return run;
}

/** Read and JSON-parse a file. Throws on missing file or invalid JSON. */
export async function readJsonFile(file: string): Promise<unknown> {
  const raw = await fs.readFile(file, 'utf8');
  return JSON.parse(raw);
}

// ── Cached, validated reads ─────────────────────────────────────────────────
// Reading + JSON-parsing + Zod-validating a collection on *every* SSR render is
// wasteful: the docs collection alone is ~95 KB / 40 nested pages, and the root
// layout re-reads all three on every full page load. Cache the fully-transformed
// (validated) value keyed by the file's mtime + size, so an unchanged file is
// served straight from memory.
//
// The mtime+size guard (one cheap stat) — rather than an in-process
// invalidation flag — is deliberate: in dev the collab relay writes content.json
// from a *separate* process, so we must notice out-of-band writes. On write the
// file's mtime changes, so the very next read re-validates automatically.
type CacheEntry = { mtimeMs: number; size: number; value: unknown };
const readCache = new Map<string, CacheEntry>();

/**
 * Like `readJsonFile` + `transform`, but memoized by the file's mtime+size.
 * `transform` (typically a Zod `.parse`) runs only when the file has changed.
 *
 * The returned value is shared across callers for a given file version, so it
 * MUST be treated as read-only. Array results are returned as a fresh shallow
 * copy (cheap) so callers can safely `push`/`sort`/`splice` the top level; their
 * *elements* are still shared, which suits this codebase's immutable
 * read → build-new → write pattern (elements are replaced, never mutated).
 */
export async function readJsonCached<T>(file: string, transform: (raw: unknown) => T): Promise<T> {
  const stat = await fs.stat(file).catch(() => null);
  if (!stat) {
    // Missing/unstattable — read directly so the caller sees the real ENOENT.
    return transform(JSON.parse(await fs.readFile(file, 'utf8')));
  }
  const hit = readCache.get(file);
  const value =
    hit && hit.mtimeMs === stat.mtimeMs && hit.size === stat.size
      ? (hit.value as T)
      : await (async () => {
          const parsed = transform(JSON.parse(await fs.readFile(file, 'utf8')));
          readCache.set(file, { mtimeMs: stat.mtimeMs, size: stat.size, value: parsed });
          return parsed;
        })();
  return Array.isArray(value) ? (([...value] as unknown) as T) : value;
}

/** Atomically and serially persist `data` as pretty-printed JSON to `file`. */
export async function writeJsonFile(file: string, data: unknown): Promise<void> {
  const body = `${JSON.stringify(data, null, 2)}\n`;
  await enqueue(file, async () => {
    const dir = path.dirname(file);
    // Per-user scoped paths (src/lib/store/paths.ts's userDataFile) don't
    // exist until a user's first write — recursive mkdir is a no-op when the
    // directory is already there, so this is free for every existing caller.
    await fs.mkdir(dir, { recursive: true });
    // Unique temp name so parallel callers never share a temp file. The
    // per-path queue already serializes, but this is cheap insurance.
    const tmp = path.join(dir, `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`);
    try {
      await fs.writeFile(tmp, body, 'utf8');
      await fs.rename(tmp, file);
    } catch (err) {
      // Best-effort cleanup of the temp file if the rename never happened.
      await fs.rm(tmp, { force: true }).catch(() => {});
      throw err;
    }
  });
}
