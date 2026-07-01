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

/** Run `fn` after any in-flight write to `key` settles; serialize per key. */
function enqueue<T>(key: string, fn: () => Promise<T>): Promise<T> {
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

/** Atomically and serially persist `data` as pretty-printed JSON to `file`. */
export async function writeJsonFile(file: string, data: unknown): Promise<void> {
  const body = `${JSON.stringify(data, null, 2)}\n`;
  await enqueue(file, async () => {
    const dir = path.dirname(file);
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
