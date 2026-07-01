// ── Hexel Map inference engine ──────────────────────────────────────────────
// The centerpiece. Pure, deterministic, *explainable* — no React, no ML — so it
// runs live in the editor, in the MCP, and in scripts alike. It reads the raw
// paint and works out what it *means*: it segments the walkable plane into
// Spaces, duck-types each one's kind from its shape and contents (a long narrow
// strip behaves like a corridor; an enclosed area like a room; an open grassy
// patch like a garden), clusters marker tiles into Features with counts, detects
// the Connections between spaces (doors, corridors), and nests containment.
// Every guess carries a confidence and a short `why`. A sparse list of explicit
// `annotations` is then layered on top as overrides (pin a name/kind, merge two
// regions, suppress a false door) — these win, and flip a field's `source` to
// 'annotated'. Nothing here is persisted; it is recomputed from the paint.

import {
  cellKey,
  tileById,
  type Annotation,
  type Cell,
  type HexelScene,
  type PaletteTile,
  type TileRole,
  type Vec3,
} from './types';

// ── Output graph ─────────────────────────────────────────────────────────────

export type Bbox = { minX: number; minY: number; maxX: number; maxY: number; minZ: number; maxZ: number };
export type Source = 'inferred' | 'annotated';

export type SpaceNode = {
  id: string;
  seed: Vec3;
  kind: string;
  name: string;
  confidence: number; // 0..1
  why: string;
  cellCount: number;
  /** The plane keys ("x,y") this space occupies — its derived extent. */
  columns: string[];
  bbox: Bbox;
  parentId: string | null;
  /** Tile label → column count, the region's material composition. */
  materials: Record<string, number>;
  featureIds: string[];
  links: string[];
  source: Source;
};

export type FeatureNode = {
  id: string;
  seed: Vec3;
  kind: string;
  name: string;
  count: number;
  at: Vec3;
  spaceId: string | null;
  links: string[];
  source: Source;
};

export type RelationNode = {
  id: string;
  kind: string;
  from: string;
  to: string;
  viaSpaceId: string | null;
  at: Vec3 | null;
  confidence: number;
  why: string;
  source: Source;
};

export type SemanticGraph = {
  spaces: SpaceNode[];
  features: FeatureNode[];
  relations: RelationNode[];
  adjacency: [string, string][];
};

// ── Ground model (2D projection of the paint) ───────────────────────────────

type Ground = 'floor' | 'water' | 'door' | 'wall' | 'marker' | 'empty';

const ROLE_PRIORITY: Record<Exclude<Ground, 'empty'>, number> = {
  wall: 5,
  door: 4,
  water: 3,
  floor: 2,
  marker: 1,
};

/** Resolve a tile's effective role, guessing for 'auto': cells stacked above the
 *  ground read as walls, ground-level cells as floor. (The deliberately simple,
 *  documented height heuristic — richer guesses are the classifier's job.) */
function effectiveRole(tile: PaletteTile | null, z: number): TileRole {
  if (!tile) return 'auto';
  if (tile.role !== 'auto') return tile.role;
  return z >= 1 ? 'wall' : 'floor';
}

type Plane = {
  /** "x,y" → the winning ground role for that column. */
  ground: Map<string, Ground>;
  /** "x,y" → the cells stacked in that column (any z). */
  column: Map<string, Cell[]>;
};

function planeKey(x: number, y: number): string {
  return `${x},${y}`;
}

function buildPlane(scene: HexelScene): Plane {
  const ground = new Map<string, Ground>();
  const column = new Map<string, Cell[]>();
  for (const c of scene.cells) {
    const k = planeKey(c.x, c.y);
    (column.get(k) ?? column.set(k, []).get(k)!).push(c);
    const er = effectiveRole(tileById(scene, c.t), c.z);
    // 'auto' already resolved to floor/wall by effectiveRole; 'void' is a hole →
    // treat it as a barrier so it never reads as walkable.
    const g: Exclude<Ground, 'empty'> = er === 'auto' ? 'floor' : er === 'void' ? 'wall' : er;
    const prev = ground.get(k) as Exclude<Ground, 'empty'> | undefined;
    if (!prev || ROLE_PRIORITY[g] > ROLE_PRIORITY[prev]) ground.set(k, g);
  }
  // A column whose only paint is a marker still implies a walkable surface.
  for (const [k, g] of ground) if (g === 'marker') ground.set(k, 'floor');
  return { ground, column };
}

const isWalkable = (g: Ground | undefined): boolean => g === 'floor' || g === 'water';

// ── Segmentation (connected components of walkable columns) ──────────────────

type Region = {
  id: string;
  keys: Set<string>; // plane keys "x,y"
  cells: { x: number; y: number }[];
};

