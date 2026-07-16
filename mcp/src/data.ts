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
//
// ── Local vs. live mode ──────────────────────────────────────────────────
// Setting GAMEDOC_APP_URL switches every doc read AND write to hit that
// deployed site's REST API instead of the local file — this is what the
// `gamedoc-live` MCP registration uses to edit a Railway deployment safely.
// loadDocs() itself is mode-aware (not just the writers) because every read
// tool, and updateDoc/deleteDoc's own "load current state" step, funnel
// through it — if only the writers switched, live-mode tools would silently
// read local content while writing remote content, and any before/after
// check (like the widget-drop guard below) would compare against the wrong
// baseline. Templates/collections have no write tools, so they stay
// local-only (see "out of scope" in the plan this implements).
//
// A page's *body/title* is never written directly to the remote REST API in
// live mode, even though the API technically accepts it: once a page has
// ever been opened, its content lives in a live Yjs room
// (server/collab-core.ts), and a REST/file write doesn't reach that room —
// the room's own next debounced write-back would silently overwrite the
// out-of-band change right back to the room's (older) state. So content
// writes go through collab.ts's writeDocViaCollab, which edits the live room
// itself using the same diff-based mutation helpers the browser editor uses.
// Tree-only fields (parentId/order/hue) have no such room and go through the
// body-preserving PATCH route.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { ALL_NIGHTMARES, getNightmareById } from '@/data/nightmares';
import { parseBody, blocksToPlainText, isWidgetBlock, serializeBlocks, parseLegend, makeBlockId, type WidgetBlock } from '@/lib/docs/blocks';
import { asScene, seedScene, serializeScene, makeAnnotation, makeTile, makeCell, clampBounds, TILE_ROLES, BOUNDS_MIN, BOUNDS_MAX, type HexelScene, type Annotation, type PaletteTile, type TileRole, type Vec3 } from '@/lib/hexel/types';
import { describeSequence, describeSpace, toOBJ, toPlanes, toSceneJSON } from '@/lib/hexel/scene';
import { buildDocTree, ancestorIds, DocNodeSchema, DocCollectionSchema, type DocNode, type DocTreeNode } from '@/lib/schema/doc';
import { writeJsonFile } from '@/lib/store/json';
import { GLOSSARY, EVIDENCE_TYPES, GLINT_VARIANTS, TEMP_VARIANTS, RELIABILITY_VALUES, PERSONALITY_VALUES, HUNT_READ_VALUES, HAUNT_READ_VALUES, STATE_VALUES, TOOLKIT } from '@/lib/schema/vocabulary';
import type { PageTemplate } from '@/lib/templates/types';
import type { Collection } from '@/lib/collections/types';
import { writeDocViaCollab, peekCollabRoom } from './collab.js';

// Project root is two levels up from this file (mcp/src/data.ts -> repo root),
// independent of the process working directory. Override with GAMEDOC_ROOT.
const ROOT = process.env.GAMEDOC_ROOT ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const dataFile = (...parts: string[]) => path.join(ROOT, 'src', 'data', ...parts);
const DOCS_FILE = dataFile('docs', 'content.json');

const APP_URL = process.env.GAMEDOC_APP_URL?.replace(/\/$/, '');
const COLLAB_URL = process.env.GAMEDOC_COLLAB_URL;
const AGENT_TOKEN = process.env.GAMEDOC_AGENT_TOKEN;

export const isLiveMode = (): boolean => Boolean(APP_URL);

function requireCollabUrl(): string {
  if (!COLLAB_URL) throw new Error('GAMEDOC_COLLAB_URL is required when GAMEDOC_APP_URL is set (live mode).');
  return COLLAB_URL;
}

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, 'utf8')) as T;
}

/** Fetch a path on the remote app, throwing with a readable message on any non-2xx. */
async function remoteFetch(pathname: string, init: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string> | undefined) };
  if (AGENT_TOKEN) headers.Authorization = `Bearer ${AGENT_TOKEN}`;
  const res = await fetch(`${APP_URL}${pathname}`, { ...init, headers });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`gamedoc-live: ${init.method ?? 'GET'} ${pathname} -> ${res.status}${body ? ` ${body}` : ''}`);
  }
  return res;
}

// ── Loaders ──────────────────────────────────────────────────────────────

/** All docs. Mode-aware: fetches the remote site's live content in live mode. */
export async function loadDocs(): Promise<DocNode[]> {
  if (!APP_URL) return readJson<DocNode[]>(DOCS_FILE);
  const res = await remoteFetch('/api/docs');
  return DocCollectionSchema.parse(await res.json());
}
export const loadTemplates = () => readJson<PageTemplate[]>(dataFile('templates', 'content.json'));
export const loadCollections = () => readJson<Collection[]>(dataFile('collections', 'content.json'));

// ── Writers ────────────────────────────────────────────────────────────────
// Local-mode persistence goes through the project's atomic + per-path-serialized
// store, so a write here can never corrupt the file the live editor also
// autosaves to. Validate the whole collection against the schema before it
// touches disk. Live-mode persistence is dispatched per-field below.

