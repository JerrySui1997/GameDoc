import { TemplateCollectionSchema, type PageTemplate } from '@/lib/templates/types';
import { readJsonCached, writeJsonFile } from '@/lib/store/json';
import { dataFile, userDataFile, workspaceDataFile } from '@/lib/store/paths';

// Server-only store for page templates. Mirrors the docs store: reads/writes a
// JSON collection under DATA_DIR through the shared atomic/serialized json store.

const CONTENT_FILE = dataFile('templates');

// Three scopes, matching the three workspace kinds (plans/06 Phase 3) — see
// docs/store.ts's DocsScope for the full rationale.
export type TemplatesScope = { userId: string } | { workspaceId: string } | undefined;

function resolveFile(scope: TemplatesScope): string {
  if (!scope) return CONTENT_FILE;
  return 'userId' in scope
    ? userDataFile(scope.userId, 'templates')
    : workspaceDataFile(scope.workspaceId, 'templates');
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
