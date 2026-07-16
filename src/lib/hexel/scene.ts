// ── Hexel Map semantic surface & 3D export ──────────────────────────────────
// The shared brain that every consumer reads through: the in-editor overlay, the
// gamedoc MCP tools, and the doc-graph extraction all call `describeSpace`, so
// the semantics never drift. It also turns the voxel paint into a real 3D scene
// "in planes" — the exposed faces of the voxels, occluded faces culled — for OBJ
// / native-JSON export. Pure and server-safe.

import { asScene, cellKey, tileById, type HexelScene, type Vec3 } from './types';
import { inferSemantics, type SemanticGraph } from './infer';
import { resolveSequence } from './sequence';

// ── Describe (for the LLM / MCP / overlay) ───────────────────────────────────

export type SpaceDescription = SemanticGraph & {
  location: HexelScene['location'];
  bounds: HexelScene['bounds'];
};

/** The full inferred + annotated semantic graph for a scene, ready for the LLM. */
export function describeSpace(scene: HexelScene): SpaceDescription {
  return { location: scene.location, bounds: scene.bounds, ...inferSemantics(scene) };
}

// ── Summarize (searchable one-paragraph digest) ──────────────────────────────

/** A kind-aware plain-text digest of a scene, from its stored `dataJson`. Used by
 *  blocks.ts `widgetPlainText` (search / agent `format:'text'`). Best-effort:
 *  bad JSON contributes nothing. */
export function summarizeScene(dataJson: unknown): string {
  let raw: unknown = {};
  if (typeof dataJson === 'string' && dataJson.trim()) {
    try { raw = JSON.parse(dataJson); } catch { return ''; }
  } else if (dataJson && typeof dataJson === 'object') {
    raw = dataJson;
  } else {
    return '';
  }
  const scene = asScene(raw);
  const g = inferSemantics(scene);
  if (!g.spaces.length && !scene.location.name) return '';

  const featBySpace = new Map<string, string[]>();
  const looseFeatures: string[] = [];
  for (const f of g.features) {
    const label = f.count > 1 ? `${f.count}× ${f.kind}` : f.kind;
    const described = f.notes ? `${label} (Note: ${f.notes})` : label;
    if (!f.spaceId) {
      looseFeatures.push(described);
    } else {
      const arr = featBySpace.get(f.spaceId) ?? [];
      arr.push(described);
      featBySpace.set(f.spaceId, arr);
    }
  }

  const parts: string[] = [];
  const loc = scene.location.name.trim();
  if (loc) parts.push(`Location '${loc}'.`);

  // Up to a handful of space highlights so the digest stays bounded.
  for (const s of g.spaces.slice(0, 8)) {
    const held = featBySpace.get(s.id);
    const tail = held && held.length ? ` holds ${held.join(', ')}` : '';
    const note = s.notes ? ` Note: ${s.notes}` : '';
    parts.push(`${s.name} (${s.kind}, ${s.cellCount} cells)${tail}.${note}`);
  }
  for (const feature of looseFeatures) parts.push(`Feature: ${feature}.`);

  const byId = new Map(g.spaces.map((s) => [s.id, s.name]));
  for (const r of g.relations) {
    const via = r.viaSpaceId ? ` via ${byId.get(r.viaSpaceId) ?? 'a space'}` : '';
    const relationLabel = r.name || r.kind;
    const relationText = relationLabel === 'connects'
      ? 'connects to'
      : `${relationLabel} to`;
    const note = r.notes ? ` Note: ${r.notes}` : '';
    parts.push(`${byId.get(r.from) ?? '?'} ${relationText} ${byId.get(r.to) ?? '?'}${via}.${note}`);
  }
  for (const route of g.routes) {
    const note = route.notes ? ` Note: ${route.notes}` : '';
    parts.push(`Route ${route.name} (${route.kind}, ${route.points.length} points).${note}`);
  }
  for (const step of scene.sequence.slice(0, 12)) {
    const narration = step.narration ? ` ${step.narration}` : '';
    parts.push(`Step ${step.title || step.id}: ${step.cellChanges.length} terrain changes, ${step.annotationChanges.length} annotation changes, ${step.overlays.length} overlays.${narration}`);
  }

  const pinned = g.spaces.filter((s) => s.source === 'annotated').length;
  parts.push(
    `${g.spaces.length} spaces, ${g.features.length} features, ${g.relations.length} relations, ${g.routes.length} routes` +
      (pinned ? ` (${pinned} pinned).` : '.'),
  );
  return parts.join(' ');
}

// ── 3D export (face-planes) ──────────────────────────────────────────────────

export type ScenePlane = {
  verts: [Vec3, Vec3, Vec3, Vec3];
  normal: Vec3;
  color: string;
  tile: string; // tile label
};