const N4: ReadonlyArray<[number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

function segment(plane: Plane): Region[] {
  const seen = new Set<string>();
  const regions: Region[] = [];
  for (const [k, g] of plane.ground) {
    if (seen.has(k) || !isWalkable(g)) continue;
    // Flood fill this component.
    const keys = new Set<string>();
    const cells: { x: number; y: number }[] = [];
    const stack = [k];
    seen.add(k);
    while (stack.length) {
      const cur = stack.pop()!;
      const [cx, cy] = cur.split(',').map(Number);
      keys.add(cur);
      cells.push({ x: cx, y: cy });
      for (const [dx, dy] of N4) {
        const nk = planeKey(cx + dx, cy + dy);
        if (seen.has(nk)) continue;
        if (isWalkable(plane.ground.get(nk))) {
          seen.add(nk);
          stack.push(nk);
        }
      }
    }
    regions.push({ id: '', keys, cells });
  }
  return regions;
}

/** Deterministic seed (and id) for a region: its top-left-most column. */
function regionSeed(region: Region, plane: Plane): Vec3 {
  let best = region.cells[0];
  for (const c of region.cells) if (c.y < best.y || (c.y === best.y && c.x < best.x)) best = c;
  const stack = plane.column.get(planeKey(best.x, best.y)) ?? [];
  const minZ = stack.reduce((m, c) => Math.min(m, c.z), 0);
  return { x: best.x, y: best.y, z: minZ };
}

// ── Union-find (for `merge` annotations) ─────────────────────────────────────

class DSU {
  private parent = new Map<number, number>();
  find(i: number): number {
    let p = this.parent.get(i) ?? i;
    if (p !== i) {
      p = this.find(p);
      this.parent.set(i, p);
    }
    return p;
  }
  union(a: number, b: number): void {
    this.parent.set(this.find(a), this.find(b));
  }
}

// ── Metrics & classification (duck typing) ───────────────────────────────────

function bboxOf(region: Region, plane: Plane): Bbox {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const c of region.cells) {
    minX = Math.min(minX, c.x); maxX = Math.max(maxX, c.x);
    minY = Math.min(minY, c.y); maxY = Math.max(maxY, c.y);
    for (const cell of plane.column.get(planeKey(c.x, c.y)) ?? []) {
      minZ = Math.min(minZ, cell.z); maxZ = Math.max(maxZ, cell.z);
    }
  }
  if (!isFinite(minZ)) { minZ = 0; maxZ = 0; }
  return { minX, minY, maxX, maxY, minZ, maxZ };
}

/** Tile-label composition of a region's walkable columns. */
function materialsOf(region: Region, scene: HexelScene, plane: Plane): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of region.cells) {
    for (const cell of plane.column.get(planeKey(c.x, c.y)) ?? []) {
      const tile = tileById(scene, cell.t);
      const role = effectiveRole(tile, cell.z);
      if (role === 'floor' || role === 'water') {
        const label = tile?.label ?? 'Unknown';
        out[label] = (out[label] ?? 0) + 1;
      }
    }
  }
  return out;
}

/** Fraction of a region's perimeter edges that abut a wall or door (vs open). */
function enclosureOf(region: Region, plane: Plane): number {
  let perimeter = 0;
  let walled = 0;
  for (const c of region.cells) {
    for (const [dx, dy] of N4) {
      const nk = planeKey(c.x + dx, c.y + dy);
      if (region.keys.has(nk)) continue;
      perimeter += 1;
      const g = plane.ground.get(nk);
      if (g === 'wall' || g === 'door') walled += 1;
    }
  }
  return perimeter > 0 ? walled / perimeter : 0;
}

function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

type Classification = { kind: string; confidence: number; why: string };

function classify(
  region: Region,
  scene: HexelScene,
  plane: Plane,
  bbox: Bbox,
  materials: Record<string, number>,
): Classification {
  const area = region.cells.length;
  const w = bbox.maxX - bbox.minX + 1;
  const h = bbox.maxY - bbox.minY + 1;
  const long = Math.max(w, h);
  const short = Math.min(w, h);
  const ratio = short > 0 ? long / short : long;
  const enclosure = enclosureOf(region, plane);

  const total = Object.values(materials).reduce((a, b) => a + b, 0) || 1;
  const labels = Object.entries(materials);
  const fracOf = (pred: (label: string) => boolean) =>
    labels.filter(([l]) => pred(l.toLowerCase())).reduce((a, [, n]) => a + n, 0) / total;
  const waterFrac = (() => {
    let n = 0;
    for (const c of region.cells)
      for (const cell of plane.column.get(planeKey(c.x, c.y)) ?? [])
        if (effectiveRole(tileById(scene, cell.t), cell.z) === 'water') n += 1;
    return n / total;
  })();
  const grassFrac = fracOf((l) => l.includes('grass') || l.includes('garden'));

  if (short <= 2 && long >= 4 && ratio >= 2.5) {
    return { kind: 'corridor', confidence: 0.8, why: `narrow ${w}×${h} strip` };
  }
  if (waterFrac > 0.5) {
    return { kind: 'pond', confidence: 0.7, why: 'mostly water' };
  }
  if (enclosure >= 0.6) {
    return { kind: 'room', confidence: Math.min(0.95, 0.5 + enclosure * 0.4), why: 'enclosed by walls' };
  }
  if (grassFrac > 0.5) {
    return { kind: 'garden', confidence: 0.65, why: 'open, grassy ground' };
  }
  if (enclosure < 0.25 && area >= 6) {
    return { kind: 'courtyard', confidence: 0.5, why: 'large open area' };
  }
  return { kind: 'space', confidence: 0.3, why: 'unclassified region' };
}

