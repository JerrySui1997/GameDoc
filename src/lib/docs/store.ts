import { DocCollectionSchema, type DocNode } from '@/lib/schema/doc';
import { readJsonFile, writeJsonFile } from '@/lib/store/json';
import { dataFile } from '@/lib/store/paths';

// Server-only store. Reads and writes the docs collection from disk so the
// in-browser editor can persist changes. Writes go through the shared
// atomic/serialized json store so concurrent autosaves can't corrupt the file.
// The file lives under DATA_DIR (src/data in dev, a mounted volume in prod).

const CONTENT_FILE = dataFile('docs');

/** Read and validate all docs from disk. */
export async function readDocs(): Promise<DocNode[]> {
  return DocCollectionSchema.parse(await readJsonFile(CONTENT_FILE));
}

/** Validate and persist the full docs collection to disk. */
export async function writeDocs(docs: DocNode[]): Promise<void> {
  await writeJsonFile(CONTENT_FILE, DocCollectionSchema.parse(docs));
}
