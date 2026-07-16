#!/usr/bin/env -S npx tsx
// GameDoc MCP server — a token-efficient window onto the nightmare-docs website.
//
// Purpose: let AI/Claude answer questions about the game-design content without
// ingesting whole source files. List/search tools return compact summaries;
// `get` tools return one full record on demand. This keeps context small and
// cheap.
//
// Nightmares, templates, and collections are READ-ONLY here (authored in code /
// the website). Docs are READ-WRITE: create/update/delete tools persist through
// the project's atomic, schema-validated store, so writing here is as safe as
// editing in the app.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import {
  ALL_NIGHTMARES,
  getNightmareById,
  loadDocs,
  loadTemplates,
  loadCollections,
  createDoc,
  updateDoc,
  deleteDoc,
  nextOrder,
  validateDoc,
  buildDocTree,
  renderOutline,
  docToText,
  docBreadcrumb,
  GLOSSARY,
  VOCABULARY,
  docHexelScenes,
  setHexelScene,
  exportScene,
  describeSequence,
  describeSpace,
  makeAnnotation,
  buildHexelSpace,
  insertBlock,
  BOUNDS_MIN,
  BOUNDS_MAX,
  makeBlockId,
  TILE_ROLES,
} from './data.js';
import { notifyStart, notifyCommit, installStopOnExit } from './notify.js';

// GAMEDOC_LIVE=1 (set by the .mcp.json "gamedoc-live" registration) means
// this server's writes land on a deployed site, not the local repo — every
// mutating tool's title gets an unmistakable prefix so it's never confused
// for the local "gamedoc" tools in Claude Code's tool list.
const LIVE = process.env.GAMEDOC_LIVE === '1';
const liveTitle = (title: string) => (LIVE ? `⚠ LIVE: ${title}` : title);

const server = new McpServer({ name: 'gamedoc', version: '0.1.0' });

const READ_ONLY = { readOnlyHint: true, openWorldHint: false } as const;

/** Compact JSON text response (no pretty-printing — saves tokens). */
function json(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value) }] };
}
/** Plain-text response. */
function text(value: string) {
  return { content: [{ type: 'text' as const, text: value }] };
}
/** Error response with an actionable hint. */
function fail(message: string) {
  return { content: [{ type: 'text' as const, text: message }], isError: true };
}

/** Case-insensitive substring search returning a context snippet, or null. */
function snippet(haystack: string, needle: string, pad = 60): string | null {
  const i = haystack.toLowerCase().indexOf(needle.toLowerCase());
  if (i === -1) return null;
  const start = Math.max(0, i - pad);
  const end = Math.min(haystack.length, i + needle.length + pad);
  return (start > 0 ? '…' : '') + haystack.slice(start, end).replace(/\s+/g, ' ').trim() + (end < haystack.length ? '…' : '');
}

// ── Nightmares ───────────────────────────────────────────────────────────

server.registerTool(
  'gamedoc_list_nightmares',
  {
    title: 'List nightmares',
    description: 'Compact list of every nightmare (creature design record) in teaching-ladder order. Returns id, codename, tier, personality, and what it teaches. Use this for an overview, then gamedoc_get_nightmare for full detail.',
    inputSchema: {},
    annotations: READ_ONLY,
  },
  async () =>
    json(
      ALL_NIGHTMARES.map((n) => ({
        id: n.id,
        codename: n.codename,
        tier: n.tier,
        personality: n.personality,
        teaches: n.teaches,
      })),
    ),
);

server.registerTool(
  'gamedoc_get_nightmare',
  {
    title: 'Get nightmare',
    description: 'Full design record for one nightmare by id (e.g. "t-01"): evidence, hunt/haunt reads, signature mechanic, capture, fail scenario, and persona contract.',
    inputSchema: { id: z.string().describe('Nightmare id in t-XX format, e.g. "t-03".') },
    annotations: READ_ONLY,
  },
  async ({ id }) => {
    const record = getNightmareById(id);
    if (!record) {
      return fail(`No nightmare "${id}". Valid ids: ${ALL_NIGHTMARES.map((n) => n.id).join(', ')}.`);
    }
    return json(record);
  },
);