// ── Annotation matching ──────────────────────────────────────────────────────

function regionAt(anchor: Vec3, keyToRegion: Map<string, number>): number | null {
  const idx = keyToRegion.get(planeKey(anchor.x, anchor.y));
  return idx === undefined ? null : idx;
}

// ── Main entry ───────────────────────────────────────────────────────────────

export function inferSemantics(scene: HexelScene): SemanticGraph {
  const plane = buildPlane(scene);
  let regions = segment(plane);

  // Map every walkable column to its region index, for annotation matching.
  const keyToRegion = new Map<string, number>();
  regions.forEach((r, i) => r.keys.forEach((k) => keyToRegion.set(k, i)));

  // Apply `merge` annotations at the region level, before classification.
  const merges = scene.annotations.filter((a) => a.op === 'merge' && a.withAnchor);
  if (merges.length) {
    const dsu = new DSU();
    for (const a of merges) {
      const ra = regionAt(a.anchor, keyToRegion);
      const rb = a.withAnchor ? regionAt(a.withAnchor, keyToRegion) : null;
      if (ra !== null && rb !== null) dsu.union(ra, rb);
    }
    const grouped = new Map<number, Region>();
    regions.forEach((r, i) => {
      const root = dsu.find(i);
      const g = grouped.get(root);
      if (g) {
        r.keys.forEach((k) => g.keys.add(k));
        g.cells.push(...r.cells);
      } else {
        grouped.set(root, { id: '', keys: new Set(r.keys), cells: [...r.cells] });
      }
    });
    regions = [...grouped.values()];
    keyToRegion.clear();
    regions.forEach((r, i) => r.keys.forEach((k) => keyToRegion.set(k, i)));
  }

  // Build the space nodes.
  const kindCounts = new Map<string, number>();
  const spaces: SpaceNode[] = regions.map((region) => {
    const seed = regionSeed(region, plane);
    const bbox = bboxOf(region, plane);
    const materials = materialsOf(region, scene, plane);
    const cls = classify(region, scene, plane, bbox, materials);
    const n = (kindCounts.get(cls.kind) ?? 0) + 1;
    kindCounts.set(cls.kind, n);
    return {
      id: `sp:${seed.x}:${seed.y}`,
      seed,
      kind: cls.kind,
      name: capitalize(cls.kind),
      confidence: cls.confidence,
      why: cls.why,
      cellCount: region.cells.length,
      columns: [...region.keys],
      bbox,
      parentId: null,
      materials,
      featureIds: [],
      links: [],
      source: 'inferred' as Source,
    };
  });
  const spaceByRegion = new Map<number, SpaceNode>();
  regions.forEach((_, i) => spaceByRegion.set(i, spaces[i]));

  // Number repeated kinds so names read "Room", "Room 2", … in stable order.
  const seenKind = new Map<string, number>();
  const kindTotals = new Map<string, number>();
  for (const s of spaces) kindTotals.set(s.kind, (kindTotals.get(s.kind) ?? 0) + 1);
  for (const s of spaces) {
    const n = (seenKind.get(s.kind) ?? 0) + 1;
    seenKind.set(s.kind, n);
    if ((kindTotals.get(s.kind) ?? 1) > 1) s.name = `${capitalize(s.kind)} ${n}`;
  }

  // Features: marker cells grouped by (region, tile) → one feature with a count.
  const featureGroups = new Map<string, FeatureNode>();
  for (const cell of scene.cells) {
    const tile = tileById(scene, cell.t);
    if (effectiveRole(tile, cell.z) !== 'marker') continue;
    const ri = keyToRegion.get(planeKey(cell.x, cell.y));
    const space = ri === undefined ? null : spaceByRegion.get(ri) ?? null;
    const kind = (tile?.label ?? 'marker').toLowerCase();
    const gkey = `${space?.id ?? 'none'}|${cell.t}`;
    const existing = featureGroups.get(gkey);
    if (existing) {
      existing.count += 1;
    } else {
      featureGroups.set(gkey, {
        id: `ft:${cell.x}:${cell.y}:${cell.z}`,
        seed: { x: cell.x, y: cell.y, z: cell.z },
        kind,
        name: tile?.label ?? 'Marker',
        count: 1,
        at: { x: cell.x, y: cell.y, z: cell.z },
        spaceId: space?.id ?? null,
        links: [],
        source: 'inferred',
      });
    }
  }
  const features = [...featureGroups.values()];
  for (const f of features) {
    if (!f.spaceId) continue;
    const sp = spaces.find((s) => s.id === f.spaceId);
    if (sp) sp.featureIds.push(f.id);
  }

  // Connections: door columns bordering ≥2 regions, plus corridor "via" links.
  const relations: RelationNode[] = [];
  const adjacencySet = new Set<string>();
  const addAdj = (a: string, b: string) => {
    if (a === b) return;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    adjacencySet.add(key);
  };
  for (const [k, g] of plane.ground) {
    if (g !== 'wall' && g !== 'door') continue;
    const [x, y] = k.split(',').map(Number);
    const touch = new Set<number>();
    for (const [dx, dy] of N4) {
      const ri = keyToRegion.get(planeKey(x + dx, y + dy));
      if (ri !== undefined) touch.add(ri);
    }
    const ids = [...touch];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = spaceByRegion.get(ids[i])!;
        const b = spaceByRegion.get(ids[j])!;
        addAdj(a.id, b.id);
        if (g === 'door') {
          relations.push({
            id: `rel:${x}:${y}`,
            kind: 'door',
            from: a.id,
            to: b.id,
            viaSpaceId: null,
            at: { x, y, z: 0 },
            confidence: 0.85,
            why: 'door between two spaces',
            source: 'inferred',
          });
        }
      }
    }
  }

  // "via corridor": a corridor that doors onto exactly two spaces links them.
  for (const corridor of spaces.filter((s) => s.kind === 'corridor')) {
    const doors = relations.filter(
      (rl) => rl.kind === 'door' && (rl.from === corridor.id || rl.to === corridor.id),
    );
    const others = [...new Set(doors.map((d) => (d.from === corridor.id ? d.to : d.from)))];
    if (others.length === 2) {
      relations.push({
        id: `rel:via:${corridor.id}`,
        kind: 'connects',
        from: others[0],
        to: others[1],
        viaSpaceId: corridor.id,
        at: null,
        confidence: 0.7,
        why: `linked through ${corridor.name}`,
        source: 'inferred',
      });
    }
  }

  // Containment: a region whose bbox sits strictly inside a larger region's.
  for (const a of spaces) {
    let best: SpaceNode | null = null;
    for (const b of spaces) {
      if (a === b || b.cellCount <= a.cellCount) continue;
      const contains =
        b.bbox.minX <= a.bbox.minX && b.bbox.maxX >= a.bbox.maxX &&
        b.bbox.minY <= a.bbox.minY && b.bbox.maxY >= a.bbox.maxY &&
        (b.bbox.minX < a.bbox.minX || b.bbox.maxX > a.bbox.maxX ||
          b.bbox.minY < a.bbox.minY || b.bbox.maxY > a.bbox.maxY);
      if (contains && (!best || b.cellCount < best.cellCount)) best = b;
    }
    if (best) a.parentId = best.id;
  }

  // Apply remaining annotations (name / kind / confirm / links on spaces;
  // suppress on relations) — these override inference and mark the source.
  for (const ann of scene.annotations) {
    if (ann.op === 'merge') continue; // already applied
    if (ann.scope === 'relation' && ann.op === 'suppress') {
      const idx = relations.findIndex(
        (r) => r.at && r.at.x === ann.anchor.x && r.at.y === ann.anchor.y,
      );
      if (idx >= 0) relations.splice(idx, 1);
      continue;
    }
    const ri = regionAt(ann.anchor, keyToRegion);
    const sp = ri === null ? null : spaceByRegion.get(ri) ?? null;
    if (!sp) continue;
    applyAnnotationToSpace(sp, ann);
  }

  return {
    spaces,
    features,
    relations,
    adjacency: [...adjacencySet].map((k) => k.split('|') as [string, string]),
  };
}

function applyAnnotationToSpace(sp: SpaceNode, ann: Annotation): void {
  if (ann.kind) { sp.kind = ann.kind; sp.source = 'annotated'; }
  if (ann.name) { sp.name = ann.name; sp.source = 'annotated'; }
  if (ann.op === 'confirm') { sp.confidence = 1; sp.source = 'annotated'; }
  if (ann.links.length) { sp.links = [...new Set([...sp.links, ...ann.links])]; sp.source = 'annotated'; }
}
