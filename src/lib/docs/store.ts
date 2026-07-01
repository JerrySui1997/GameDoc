import path from 'path';
import { DocCollectionSchema, type DocNode } from '@/lib/schema/doc';
import { readJsonFile, writeJsonFile } from '@/lib/store/json';

// Server-only store. Reads and writes the docs collection from disk so the
// in-browser editor can persist changes during development. Writes go through
// the shared atomic/serialized json store so concurrent autosaves can't corrupt
// the file.

const CONTENT_FILE = path.join(process.cwd(), 'src', 'data', 'docs', 'content.json');

/** Read and validate all docs from disk. */
export async function readDocs(): Promise<DocNode[]> {
  return DocCollectionSchema.parse(await readJsonFile(CONTENT_FILE));
}

/** Validate and persist the full docs collection to disk. */
export async function writeDocs(docs: DocNode[]): Promise<void> {
  await writeJsonFile(CONTENT_FILE, DocCollectionSchema.parse(docs));
}
