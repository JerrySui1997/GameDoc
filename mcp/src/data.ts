// Data access layer for the GameDoc MCP server.
//
// The website stores content in two shapes:
//   - Nightmares + vocabulary live as TypeScript modules under src/ (imported
//     directly here via the `@/*` path alias — these are pure data/constants).
//   - Docs, templates, and collections live as JSON seed files on disk (read
//     fresh on every call so the MCP always reflects the live source).
//
// We deliberately reuse the project's own pure, server-safe helpers
// (parseBody / blocksToPlainText, buildDocTree, ancestorIds) so the MCP can
// never drift from how the site itself interprets the data.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { ALL_NIGHTMARES, getNightmareById } from '@/data/nightmares';
import { parseBody, blocksToPlainText, isWidgetBlock, serializeBlocks, parseLegend, type WidgetBlock } from '@/lib/docs/blocks';
import { asScene, serializeScene, makeAnnotation, TILE_ROLES, type HexelScene, type Annotation, type Vec3 } from '@/lib/hexel/types';
import { describeSpace, toOBJ, toPlanes, toSceneJSON } from '@/lib/hexel/scene';
import { buildDocTree, ancestorIds, DocNodeSchema, DocCollectionSchema, type DocNode, type DocTreeNode } from '@/lib/schema/doc';
import { writeJsonFile } from '@/lib/store/json';
import { GLOSSARY, EVIDENCE_TYPES, GLINT_VARIANTS, TEMP_VARIANTS, RELIABILITY_VALUES, PERSONALITY_VALUES, HUNT_READ_VALUES, HAUNT_READ_VALUES, STATE_VALUES, TOOLKIT } from '@/lib/schema/vocabulary';
import type { PageTemplate } from '@/lib/templates/types';
import type { Collection } from '@/lib/collections/types';

// Project root is two levels up from this file (mcp/src/data.ts -> repo root),
// independent of the process working directory. Override with GAMEDOC_ROOT.
const ROOT = process.env.GAMEDOC_ROOT ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const dataFile = (...parts: string[]) => path.join(ROOT, 'src', 'data', ...parts);
const DOCS_FILE = dataFile('docs', 'content.json');

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, 'utf8')) as T;
}

// ── Loaders ──────────────────────────────────────────────────────────────

export const loadDocs = () => readJson<DocNode[]>(DOCS_FILE);
export const loadTemplates = () => readJson<PageTemplate[]>(dataFile('templates', 'content.json'));
export const loadCollections = () => readJson<Collection[]>(dataFile('collections', 'content.json'));

// ── Writers ────────────────────────────────────────────────────────────────
// Persist through the project's atomic + per-path-serialized store, so a write
// here can never corrupt the file the live editor also autosaves to. Validate
// the whole collection against the schema before it touches disk.

export async function saveDocs(docs: DocNode[]): Promise<void> {
  await writeJsonFile(DOCS_FILE, DocCollectionSchema.parse(docs));
}

/** Next sibling order under a parent (max + 1, or 0 if first). */
export function nextOrder(docs: DocNode[], parentId: string | null): number {
  const siblings = docs.filter((d) => d.parentId === parentId);
  return siblings.length ? Math.max(...siblings.map((d) => d.order)) + 1 : 0;
}

/** Validate one assembled doc node; returns the node or a flat error string. */
export function validateDoc(node: unknown): { ok: true; doc: DocNode } | { ok: false; error: string } {
  const parsed = DocNodeSchema.safeParse(node);
  if (parsed.success) return { ok: true, doc: parsed.data };
  const error = parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
  return { ok: false, error };
}

// ── Doc helpers ────────────────────────────────────────────────────────────

/** Extract human-readable plain text from a stored doc body (any legacy format). */
export function docToText(body: string): string {
  return blocksToPlainText(parseBody(body));
}

