import { DocCollectionSchema, type DocNode } from '@/lib/schema/doc';
import { readJsonCached, writeJsonFile } from '@/lib/store/json';
import { dataFile, userDataFile } from '@/lib/store/paths';

// Server-only store. Reads and writes the docs collection from disk so the
// in-browser editor can persist changes. Writes go through the shared
// atomic/serialized json store so concurrent autosaves can't corrupt the file.
// The file lives under DATA_DIR (src/data in dev, a mounted volume in prod).

const CONTENT_FILE = dataFile('docs');

// Personal spaces (Step 5 of the accounts plan) pass { userId } to read/write
// a private per-user file instead of the legacy global one. Omitted entirely,
// every call site keeps today's behavior unchanged.
export type DocsScope = { userId: string } | undefined;

function resolveFile(scope: DocsScope): string {
  return scope ? userDataFile(scope.userId, 'docs') : CONTENT_FILE;
}

/** Read and validate all docs from disk (memoized by file mtime — see readJsonCached). */
export async function readDocs(scope?: DocsScope): Promise<DocNode[]> {
  const file = resolveFile(scope);
  try {
    return await readJsonCached(file, (raw) => DocCollectionSchema.parse(raw));
  } catch (err) {
    // A brand-new user's space has no file yet — an empty doc tree is a
    // normal starting state. The legacy global file missing is a real error.
    if (scope && (err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}

/** Validate and persist the full docs collection to disk. */
export async function writeDocs(docs: DocNode[], scope?: DocsScope): Promise<void> {
  await writeJsonFile(resolveFile(scope), DocCollectionSchema.parse(docs));
}
