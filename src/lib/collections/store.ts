import { CollectionCollectionSchema, type Collection } from '@/lib/collections/types';
import { readJsonCached, writeJsonFile } from '@/lib/store/json';
import { dataFile, userDataFile } from '@/lib/store/paths';

// Server-only store for collections. Mirrors the docs/templates stores:
// reads/writes a validated JSON collection under DATA_DIR through the shared
// atomic/serialized json store so concurrent saves can't corrupt the file.

const CONTENT_FILE = dataFile('collections');

// Personal spaces (Step 5 of the accounts plan) pass { userId } to read/write
// a private per-user file instead of the legacy global one. Omitted entirely,
// every call site keeps today's behavior unchanged.
export type CollectionsScope = { userId: string } | undefined;

function resolveFile(scope: CollectionsScope): string {
  return scope ? userDataFile(scope.userId, 'collections') : CONTENT_FILE;
}

/** Read and validate all collections from disk (memoized by file mtime). */
export async function readCollections(scope?: CollectionsScope): Promise<Collection[]> {
  const file = resolveFile(scope);
  try {
    return await readJsonCached(file, (raw) => CollectionCollectionSchema.parse(raw));
  } catch (err) {
    if (scope && (err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}

/** Validate and persist the full collection list to disk. */
export async function writeCollections(
  collections: Collection[],
  scope?: CollectionsScope,
): Promise<void> {
  await writeJsonFile(resolveFile(scope), CollectionCollectionSchema.parse(collections));
}