/** Render a doc tree as an indented, token-cheap outline. */
export function renderOutline(nodes: DocTreeNode[], depth = 0): string {
  const lines: string[] = [];
  for (const node of nodes) {
    lines.push(`${'  '.repeat(depth)}- ${node.id}: ${node.title}`);
    if (node.children.length) lines.push(renderOutline(node.children, depth + 1));
  }
  return lines.join('\n');
}

/** Breadcrumb of titles from root to the given doc (inclusive). */
export function docBreadcrumb(docs: DocNode[], id: string): string {
  const byId = new Map(docs.map((d) => [d.id, d]));
  const trail = [...ancestorIds(docs, id).reverse(), id];
  return trail
    .map((nid) => byId.get(nid)?.title ?? nid)
    .join(' › ');
}

// ── Hexel Map helpers ────────────────────────────────────────────────────────
// A hexelMap block stores raw paint; its meaning (spaces / features / relations)
// is *inferred* by the shared engine, so the MCP reads a place — not pixels — and
// can refine the inference by writing a sparse annotation, exactly as the editor
// does. Reuses src/lib/hexel/* so the agent and the website never diverge.

function parseDataJson(raw: unknown): unknown {
  if (typeof raw === 'string' && raw.trim()) {
    try { return JSON.parse(raw); } catch { return {}; }
  }
  return {};
}

/** Every hexelMap block on a page, decoded to a healed scene. */
export function docHexelScenes(body: string): { blockId: string; scene: HexelScene }[] {
  return parseBody(body)
    .filter((b): b is WidgetBlock => isWidgetBlock(b) && b.type === 'hexelMap')
    .map((b) => ({ blockId: b.id, scene: asScene(parseDataJson(b.props.dataJson)) }));
}

/** Re-serialize a page body with one hexelMap block's scene replaced. */
export function setHexelScene(body: string, blockId: string, scene: HexelScene): string {
  const blocks = parseBody(body).map((b) =>
    isWidgetBlock(b) && b.id === blockId ? { ...b, props: { ...b.props, dataJson: serializeScene(scene) } } : b,
  );
  return serializeBlocks(blocks, parseLegend(body));
}

/** Export a scene as a 3D OBJ (face-planes) or the native plane-list JSON. */
export function exportScene(scene: HexelScene, format: 'obj' | 'planes'): string {
  return format === 'obj' ? toOBJ(toPlanes(scene)) : JSON.stringify(toSceneJSON(scene));
}

export { describeSpace, makeAnnotation };
export type { HexelScene, Annotation, Vec3 };

// ── Vocabulary bundle (single object for the vocabulary tool) ───────────────

export const VOCABULARY = {
  evidenceTypes: EVIDENCE_TYPES,
  glintVariants: GLINT_VARIANTS,
  temperatureVariants: TEMP_VARIANTS,
  reliability: RELIABILITY_VALUES,
  personality: PERSONALITY_VALUES,
  huntReads: HUNT_READ_VALUES,
  hauntReads: HAUNT_READ_VALUES,
  states: STATE_VALUES,
  toolkit: TOOLKIT,
  // Hexel Map vocabularies are *open suggestions*, not closed enums — the
  // inference uses tile roles to segment, and proposes space/feature/relation
  // kinds, but custom kinds are first-class and pass straight through.
  hexel: {
    tileRoles: TILE_ROLES,
    spaceKinds: ['room', 'garden', 'corridor', 'hall', 'courtyard', 'building', 'cave', 'street', 'zone', 'threshold', 'pond'],
    featureKinds: ['chest', 'door', 'backdoor', 'altar', 'spawn', 'npc', 'lever', 'trap', 'prop'],
    relationKinds: ['connects', 'leads_to', 'contains', 'guards', 'overlooks', 'blocks', 'door'],
    note: 'kinds are open/extensible suggestions; custom kinds are valid',
  },
} as const;

export { ALL_NIGHTMARES, getNightmareById, buildDocTree, GLOSSARY };
export type { DocNode };
