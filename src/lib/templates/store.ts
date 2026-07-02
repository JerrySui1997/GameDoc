import { TemplateCollectionSchema, type PageTemplate } from '@/lib/templates/types';
import { readJsonFile, writeJsonFile } from '@/lib/store/json';
import { dataFile } from '@/lib/store/paths';

// Server-only store for page templates. Mirrors the docs store: reads/writes a
// JSON collection under DATA_DIR through the shared atomic/serialized json store.

const CONTENT_FILE = dataFile('templates');

/** Read and validate all templates from disk. */
export async function readTemplates(): Promise<PageTemplate[]> {
  return TemplateCollectionSchema.parse(await readJsonFile(CONTENT_FILE));
}

/** Validate and persist the full template collection to disk. */
export async function writeTemplates(templates: PageTemplate[]): Promise<void> {
  await writeJsonFile(CONTENT_FILE, TemplateCollectionSchema.parse(templates));
}