server.registerTool(
  'gamedoc_search_nightmares',
  {
    title: 'Search nightmares',
    description: 'Filter nightmares by structured fields and/or a free-text query (matched across codename, teaches, signature, states, capture, failLooksLike). Returns compact matches; follow up with gamedoc_get_nightmare.',
    inputSchema: {
      query: z.string().optional().describe('Free-text search across the record text fields.'),
      tier: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal('2-3')]).optional().describe('Exact tier match.'),
      personality: z.enum(['SHY', 'MISCHIEF', 'AGGRESSIVE']).optional(),
      evidenceType: z.enum(['Glint', 'Marking', 'Echo', 'Temperature', 'Distortion', 'Frequency', 'Haunt', 'Hunt']).optional().describe('Only nightmares whose evidence includes this type.'),
      fearOfLight: z.boolean().optional(),
    },
    annotations: READ_ONLY,
  },
  async ({ query, tier, personality, evidenceType, fearOfLight }) => {
    const q = query?.toLowerCase();
    const matches = ALL_NIGHTMARES.filter((n) => {
      if (tier !== undefined && n.tier !== tier) return false;
      if (personality && n.personality !== personality) return false;
      if (fearOfLight !== undefined && n.fearOfLight !== fearOfLight) return false;
      if (evidenceType && !n.evidence.some((e) => e.type === evidenceType)) return false;
      if (q) {
        const hay = [n.codename, n.teaches, n.signature, n.states, n.capture, n.failLooksLike].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    return json(
      matches.map((n) => ({ id: n.id, codename: n.codename, tier: n.tier, personality: n.personality, teaches: n.teaches })),
    );
  },
);

// ── Docs ─────────────────────────────────────────────────────────────────

server.registerTool(
  'gamedoc_list_docs',
  {
    title: 'List docs (outline)',
    description: 'Indented outline of the documentation tree — id and title only, no body. The cheapest way to see the whole site structure before fetching a page with gamedoc_get_doc.',
    inputSchema: {},
    annotations: READ_ONLY,
  },
  async () => {
    const docs = await loadDocs();
    return text(renderOutline(buildDocTree(docs)) || '(no docs)');
  },
);

server.registerTool(
  'gamedoc_get_doc',
  {
    title: 'Get doc page',
    description: 'One documentation page by id. Default returns readable plain text (widgets/dividers stripped); pass format="raw" for the stored body string verbatim — use "raw" before editing a page that may have widgets (characterCard, refs, hexelMap, etc), since that\'s the only format that shows them.',
    inputSchema: {
      id: z.string().describe('Doc slug id, e.g. "core-concepts".'),
      format: z.enum(['text', 'raw']).default('text').describe('"text" (default) = clean plain text; "raw" = stored body string.'),
    },
    annotations: READ_ONLY,
  },
  async ({ id, format }) => {
    const docs = await loadDocs();
    const doc = docs.find((d) => d.id === id);
    if (!doc) {
      return fail(`No doc "${id}". Use gamedoc_list_docs to see valid ids.`);
    }
    const body = format === 'raw' ? doc.body : docToText(doc.body);
    return text(`# ${doc.title}\n(${docBreadcrumb(docs, id)})\n\n${body}`);
  },
);

server.registerTool(
  'gamedoc_search_docs',
  {
    title: 'Search docs',
    description: 'Full-text search across all documentation pages (titles + extracted body text). Returns matching id, title, and a snippet; fetch the full page with gamedoc_get_doc.',
    inputSchema: {
      query: z.string().describe('Text to search for (case-insensitive).'),
      limit: z.number().int().positive().max(50).default(10),
    },
    annotations: READ_ONLY,
  },
  async ({ query, limit }) => {
    const docs = await loadDocs();
    const results: Array<{ id: string; title: string; snippet: string }> = [];
    for (const doc of docs) {
      const inTitle = doc.title.toLowerCase().includes(query.toLowerCase());
      const snip = snippet(docToText(doc.body), query);
      if (inTitle || snip) {
        results.push({ id: doc.id, title: doc.title, snippet: snip ?? '(title match)' });
        if (results.length >= limit) break;
      }
    }
    return json(results);
  },
);

// ── Docs (write) ─────────────────────────────────────────────────────────
// Bodies accept plain markdown — the website's parser turns `#`, `-`, `1.`,
// `>` into the matching block types — so you can author a page as markdown text
// and don't need to hand-write the v2 block JSON. Caveat: a markdown body
// REPLACES the whole body. If the page has widget blocks (characterCard,
// refs, hexelMap, etc — check with gamedoc_get_doc format:"raw" first), a
// plain-markdown update that doesn't already contain them will be refused
// unless you pass dropWidgets:true.

server.registerTool(
  'gamedoc_create_doc',
  {
    title: liveTitle('Create doc page'),
    description: 'Create a new documentation page. The body is plain markdown (headings, bullets, numbered lists, quotes are parsed into blocks). Fails if the id already exists — use gamedoc_update_doc to edit.',
    inputSchema: {
      id: z.string().describe('Stable slug id, e.g. "new-miri". Lowercase letters, numbers, hyphens.'),
      title: z.string().describe('Page title shown in the tree.'),
      body: z.string().default('').describe('Page content as markdown.'),
      parentId: z.string().nullable().optional().describe('Parent doc id, or null/omit for a top-level page.'),
      order: z.number().int().nonnegative().optional().describe('Sort order among siblings; defaults to last.'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  async ({ id, title, body, parentId, order }) => {
    const docs = await loadDocs();
    if (docs.some((d) => d.id === id)) return fail(`Doc "${id}" already exists. Use gamedoc_update_doc to edit it.`);
    const parent = parentId ?? null;
    if (parent && !docs.some((d) => d.id === parent)) return fail(`Parent "${parent}" not found. Use gamedoc_list_docs for valid ids.`);
    const result = validateDoc({ id, title, parentId: parent, order: order ?? nextOrder(docs, parent), body });
    if (!result.ok) return fail(`Invalid doc — ${result.error}`);
    await notifyStart(id);
    const doc = await createDoc(result.doc);
    await notifyCommit('created', id, doc);
    return json({ action: 'created', doc });
  },
);

server.registerTool(
  'gamedoc_update_doc',
  {
    title: liveTitle('Update doc page'),
    description: 'Update an existing doc page by id. Only the fields you pass change; omit the rest. Pass parentId:null to move a page to the top level. Body is plain markdown.',
    inputSchema: {
      id: z.string().describe('Id of the page to update.'),
      title: z.string().optional(),
      body: z.string().optional().describe('Replacement body as markdown (pass "" to clear).'),
      parentId: z.string().nullable().optional().describe('New parent id, or null for top-level. Omit to keep current.'),
      order: z.number().int().nonnegative().optional(),
      dropWidgets: z.boolean().default(false).describe('Confirm that this body update may remove existing widget blocks (characterCard, refs, hexelMap, etc). Required if the new body would drop any — see the error for which ones.'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ id, title, body, parentId, order, dropWidgets }) => {
    if (parentId === id) return fail('A doc cannot be its own parent.');
    await notifyStart(id);
    const result = await updateDoc(id, { title, body, parentId, order }, { dropWidgets });
    if (!result.ok) return fail(result.error);
    await notifyCommit('updated', id, result.doc);
    return json({ action: 'updated', doc: result.doc });
  },
);

server.registerTool(
  'gamedoc_delete_doc',
  {
    title: liveTitle('Delete doc page'),
    description: 'Delete a documentation page by id. Any child pages are re-parented to the deleted page\'s parent so none are orphaned (same behavior as the website).',
    inputSchema: { id: z.string().describe('Id of the page to delete.') },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  },
  async ({ id }) => {
    const result = await deleteDoc(id);
    if (!result.ok) return fail(result.error);
    await notifyCommit('deleted', id);
    return json({
      action: 'deleted',
      id,
      reparentedChildren: result.reparentedChildren,
      ...(result.liveRoomWarning ? { liveRoomWarning: result.liveRoomWarning } : {}),
    });
  },
);

// ── Spaces (Hexel Maps) ──────────────────────────────────────────────────────
// A hexelMap block is a painted 3D space whose meaning is *inferred*. These tools
// expose that inferred semantic graph (typed spaces, the features inside them with
// counts, and the relations between them), let the agent refine it with a sparse
// annotation, and export the scene as real 3D geometry.

server.registerTool(
  'gamedoc_list_spaces',
  {
    title: 'List spaces',
    description: 'Every documentation page that carries a Hexel Map (painted 3D space), with inferred spaces/features and authored sequence count. Follow up with gamedoc_describe_space.',
    inputSchema: {},
    annotations: READ_ONLY,
  },
  async () => {
    const docs = await loadDocs();
    const out: Array<{ id: string; title: string; maps: number; spaces: number; features: number; sequences: number }> = [];
    for (const d of docs) {
      const maps = docHexelScenes(d.body);
      if (!maps.length) continue;
      let spaces = 0;
      let features = 0;
      let sequences = 0;
      for (const m of maps) {
        const g = describeSpace(m.scene);
        spaces += g.spaces.length;
        features += g.features.length;
        sequences += m.scene.sequence.length;
      }
      out.push({ id: d.id, title: d.title, maps: maps.length, spaces, features, sequences });
    }
    return json(out);
  },
);

server.registerTool(
  'gamedoc_create_space',
  {
    title: liveTitle('Create space'),
    description: 'Create a new documentation page with a Hexel Map (painted 3D space) on it. Give an initial palette (tile label + role, e.g. {label:"Grass",role:"floor"}) and cells painted against those labels, or omit both to get the same starter garden+house scene a human gets from a fresh widget insert. Follow up with gamedoc_annotate_space to refine, or gamedoc_describe_space to read back what got inferred.',
    inputSchema: {
      id: z.string().describe('New doc id (kebab-case, unique).'),
      title: z.string().describe('Page title.'),
      parentId: z.string().nullable().optional().describe('Parent doc id, or omit/null for a top-level page.'),
      subtitle: z.string().optional().describe('Scene subtitle, shown under the map title.'),
      bounds: z.object({ x: z.number().int(), y: z.number().int(), z: z.number().int() }).optional().describe(`Lattice size, clamped to ${BOUNDS_MIN.x}-${BOUNDS_MAX.x} × ${BOUNDS_MIN.y}-${BOUNDS_MAX.y} × ${BOUNDS_MIN.z}-${BOUNDS_MAX.z}. Defaults to 24×24×8.`),
      tiles: z.array(z.object({
        label: z.string().describe('Referenced by cells below — not a minted id.'),
        role: z.enum(TILE_ROLES).describe('Governs how inference reads this tile: floor/wall/door/water/marker/etc.'),
        color: z.string().optional().describe('CSS color; a default is assigned if omitted.'),
        glyph: z.string().optional(),
      })).optional().describe('Initial palette. Required if "cells" is given.'),
      cells: z.array(z.object({
        x: z.number().int(), y: z.number().int(), z: z.number().int(),
        tile: z.string().describe('A label from "tiles".'),
      })).optional().describe('Painted cells, referencing "tiles" by label.'),
      locationName: z.string().optional(),
      locationNotes: z.string().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  async ({ id, title, parentId, subtitle, bounds, tiles, cells, locationName, locationNotes }) => {
    const docs = await loadDocs();
    if (docs.some((d) => d.id === id)) return fail(`Doc "${id}" already exists. Use gamedoc_update_doc to edit it.`);
    const parent = parentId ?? null;
    if (parent && !docs.some((d) => d.id === parent)) return fail(`Parent "${parent}" not found. Use gamedoc_list_docs for valid ids.`);

    const { block, scene, unknownTiles } = buildHexelSpace(makeBlockId(), {
      title, subtitle, bounds, tiles, cells, locationName, locationNotes,
    });
    if (unknownTiles.length) return fail(`Unknown tile label(s) in "cells": ${[...new Set(unknownTiles)].join(', ')}. Every cell's "tile" must match a label in "tiles".`);

    const result = validateDoc({ id, title, parentId: parent, order: nextOrder(docs, parent), body: insertBlock('', block) });
    if (!result.ok) return fail(`Invalid doc — ${result.error}`);
    await notifyStart(id);
    const doc = await createDoc(result.doc);
    await notifyCommit('created', id, doc);
    return json({ action: 'created', id, blockId: block.id, ...describeSpace(scene) });
  },
);

server.registerTool(
  'gamedoc_describe_space',
  {
    title: 'Describe space',
    description: 'The full inferred semantic graph of a page\'s Hexel Map(s): typed spaces (kind, confidence, why, cell count, bbox, materials, containment), features, relations, movement routes, and authored level-sequence steps (terrain deltas, camera, narration, layers, overlays). Each item is tagged source:"inferred" or "annotated" so you know what is a guess vs pinned. Pass raw:true to also get the underlying scene (palette + every painted cell) instead of just the inferred graph.',
    inputSchema: {
      id: z.string().describe('Doc id of a page that has a hexel map (see gamedoc_list_spaces).'),
      raw: z.boolean().optional().describe('Include the raw scene (palette, cells, bounds, annotations) alongside the inferred graph.'),
    },
    annotations: READ_ONLY,
  },
  async ({ id, raw }) => {
    const docs = await loadDocs();
    const doc = docs.find((d) => d.id === id);
    if (!doc) return fail(`No doc "${id}". Use gamedoc_list_docs to see valid ids.`);
    const maps = docHexelScenes(doc.body);
    if (!maps.length) return fail(`Doc "${id}" has no hexel map. Use gamedoc_list_spaces for pages that do.`);
    return json(maps.map((m) => ({
      blockId: m.blockId,
      ...describeSpace(m.scene),
      sequence: describeSequence(m.scene),
      ...(raw ? { scene: m.scene } : {}),
    })));
  },
);

server.registerTool(
  'gamedoc_annotate_space',
  {
    title: liveTitle('Annotate space'),
    description: 'Refine a Hexel Map\'s inferred meaning by writing one sparse annotation, anchored to a cell (x,y). Pin a name/kind, confirm a guess, suppress a false relation, or merge two regions (with withAnchor). Annotations override the inference and persist — the same loosely-typed loop the human editor uses.',
    inputSchema: {
      id: z.string().describe('Doc id of the page with the hexel map.'),
      anchor: z.object({
        x: z.number().int(),
        y: z.number().int(),
        z: z.number().int().default(0),
      }).describe('A cell the annotated thing occupies — re-attaches to whatever region currently contains it.'),
      kind: z.string().optional().describe('Override the inferred kind (open vocabulary, e.g. "garden").'),
      name: z.string().optional().describe('Pin a human name for the space.'),
      op: z.enum(['merge', 'split', 'suppress', 'confirm']).optional().describe('Structural correction; merge/split pair with withAnchor.'),
      withAnchor: z.object({ x: z.number().int(), y: z.number().int(), z: z.number().int().default(0) }).optional().describe('Second cell for a merge/split.'),
      links: z.array(z.string()).optional().describe('Page ids this space links to (character / location pages).'),
      blockId: z.string().optional().describe('Which hexel map block, if the page has more than one (defaults to the first).'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  async ({ id, anchor, kind, name, op, withAnchor, links, blockId }) => {
    const docs = await loadDocs();
    const doc = docs.find((d) => d.id === id);
    if (!doc) return fail(`No doc "${id}". Use gamedoc_list_docs to see valid ids.`);
    const maps = docHexelScenes(doc.body);
    if (!maps.length) return fail(`Doc "${id}" has no hexel map.`);
    const target = blockId ? maps.find((m) => m.blockId === blockId) : maps[0];
    if (!target) return fail(`No hexel map block "${blockId}" on "${id}".`);

    const ann = makeAnnotation(anchor, 'space');
    if (kind) ann.kind = kind;
    if (name) ann.name = name;
    if (op) ann.op = op;
    if (withAnchor) ann.withAnchor = withAnchor;
    if (links) ann.links = links;

    const scene = { ...target.scene, annotations: [...target.scene.annotations, ann] };
    // Routes through updateDoc, not a direct save — same funnel as every
    // other body write, even though this rewrite only ever replaces one
    // block's props in place (same block ids in and out, so it never trips
    // the widget-drop guard).
    await notifyStart(id);
    const result = await updateDoc(id, { body: setHexelScene(doc.body, target.blockId, scene) });
    if (!result.ok) return fail(`Invalid doc — ${result.error}`);
    await notifyCommit('updated', id, result.doc);
    return json({ action: 'annotated', id, blockId: target.blockId, annotation: ann });
  },
);

server.registerTool(
  'gamedoc_export_scene',
  {
    title: 'Export space (3D)',
    description: 'Export a page\'s Hexel Map as a real 3D scene "in planes" — the exposed voxel faces — as a Wavefront OBJ (format:"obj", importable into Blender/Unity/three.js) or the native plane-list JSON (format:"planes").',
    inputSchema: {
      id: z.string().describe('Doc id of the page with the hexel map.'),
      format: z.enum(['obj', 'planes']).default('obj'),
      blockId: z.string().optional().describe('Which hexel map block (defaults to the first).'),
    },
    annotations: READ_ONLY,
  },
  async ({ id, format, blockId }) => {
    const docs = await loadDocs();
    const doc = docs.find((d) => d.id === id);
    if (!doc) return fail(`No doc "${id}". Use gamedoc_list_docs to see valid ids.`);
    const maps = docHexelScenes(doc.body);
    if (!maps.length) return fail(`Doc "${id}" has no hexel map.`);
    const target = blockId ? maps.find((m) => m.blockId === blockId) : maps[0];
    if (!target) return fail(`No hexel map block "${blockId}" on "${id}".`);
    return text(exportScene(target.scene, format));
  },
);

// ── Glossary & vocabulary ──────────────────────────────────────────────────

server.registerTool(
  'gamedoc_glossary',
  {
    title: 'Glossary',
    description: 'Definitions for the evidence-type glossary terms (Glint, Marking, Echo, Temperature, Distortion, Frequency, Haunt, Hunt). Omit "term" for all of them.',
    inputSchema: {
      term: z.enum(['Glint', 'Marking', 'Echo', 'Temperature', 'Distortion', 'Frequency', 'Haunt', 'Hunt']).optional(),
    },
    annotations: READ_ONLY,
  },
  async ({ term }) => {
    if (term) return text(`${term}: ${GLOSSARY[term]}`);
    return json(GLOSSARY);
  },
);

server.registerTool(
  'gamedoc_vocabulary',
  {
    title: 'Controlled vocabulary',
    description: 'The controlled-vocabulary enums that govern nightmare records (evidence types, glint/temperature variants, reliability, personality, hunt/haunt reads, states, player toolkit). Use when authoring or validating a record.',
    inputSchema: {},
    annotations: READ_ONLY,
  },
  async () => json(VOCABULARY),
);

// ── Templates ──────────────────────────────────────────────────────────────

server.registerTool(
  'gamedoc_list_templates',
  {
    title: 'List page templates',
    description: 'Compact list of page templates (id, name, description, field count). Fetch one with gamedoc_get_template.',
    inputSchema: {},
    annotations: READ_ONLY,
  },
  async () => {
    const templates = await loadTemplates();
    return json(templates.map((t) => ({ id: t.id, name: t.name, description: t.description ?? '', fields: t.fields.length })));
  },
);

server.registerTool(
  'gamedoc_get_template',
  {
    title: 'Get page template',
    description: 'Full definition of one page template by id, including every field (key, label, kind, options).',
    inputSchema: { id: z.string().describe('Template slug id.') },
    annotations: READ_ONLY,
  },
  async ({ id }) => {
    const templates = await loadTemplates();
    const template = templates.find((t) => t.id === id);
    if (!template) return fail(`No template "${id}". Valid ids: ${templates.map((t) => t.id).join(', ') || '(none)'}.`);
    return json(template);
  },
);

// ── Collections ────────────────────────────────────────────────────────────

server.registerTool(
  'gamedoc_list_collections',
  {
    title: 'List collections',
    description: 'Compact list of collections (id, name, columns, item count). Fetch one with gamedoc_get_collection.',
    inputSchema: {},
    annotations: READ_ONLY,
  },
  async () => {
    const collections = await loadCollections();
    return json(collections.map((c) => ({ id: c.id, name: c.name, columns: c.columns, items: c.items.length })));
  },
);

server.registerTool(
  'gamedoc_get_collection',
  {
    title: 'Get collection',
    description: 'Full contents of one collection by id, including every item row.',
    inputSchema: { id: z.string().describe('Collection slug id.') },
    annotations: READ_ONLY,
  },
  async ({ id }) => {
    const collections = await loadCollections();
    const collection = collections.find((c) => c.id === id);
    if (!collection) return fail(`No collection "${id}". Valid ids: ${collections.map((c) => c.id).join(', ') || '(none)'}.`);
    return json(collection);
  },
);

// ── Boot ───────────────────────────────────────────────────────────────────

async function main() {
  installStopOnExit();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr is safe; stdout is reserved for the JSON-RPC stream.
  console.error('gamedoc MCP server ready (stdio).');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
