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
  /** Designer notes from pinned annotations, joined in annotation order. */
  notes: string;
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
  /** Designer notes from pinned annotations, joined in annotation order. */
  notes: string;
  source: Source;
};

export type RelationNode = {
  id: string;
  kind: string;
  name: string;
  from: string;
  to: string;
  viaSpaceId: string | null;
  at: Vec3 | null;
  confidence: number;
  why: string;
  links: string[];
  /** Designer notes from pinned annotations, joined in annotation order. */
  notes: string;
  source: Source;
};

export type MovementRoute = {
  id: string;
  name: string;
  kind: string;
  points: Vec3[];
  links: string[];
  notes: string;
  source: Source;
};

export type SemanticGraph = {
  spaces: SpaceNode[];
  features: FeatureNode[];
  relations: RelationNode[];
  routes: MovementRoute[];
  adjacency: [string, string][];
};

// ── Ground model (2D projection of the paint) ───────────────────────────────

type Ground = 'floor' | 'water' | 'door' | 'ramp' | 'wall' | 'marker' | 'empty';

const ROLE_PRIORITY: Record<Exclude<Ground, 'empty'>, number> = {
  wall: 5,
  door: 4,
  ramp: 3,
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

const isWalkable = (g: Ground | undefined): boolean => g === 'floor' || g === 'water' || g === 'ramp';

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
      if (role === 'floor' || role === 'water' || role === 'ramp') {
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

function regionFromKeys(keys: Iterable<string>): Region {
  const sorted = [...keys].sort((a, b) => {
    const [ax, ay] = a.split(',').map(Number);
    const [bx, by] = b.split(',').map(Number);
    return ay - by || ax - bx;
  });
  return {
    id: '',
    keys: new Set(sorted),
    cells: sorted.map((key) => {
      const [x, y] = key.split(',').map(Number);
      return { x, y };
    }),
  };
}

/** Breadth-first distances over the region's existing walkable-column graph. */
function bfsDistances(start: string, region: Region): Map<string, number> {
  const distances = new Map<string, number>();
  if (!region.keys.has(start)) return distances;
  const queue = [start];
  distances.set(start, 0);
  let head = 0;
  while (head < queue.length) {
    const current = queue[head++];
    const [x, y] = current.split(',').map(Number);
    const distance = distances.get(current)! + 1;
    for (const [dx, dy] of N4) {
      const next = planeKey(x + dx, y + dy);
      if (!region.keys.has(next) || distances.has(next)) continue;
      distances.set(next, distance);
      queue.push(next);
    }
  }
  return distances;
}

// ── Main entry ───────────────────────────────────────────────────────────────

export function inferSemantics(scene: HexelScene): SemanticGraph {
  const plane = buildPlane(scene);
  let regions = segment(plane);

  // Map every walkable column to its region index, for annotation matching.
  const keyToRegion = new Map<string, number>();
  regions.forEach((r, i) => r.keys.forEach((k) => keyToRegion.set(k, i)));

  // Apply `merge` annotations at the region level, before classification.
  const merges = scene.annotations.filter(
    (a) => a.scope === 'space' && a.op === 'merge' && a.withAnchor,
  );
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

  // Apply `split` annotations before classification. Each split is a
  // deterministic two-source BFS over the region's existing 4-neighbour
  // walkable-column graph. Every column joins the nearer source by graph
  // distance; equal distances go to the primary `anchor`. Both anchors must
  // be in the same region, and degenerate partitions are no-ops. Splits are
  // processed in annotation order, rebuilding the region index after each one.
  const splits = scene.annotations.filter(
    (a) => a.scope === 'space' && a.op === 'split' && a.withAnchor,
  );
  for (const a of splits) {
    const ri = regionAt(a.anchor, keyToRegion);
    const rj = a.withAnchor ? regionAt(a.withAnchor, keyToRegion) : null;
    if (ri === null || rj === null || ri !== rj) continue; // only splits within a single region
    const region = regions[ri];
    const primaryKey = planeKey(a.anchor.x, a.anchor.y);
    const secondaryKey = planeKey(a.withAnchor!.x, a.withAnchor!.y);
    if (primaryKey === secondaryKey) continue;
    const primaryDistances = bfsDistances(primaryKey, region);
    const secondaryDistances = bfsDistances(secondaryKey, region);
    if (!primaryDistances.size || !secondaryDistances.size) continue;

    const primary = new Set<string>();
    const secondary = new Set<string>();
    for (const key of region.keys) {
      const primaryDistance = primaryDistances.get(key);
      const secondaryDistance = secondaryDistances.get(key);
      if (primaryDistance === undefined || secondaryDistance === undefined) continue;
      if (primaryDistance <= secondaryDistance) primary.add(key);
      else secondary.add(key);
    }
    if (!primary.size || !secondary.size) continue;
    regions[ri] = regionFromKeys(primary);
    regions.push(regionFromKeys(secondary));
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
      notes: '',
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
  const featureCoordinates = new Map<string, Set<string>>();
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
      featureCoordinates.get(existing.id)?.add(planeKey(cell.x, cell.y));
    } else {
      const feature: FeatureNode = {
        id: `ft:${cell.x}:${cell.y}:${cell.z}`,
        seed: { x: cell.x, y: cell.y, z: cell.z },
        kind,
        name: tile?.label ?? 'Marker',
        count: 1,
        at: { x: cell.x, y: cell.y, z: cell.z },
        spaceId: space?.id ?? null,
        links: [],
        notes: '',
        source: 'inferred',
      };
      featureGroups.set(gkey, feature);
      featureCoordinates.set(feature.id, new Set([planeKey(cell.x, cell.y)]));
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
            name: '',
            from: a.id,
            to: b.id,
            viaSpaceId: null,
            at: { x, y, z: 0 },
            confidence: 0.85,
            why: 'door between two spaces',
            links: [],
            notes: '',
            source: 'inferred',
          });
        }
      }

    }
  }

  // A ramp is an explicit vertical transition even though the current space
  // segmentation remains a 2D walkable-plane model. Keep it as a relation so
  // routes and downstream tools can reason about elevation without guessing.
  for (const cell of scene.cells) {
    if (tileById(scene, cell.t)?.role !== 'ramp') continue;
    const ri = keyToRegion.get(planeKey(cell.x, cell.y));
    const space = ri === undefined ? null : spaceByRegion.get(ri) ?? null;
    if (!space) continue;
    relations.push({
      id: `rel:ramp:${cell.x}:${cell.y}:${cell.z}`,
      kind: 'ramp',
      name: tileById(scene, cell.t)?.label ?? 'Ramp',
      from: space.id,
      to: space.id,
      viaSpaceId: null,
      at: { x: cell.x, y: cell.y, z: cell.z },
      confidence: 1,
      why: `explicit ramp tile at elevation z=${cell.z}`,
      links: [],
      notes: '',
      source: 'inferred',
    });
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
        name: '',
        from: others[0],
        to: others[1],
        viaSpaceId: corridor.id,
        at: null,
        confidence: 0.7,
        why: `linked through ${corridor.name}`,
        links: [],
        notes: '',
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

  // Apply remaining annotations by scope. Relation annotations with
  // `at: null` (the inferred via-corridor relation) remain intentionally
  // unreachable because annotations are anchored to painted coordinates.
  for (const ann of scene.annotations) {
    if (ann.op === 'merge' || ann.op === 'split') continue; // already applied
    if (ann.scope === 'relation') {
      const matches = relations.filter(
        (r) => r.at && r.at.x === ann.anchor.x && r.at.y === ann.anchor.y,
      );
      if (ann.op === 'suppress') {
        for (const relation of matches) {
          const idx = relations.indexOf(relation);
          if (idx >= 0) relations.splice(idx, 1);
        }
      } else {
        for (const relation of matches) applyAnnotationToRelation(relation, ann);
      }
      continue;
    }
    if (ann.scope === 'route') continue;
    if (ann.scope === 'feature') {
      const f = findFeature(ann.anchor, features, featureCoordinates, keyToRegion, spaces);
      if (!f) continue;
      if (ann.op === 'suppress') {
        const idx = features.indexOf(f);
        if (idx >= 0) features.splice(idx, 1);
        if (f.spaceId) {
          const sp = spaces.find((s) => s.id === f.spaceId);
          if (sp) sp.featureIds = sp.featureIds.filter((id) => id !== f.id);
        }
        continue;
      }
      applyAnnotationToFeature(f, ann);
      continue;
    }
    const ri = regionAt(ann.anchor, keyToRegion);
    const sp = ri === null ? null : spaceByRegion.get(ri) ?? null;
    if (!sp) continue;
    applyAnnotationToSpace(sp, ann);
  }

  const routes: MovementRoute[] = scene.annotations
    .filter((ann) => ann.scope === 'route' && (ann.path?.length ?? 0) >= 2)
    .map((ann) => ({
      id: `route:${ann.id}`,
      name: ann.name || 'Movement Route',
      kind: ann.kind || 'movement',
      points: (ann.path ?? []).map((point) => ({ ...point })),
      links: [...ann.links],
      notes: ann.notes,
      source: 'annotated' as Source,
    }));

  return {
    spaces,
    features,
    relations,
    routes,
    adjacency: [...adjacencySet].map((k) => k.split('|') as [string, string]),
  };
}