const FACES: { n: Vec3; corners: [Vec3, Vec3, Vec3, Vec3] }[] = [
  { n: { x: 0, y: 0, z: 1 }, corners: [{ x: 0, y: 0, z: 1 }, { x: 1, y: 0, z: 1 }, { x: 1, y: 1, z: 1 }, { x: 0, y: 1, z: 1 }] },
  { n: { x: 0, y: 0, z: -1 }, corners: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 1, y: 1, z: 0 }, { x: 1, y: 0, z: 0 }] },
  { n: { x: 1, y: 0, z: 0 }, corners: [{ x: 1, y: 0, z: 0 }, { x: 1, y: 1, z: 0 }, { x: 1, y: 1, z: 1 }, { x: 1, y: 0, z: 1 }] },
  { n: { x: -1, y: 0, z: 0 }, corners: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, { x: 0, y: 1, z: 1 }, { x: 0, y: 1, z: 0 }] },
  { n: { x: 0, y: 1, z: 0 }, corners: [{ x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: 1 }, { x: 1, y: 1, z: 1 }, { x: 1, y: 1, z: 0 }] },
  { n: { x: 0, y: -1, z: 0 }, corners: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 1, y: 0, z: 1 }, { x: 0, y: 0, z: 1 }] },
];

/** The exposed faces of every voxel — interior faces (those abutting another
 *  voxel) culled — each as a world-space quad with its material. View-independent. */
export function toPlanes(scene: HexelScene): ScenePlane[] {
  const occupied = new Set<string>();
  for (const c of scene.cells) occupied.add(cellKey(c));
  const planes: ScenePlane[] = [];
  for (const c of scene.cells) {
    const tile = tileById(scene, c.t);
    for (const face of FACES) {
      const nb = cellKey({ x: c.x + face.n.x, y: c.y + face.n.y, z: c.z + face.n.z });
      if (occupied.has(nb)) continue; // interior face → cull
      const verts = face.corners.map((p) => ({ x: c.x + p.x, y: c.y + p.y, z: c.z + p.z })) as [Vec3, Vec3, Vec3, Vec3];
      planes.push({ verts, normal: face.n, color: tile?.color ?? '#888888', tile: tile?.label ?? 'Unknown' });
    }
  }
  return planes;
}

/** A Wavefront OBJ of the exposed planes (quad faces). One material group per
 *  distinct colour. Vertices are emitted per-face (4 × planes); faces = planes. */
export function toOBJ(planes: ScenePlane[]): string {
  const lines: string[] = ['# Hexel Map export', `# ${planes.length} planes`];
  let vi = 0;
  let lastTile = '';
  for (const pl of planes) {
    if (pl.tile !== lastTile) { lines.push(`g ${pl.tile.replace(/\s+/g, '_')}`); lastTile = pl.tile; }
    for (const v of pl.verts) lines.push(`v ${v.x} ${v.z} ${v.y}`); // OBJ is Y-up: map our z→Y, y→Z
    lines.push(`f ${vi + 1} ${vi + 2} ${vi + 3} ${vi + 4}`);
    vi += 4;
  }
  return lines.join('\n') + '\n';
}

/** Native plane-list JSON — the most direct form for downstream tools / the LLM. */
export function toSceneJSON(scene: HexelScene): {
  title: string;
  bounds: HexelScene['bounds'];
  planes: ScenePlane[];
  routes: ReturnType<typeof inferSemantics>['routes'];
  ramps: ReturnType<typeof inferSemantics>['relations'];
  sequence: ReturnType<typeof describeSequence>;
} {
  const graph = inferSemantics(scene);
  return {
    title: scene.title,
    bounds: scene.bounds,
    planes: toPlanes(scene),
    routes: graph.routes,
    ramps: graph.relations.filter((relation) => relation.kind === 'ramp'),
    sequence: describeSequence(scene),
  };
}

export function describeSequence(scene: HexelScene): Array<{
  index: number;
  id: string;
  title: string;
  narration: string;
  durationMs: number | null;
  changes: { cells: number; annotations: number; overlays: number };
  camera: HexelScene['sequence'][number]['camera'];
  layers: HexelScene['sequence'][number]['layers'];
  overlays: HexelScene['sequence'][number]['overlays'];
  resolved: { cells: number; annotations: number };
}> {
  return scene.sequence.map((step, index) => {
    const resolved = resolveSequence(scene, index);
    return {
      index,
      id: step.id,
      title: step.title,
      narration: step.narration,
      durationMs: step.durationMs,
      changes: {
        cells: step.cellChanges.length,
        annotations: step.annotationChanges.length,
        overlays: step.overlays.length,
      },
      camera: step.camera,
      layers: step.layers,
      overlays: step.overlays,
      resolved: { cells: resolved.cells.length, annotations: resolved.annotations.length },
    };
  });
}