async function saveDocsLocal(docs: DocNode[]): Promise<void> {
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

/** Create a fully-assembled, already-validated doc. No room exists yet for a
 *  brand-new page, so writing its body straight to the store is safe — the
 *  first-ever open seeds the page's Yjs room correctly from this. */
export async function createDoc(doc: DocNode): Promise<DocNode> {
  if (APP_URL) {
    const res = await remoteFetch('/api/docs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(doc),
    });
    return DocNodeSchema.parse(await res.json());
  }
  const docs = await loadDocs();
  await saveDocsLocal([...docs, doc]);
  return doc;
}

export type DocPatch = Partial<Pick<DocNode, 'title' | 'body' | 'parentId' | 'order' | 'hue'>>;
export type UpdateResult = { ok: true; doc: DocNode } | { ok: false; error: string };

/** Widget block ids present in a stored body (identity, not content — an
 *  in-place prop edit that keeps every id is never flagged). */
function widgetBlockIds(body: string): Set<string> {
  return new Set(parseBody(body).filter(isWidgetBlock).map((b) => b.id));
}

/**
 * Refuses a body update that would silently drop existing widget blocks.
 * parseBody's plain-markdown fallback (used when `nextBody` isn't already the
 * app's own v2 JSON) can only emit prose blocks — never characterCard, refs,
 * hexelMap, etc — so a plain-markdown body update on a widget-bearing page
 * would otherwise delete every widget on it with no warning. Returns an error
 * string naming the specific block ids that would be lost, or null if the
 * update is safe (or explicitly confirmed via dropWidgets).
 */
function checkWidgetDrop(currentBody: string, nextBody: string, dropWidgets: boolean): string | null {
  if (dropWidgets) return null;
  const before = widgetBlockIds(currentBody);
  if (before.size === 0) return null;
  const after = widgetBlockIds(nextBody);
  const dropped = [...before].filter((id) => !after.has(id));
  if (!dropped.length) return null;
  return (
    `This update would drop ${dropped.length} existing widget block(s) (${dropped.join(', ')}). ` +
    `Fetch the page with format:"raw" to get the full v2 JSON, edit that, and resubmit — ` +
    `or pass dropWidgets:true to confirm this is intentional.`
  );
}

/**
 * Update an existing doc by id with a partial patch. Single point of
 * enforcement for both the widget-drop guard and the two-write-surface split
 * (title/body vs. tree metadata) — every doc-mutating tool that touches an
 * existing page's content (including gamedoc_annotate_space's hexel-scene
 * rewrite) routes through this function, in both local and live mode.
 */