/** Resolve a feature by an exact marker column first. A short, unique
 * same-space fallback keeps legacy anchors usable without retargeting a
 * distant or unrelated marker. */
function findFeature(
  anchor: Vec3,
  features: FeatureNode[],
  featureCoordinates: Map<string, Set<string>>,
  keyToRegion: Map<string, number>,
  spaces: SpaceNode[],
): FeatureNode | null {
  const exact = features.filter((f) => featureCoordinates.get(f.id)?.has(planeKey(anchor.x, anchor.y)));
  if (exact.length) {
    const zExact = exact.find((f) => f.at.z === anchor.z);
    return zExact ?? exact[0];
  }

  const regionIndex = keyToRegion.get(planeKey(anchor.x, anchor.y));
  const spaceId = regionIndex === undefined ? null : spaces[regionIndex]?.id ?? null;
  const nearby = features
    .filter((f) => f.spaceId === spaceId)
    .map((f) => ({
      feature: f,
      distance: Math.abs(f.at.x - anchor.x) + Math.abs(f.at.y - anchor.y),
    }))
    .filter((candidate) => candidate.distance <= 1)
    .sort((a, b) => a.distance - b.distance);
  if (!nearby.length || (nearby.length > 1 && nearby[0].distance === nearby[1].distance)) return null;
  return nearby[0].feature;
}

