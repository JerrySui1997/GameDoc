import { TemplateCollectionSchema, type PageTemplate } from '@/lib/templates/types';
import { readJsonCached, writeJsonFile } from '@/lib/store/json';
import { dataFile } from '@/lib/store/paths';

// Server-only store for page templates. Mirrors the docs store: reads/writes a
// JSON collection under DATA_DIR through the shared atomic/serialized json store.

const CONTENT_FILE = dataFile('templates');

/** Read and validate all templates from disk (memoized by file mtime). */
export async function readTemplates(): Promise<PageTemplate[]> {
  return readJsonCached(CONTENT_FILE, (raw) => TemplateCollectionSchema.parse(raw));
}

/** Validate and persist the full template collection to disk. */
export async function writeTemplates(templates: PageTemplate[]): Promise<void> {
  await writeJsonFile(CONTENT_FILE, TemplateCollectionSchema.parse(templates));
}