export async function updateDoc(id: string, patch: DocPatch, opts: { dropWidgets?: boolean } = {}): Promise<UpdateResult> {
  const docs = await loadDocs();
  const current = docs.find((d) => d.id === id);
  if (!current) return { ok: false, error: `No doc "${id}".` };

  if (patch.parentId !== undefined && patch.parentId !== null) {
    if (patch.parentId === id) return { ok: false, error: 'A doc cannot be its own parent.' };
    if (!docs.some((d) => d.id === patch.parentId)) return { ok: false, error: `Parent "${patch.parentId}" not found.` };
  }

  if (patch.body !== undefined) {
    const dropError = checkWidgetDrop(current.body, patch.body, opts.dropWidgets ?? false);
    if (dropError) return { ok: false, error: dropError };
  }

  const merged: DocNode = { ...current };
  if (patch.title !== undefined) merged.title = patch.title;
  if (patch.body !== undefined) merged.body = patch.body;
  if (patch.parentId !== undefined) merged.parentId = patch.parentId;
  if (patch.order !== undefined) merged.order = patch.order;
  if (patch.hue !== undefined) merged.hue = patch.hue;

  const parsed = DocNodeSchema.safeParse(merged);
  if (!parsed.success) {
    const error = parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
    return { ok: false, error };
  }

  const hasContentChange = patch.title !== undefined || patch.body !== undefined;
  const hasTreeChange = patch.parentId !== undefined || patch.order !== undefined || patch.hue !== undefined;

  if (APP_URL) {
    // Content: always through the live Yjs room, never REST — see file header.
    if (hasContentChange) {
      await writeDocViaCollab(requireCollabUrl(), id, { title: patch.title, body: patch.body });
    }
    // Tree metadata: body-preserving PATCH, returns the merged doc directly.
    if (hasTreeChange) {
      const treePatch: Record<string, unknown> = {};
      if (patch.parentId !== undefined) treePatch.parentId = patch.parentId;
      if (patch.order !== undefined) treePatch.order = patch.order;
      if (patch.hue !== undefined) treePatch.hue = patch.hue;
      const res = await remoteFetch(`/api/docs/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(treePatch),
      });
      return { ok: true, doc: DocNodeSchema.parse(await res.json()) };
    }
    // Content-only: re-read, since the collab write doesn't return the doc.
    const fresh = (await loadDocs()).find((d) => d.id === id);
    return { ok: true, doc: fresh ?? parsed.data };
  }

  const next = docs.map((d) => (d.id === id ? parsed.data : d));
  await saveDocsLocal(next);
  return { ok: true, doc: parsed.data };
}

export type DeleteResult = { ok: true; reparentedChildren: string[]; liveRoomWarning?: string } | { ok: false; error: string };

/** Delete a doc by id, reparenting any children to its parent so none are
 *  orphaned. In live mode, non-blocking-warns (never blocks) if the page's
 *  live room has content — a Yjs peer can't tell "mid-keystroke" from
 *  "opened once last month," so the calling agent decides whether to check
 *  with the user first. */
export async function deleteDoc(id: string): Promise<DeleteResult> {
  const docs = await loadDocs();
  const target = docs.find((d) => d.id === id);
  if (!target) return { ok: false, error: `No doc "${id}".` };
  const reparentedChildren = docs.filter((d) => d.parentId === id).map((d) => d.id);

  if (APP_URL) {
    let liveRoomWarning: string | undefined;
    const peek = await peekCollabRoom(requireCollabUrl(), id);
    if (peek && peek.blockCount > 0) {
      liveRoomWarning = `This page's live room has ${peek.blockCount} block(s) and may be actively edited — confirm with the user before deleting if unsure.`;
    }
    await remoteFetch(`/api/docs/${id}`, { method: 'DELETE' });
    return { ok: true, reparentedChildren, liveRoomWarning };
  }

  const next = docs
    .filter((d) => d.id !== id)
    .map((d) => (d.parentId === id ? { ...d, parentId: target.parentId } : d));
  await saveDocsLocal(next);
  return { ok: true, reparentedChildren };
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

/** Re-serialize a page body with one hexelMap block's scene replaced. Every
 *  other block (including other widgets) passes through untouched — same
 *  block ids in, same block ids out, so this never trips the widget-drop
 *  guard in updateDoc. */
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

export { describeSequence };

/** Input for gamedoc_create_space: an initial palette (referenced by label,
 *  not minted id — the agent shouldn't need to know id-minting) and cells
 *  painted against it. Omitting both falls back to the same seedScene() a
 *  fresh widget insert in the editor uses, so "just give me a map" works. */
export type CreateSpaceInput = {
  title?: string;
  subtitle?: string;
  bounds?: Vec3;
  tiles?: { label: string; role: TileRole; color?: string; glyph?: string }[];
  cells?: { x: number; y: number; z: number; tile: string }[];
  locationName?: string;
  locationNotes?: string;
};

/** Build a fresh hexelMap widget block from create-space input. Returns any
 *  cell tile labels that didn't match a given tile so the caller can reject
 *  the call cleanly instead of silently dropping paint. */
export function buildHexelSpace(
  blockId: string,
  input: CreateSpaceInput,
): { block: WidgetBlock; scene: HexelScene; unknownTiles: string[] } {
  if (!input.tiles && !input.cells) {
    const scene = {
      ...seedScene(),
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.subtitle !== undefined ? { subtitle: input.subtitle } : {}),
      ...(input.bounds ? { bounds: clampBounds(input.bounds) } : {}),
      ...(input.locationName !== undefined || input.locationNotes !== undefined
        ? { location: { name: input.locationName ?? '', notes: input.locationNotes ?? '' } }
        : {}),
    };
    return { block: { id: blockId, type: 'hexelMap', props: { dataJson: serializeScene(scene) } }, scene, unknownTiles: [] };
  }

  const palette: PaletteTile[] = (input.tiles ?? []).map((t, i) => {
    const tile = makeTile(i, t.role);
    return { ...tile, label: t.label, color: t.color ?? tile.color, glyph: t.glyph ?? '' };
  });
  const byLabel = new Map(palette.map((p) => [p.label, p.id]));
  const unknownTiles: string[] = [];
  const cells = (input.cells ?? []).flatMap((c) => {
    const tileId = byLabel.get(c.tile);
    if (!tileId) { unknownTiles.push(c.tile); return []; }
    return [makeCell(c.x, c.y, c.z, tileId)];
  });

  const scene: HexelScene = {
    title: input.title ?? 'Hexel Map',
    subtitle: input.subtitle ?? '',
    bounds: clampBounds(input.bounds ?? { x: 24, y: 24, z: 8 }),
    palette,
    cells,
    annotations: [],
    sequence: [],
    location: { name: input.locationName ?? '', notes: input.locationNotes ?? '' },
    defaultRot: 0,
  };
  return { block: { id: blockId, type: 'hexelMap', props: { dataJson: serializeScene(scene) } }, scene, unknownTiles };
}

/** Append a new widget block to a doc's existing body (prose and any other
 *  blocks pass through untouched — same shape as momentScaffold's block-list
 *  building, just appending instead of replacing wholesale). */
export function insertBlock(body: string, block: WidgetBlock): string {
  return serializeBlocks([...parseBody(body), block], parseLegend(body));
}

export { describeSpace, makeAnnotation, makeBlockId, BOUNDS_MIN, BOUNDS_MAX, TILE_ROLES };
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