function applyAnnotationToSpace(sp: SpaceNode, ann: Annotation): void {
  if (ann.kind) { sp.kind = ann.kind; sp.source = 'annotated'; }
  if (ann.name) { sp.name = ann.name; sp.source = 'annotated'; }
  if (ann.op === 'confirm') { sp.confidence = 1; sp.source = 'annotated'; }
  if (ann.links.length) { sp.links = [...new Set([...sp.links, ...ann.links])]; sp.source = 'annotated'; }
  if (ann.notes.trim()) { sp.notes = appendNote(sp.notes, ann.notes); sp.source = 'annotated'; }
}

function applyAnnotationToFeature(f: FeatureNode, ann: Annotation): void {
  if (ann.kind) { f.kind = ann.kind; f.source = 'annotated'; }
  if (ann.name) { f.name = ann.name; f.source = 'annotated'; }
  if (ann.op === 'confirm') { f.source = 'annotated'; }
  if (ann.links.length) { f.links = [...new Set([...f.links, ...ann.links])]; f.source = 'annotated'; }
  if (ann.notes.trim()) { f.notes = appendNote(f.notes, ann.notes); f.source = 'annotated'; }
}

function applyAnnotationToRelation(r: RelationNode, ann: Annotation): void {
  if (ann.kind) { r.kind = ann.kind; r.source = 'annotated'; }
  if (ann.name) { r.name = ann.name; r.source = 'annotated'; }
  if (ann.op === 'confirm') { r.confidence = 1; r.source = 'annotated'; }
  if (ann.links.length) { r.links = [...new Set([...r.links, ...ann.links])]; r.source = 'annotated'; }
  if (ann.notes.trim()) { r.notes = appendNote(r.notes, ann.notes); r.source = 'annotated'; }
}

function appendNote(existing: string, next: string): string {
  return existing ? `${existing}\n${next}` : next;
}
