import { CollectionCollectionSchema, type Collection } from '@/lib/collections/types';
import { readJsonCached, writeJsonFile } from '@/lib/store/json';
import { dataFile } from '@/lib/store/paths';

// Server-only store for collections. Mirrors the docs/templates stores:
// reads/writes a validated JSON collection under DATA_DIR through the shared
// atomic/serialized json store so concurrent saves can't corrupt the file.

const CONTENT_FILE = dataFile('collections');

/** Read and validate all collections from disk (memoized by file mtime). */
export async function readCollections(): Promise<Collection[]> {
  return readJsonCached(CONTENT_FILE, (raw) => CollectionCollectionSchema.parse(raw));
}

/** Validate and persist the full collection list to disk. */
export async function writeCollections(collections: Collection[]): Promise<void> {
  await writeJsonFile(CONTENT_FILE, CollectionCollectionSchema.parse(collections));
}
