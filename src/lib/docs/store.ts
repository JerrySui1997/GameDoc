import { DocCollectionSchema, type DocNode } from '@/lib/schema/doc';
import { readJsonCached, writeJsonFile } from '@/lib/store/json';
import { dataFile, userDataFile, workspaceDataFile } from '@/lib/store/paths';

// Server-only store. Reads and writes the docs collection from disk so the
// in-browser editor can persist changes. Writes go through the shared
// atomic/serialized json store so concurrent autosaves can't corrupt the file.
// The file lives under DATA_DIR (src/data in dev, a mounted volume in prod).

const CONTENT_FILE = dataFile('docs');

// Three scopes, matching the three workspace kinds (plans/06 Phase 3): omitted
// entirely is the legacy/flagship global file; { userId } is a personal space
// (Step 5 of the accounts plan); { workspaceId } is a custom workspace. Each
// existing case's callers and resolved file are untouched by this — it's an
// added case, not a rename (see Phase 0's "why the migration can be additive").
export type DocsScope = { userId: string } | { workspaceId: string } | undefined;

function resolveFile(scope: DocsScope): string {
  if (!scope) return CONTENT_FILE;
  return 'userId' in scope ? userDataFile(scope.userId, 'docs') : workspaceDataFile(scope.workspaceId, 'docs');
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
