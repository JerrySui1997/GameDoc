import { TemplateCollectionSchema, type PageTemplate } from '@/lib/templates/types';
import { readJsonCached, writeJsonFile } from '@/lib/store/json';
import { dataFile, userDataFile } from '@/lib/store/paths';

// Server-only store for page templates. Mirrors the docs store: reads/writes a
// JSON collection under DATA_DIR through the shared atomic/serialized json store.

const CONTENT_FILE = dataFile('templates');

// Personal spaces (Step 5 of the accounts plan) pass { userId } to read/write
// a private per-user file instead of the legacy global one. Omitted entirely,
// every call site keeps today's behavior unchanged.
export type TemplatesScope = { userId: string } | undefined;

function resolveFile(scope: TemplatesScope): string {
  return scope ? userDataFile(scope.userId, 'templates') : CONTENT_FILE;
}

/** Read and validate all templates from disk (memoized by file mtime). */
export async function readTemplates(scope?: TemplatesScope): Promise<PageTemplate[]> {
  const file = resolveFile(scope);
  try {
    return await readJsonCached(file, (raw) => TemplateCollectionSchema.parse(raw));
  } catch (err) {
    if (scope && (err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}

/** Validate and persist the full template collection to disk. */
export async function writeTemplates(
  templates: PageTemplate[],
  scope?: TemplatesScope,
): Promise<void> {
  await writeJsonFile(resolveFile(scope), TemplateCollectionSchema.parse(templates));
}
