import { z } from 'zod';

// ── Hexel Map data model ────────────────────────────────────────────────────
// A hexelMap is one full-width widget block that stores a whole 3D scene as JSON
// in its block prop (`dataJson`), exactly like the Narrative Timeline and the
// Character Studio. The scene is a sparse lattice of unit voxels (cells); each
// cell carries only a *material* id from the page's palette — raw, loosely-typed
// paint with no notion of "room" or "space". The semantic structure (spaces,
// features, relations) is never stored: it is *inferred* from the paint by
// src/lib/hexel/infer.ts, with a sparse list of explicit `annotations` layered
// on top as overrides. So the only things authored — and the only things that
// persist — are the palette, the painted cells, and a handful of annotations.
//
// Like the other widget blocks this is "loose-but-validated" body data: every
// field self-heals with `.catch(...)` so a partial or hand-edited value still
// parses, and the model can gain fields without migrating existing pages. Types
// are derived with z.infer — never hand written.

// ── Controlled vocabulary ───────────────────────────────────────────────────

// A palette tile's *role* is the one piece of explicit typing the paint carries:
// a minimal hint the inference engine needs to tell barriers from walkable space
// and to spot markers. 'auto' defers entirely to the engine (it guesses from a
// tile's height/colour). Everything richer — room vs garden vs corridor — is
// inferred per-region, never declared on a tile.
export const TILE_ROLES = ['auto', 'floor', 'wall', 'water', 'door', 'ramp', 'marker', 'void'] as const;
export type TileRole = (typeof TILE_ROLES)[number];

// What an annotation pins. A `space`/`feature` annotation names or re-kinds an
// inferred region/object; a `relation` annotation asserts a link the engine
// missed (or via `op` corrects the structure it found).
export const ANNOTATION_SCOPES = ['space', 'feature', 'relation', 'route'] as const;
export type AnnotationScope = (typeof ANNOTATION_SCOPES)[number];

// Structural corrections an annotation can apply to the inference.
export const ANNOTATION_OPS = ['merge', 'split', 'suppress', 'confirm'] as const;
export type AnnotationOp = (typeof ANNOTATION_OPS)[number];

// The four cardinal isometric yaws (rotation about the up/Z axis). Only these
// keep the painter's-order sort exact, so the camera snaps between them.
export const ROTATIONS = [0, 90, 180, 270] as const;
export type Rotation = (typeof ROTATIONS)[number];

// Lattice size limits. 64×64×16 is ~65k columns — comfortably past every
// scenario this product has been stress-tested with (see plans/03 Phase 5) —
// while keeping a hand-authored ceiling so a bad paste/import can't produce an
// unbounded scene the widget then has to render.
export const BOUNDS_MIN: Vec3Like = { x: 1, y: 1, z: 1 };
export const BOUNDS_MAX: Vec3Like = { x: 64, y: 64, z: 16 };
type Vec3Like = { x: number; y: number; z: number };

/** Clamp each axis of a bounds vector into [BOUNDS_MIN, BOUNDS_MAX], rounding
 *  down to a whole number of cells. */
export function clampBounds(b: Vec3Like): Vec3Like {
  const axis = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.floor(v)));
  return {
    x: axis(b.x, BOUNDS_MIN.x, BOUNDS_MAX.x),
    y: axis(b.y, BOUNDS_MIN.y, BOUNDS_MAX.y),
    z: axis(b.z, BOUNDS_MIN.z, BOUNDS_MAX.z),
  };
}

// Starter tile colours live here as literal hex (the widget styles cells with an
// inline `--fill` custom property, not Tailwind, so the palette is fully custom
// and not build-time constrained — same approach as the timeline's ACT_PALETTE).
export const TILE_SWATCHES = [
  '#7d9b5a', // grass
  '#b9a06b', // sand / stone
  '#5b5660', // wall
  '#3f6f8f', // water
  '#c9a24b', // gold / marker
  '#7c5b7c', // plum
  '#4a6b7c', // slate
  '#b5683c', // ember
] as const;

// ── Vec3 ────────────────────────────────────────────────────────────────────

export const Vec3Schema = z.object({
  x: z.number().int().catch(0),
  y: z.number().int().catch(0),
  z: z.number().int().catch(0),
});
export type Vec3 = z.infer<typeof Vec3Schema>;

/** Stable string key for a cell coordinate — used for O(1) lookup maps. */
export function cellKey(v: { x: number; y: number; z: number }): string {
  return `${v.x},${v.y},${v.z}`;
}

// ── Palette tile ────────────────────────────────────────────────────────────

export const PaletteTileSchema = z.object({
  id: z.string().catch(''), // healed to a fresh id by asScene if blank
  label: z.string().catch('Tile'),
  color: z.string().catch('#8a8f98'),
  role: z.enum(TILE_ROLES).catch('auto'),
  /** Optional glyph drawn on a marker tile (e.g. a chest ◆). */
  glyph: z.string().catch(''),
});
export type PaletteTile = z.infer<typeof PaletteTileSchema>;

// ── Cell (the paint) ────────────────────────────────────────────────────────

export const CellSchema = z.object({
  x: z.number().int().catch(0),
  y: z.number().int().catch(0),
  z: z.number().int().catch(0),
  /** Palette tile id. The only thing a cell carries — raw, untyped paint. */
  t: z.string().catch(''),
});
export type Cell = z.infer<typeof CellSchema>;

// ── Annotation (the sparse, explicit overrides) ─────────────────────────────

export const AnnotationSchema = z.object({
  id: z.string().catch(''),
  /** The seed cell this annotation is anchored to — re-attaches to whatever
   *  inferred region currently contains it, surviving re-paint. */
  anchor: Vec3Schema,
  scope: z.enum(ANNOTATION_SCOPES).catch('space'),
  /** Open-string overrides — the "only when necessary" type hint. */
  kind: z.string().optional().catch(undefined),
  name: z.string().optional().catch(undefined),
  /** Structural correction; pairs with `withAnchor` for merge/split. */
  op: z.enum(ANNOTATION_OPS).optional().catch(undefined),
  withAnchor: Vec3Schema.nullable().catch(null),
  /** Page ids this thing links to (character / location pages). */
  links: z.array(z.string()).catch([]),
  notes: z.string().catch(''),
  /** Ordered movement path for a route-scoped annotation. */
  path: z.array(Vec3Schema).optional().catch([]),
});
export type Annotation = z.infer<typeof AnnotationSchema>;

// ── Editable level sequence ──────────────────────────────────────────────────

export const SequenceCellChangeSchema = z.object({
  x: z.number().int().catch(0),
  y: z.number().int().catch(0),
  z: z.number().int().catch(0),
  /** A tile id sets/replaces the cell; null removes it. */
  t: z.string().nullable().catch(null),
});
export type SequenceCellChange = z.infer<typeof SequenceCellChangeSchema>;

export const SequenceAnnotationChangeSchema = z.object({
  id: z.string().catch(''),
  action: z.enum(['upsert', 'remove']).catch('upsert'),
  annotation: AnnotationSchema.nullable().catch(null),
});
export type SequenceAnnotationChange = z.infer<typeof SequenceAnnotationChangeSchema>;

export const SequenceCameraSchema = z.object({
  rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).catch(0),
  floorZ: z.number().int().min(0).catch(0),
  zoom: z.number().positive().catch(1),
  tx: z.number().finite().catch(0),
  ty: z.number().finite().catch(0),
});
export type SequenceCamera = z.infer<typeof SequenceCameraSchema>;

export const SequenceLayersSchema = z.object({
  semantics: z.boolean().catch(true),
  routes: z.boolean().catch(true),
  routeId: z.string().nullable().catch(null),
  routeProgress: z.number().min(0).max(1).catch(0),
});
export type SequenceLayers = z.infer<typeof SequenceLayersSchema>;

export const OverlayPointSchema = z.object({
  x: z.number().min(0).max(1).catch(0),
  y: z.number().min(0).max(1).catch(0),
});
export type OverlayPoint = z.infer<typeof OverlayPointSchema>;

export const SequenceOverlaySchema = z.object({
  id: z.string().catch(''),
  kind: z.enum(['pen', 'arrow', 'circle', 'text']).catch('pen'),
  points: z.array(OverlayPointSchema).catch([]),
  color: z.string().catch('#b44f3b'),
  width: z.number().positive().catch(2),
  text: z.string().catch(''),
});
export type SequenceOverlay = z.infer<typeof SequenceOverlaySchema>;

export const SequenceStepSchema = z.object({
  id: z.string().catch(''),
  title: z.string().catch(''),
  narration: z.string().catch(''),
  durationMs: z.number().int().positive().nullable().catch(null),
  cellChanges: z.array(SequenceCellChangeSchema).catch([]),
  annotationChanges: z.array(SequenceAnnotationChangeSchema).catch([]),
  camera: SequenceCameraSchema,
  layers: SequenceLayersSchema,
  overlays: z.array(SequenceOverlaySchema).catch([]),
});
export type SequenceStep = z.infer<typeof SequenceStepSchema>;

// ── Whole scene ─────────────────────────────────────────────────────────────

export const HexelSceneSchema = z.object({
  title: z.string().catch('Hexel Map'),
  subtitle: z.string().catch(''),
  bounds: Vec3Schema.catch({ x: 24, y: 24, z: 8 }),
  palette: z.array(PaletteTileSchema).catch([]),
  cells: z.array(CellSchema).catch([]),
  annotations: z.array(AnnotationSchema).catch([]),
  sequence: z.array(SequenceStepSchema).catch([]),
  location: z
    .object({ name: z.string().catch(''), notes: z.string().catch('') })
    .catch({ name: '', notes: '' }),
  defaultRot: z
    .union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)])
    .catch(0),
});
export type HexelScene = z.infer<typeof HexelSceneSchema>;

// ── Id minting ──────────────────────────────────────────────────────────────

let idSeq = 0;
/** Unique-enough id within one scene (prefixed by entity kind). */
export function mintId(prefix: 't' | 'an'): string {
  idSeq += 1;
  return `${prefix}-${Date.now().toString(36)}-${idSeq.toString(36)}`;
}

// ── Factories ───────────────────────────────────────────────────────────────

/** A fresh palette tile, coloured by where it lands in the current list. */
export function makeTile(index = 0, role: TileRole = 'auto'): PaletteTile {
  return {
    id: mintId('t'),
    label: `Tile ${index + 1}`,
    color: TILE_SWATCHES[index % TILE_SWATCHES.length],
    role,
    glyph: '',
  };
}

/** A fresh painted cell of a given tile. */
export function makeCell(x: number, y: number, z: number, t: string): Cell {
  return { x, y, z, t };
}

/** A fresh annotation anchored to a seed cell. */
export function makeAnnotation(anchor: Vec3, scope: AnnotationScope = 'space'): Annotation {
  return {
    id: mintId('an'),
    anchor: { ...anchor },
    scope,
    kind: undefined,
    name: undefined,
    op: undefined,
    withAnchor: null,
    links: [],
    notes: '',
    path: [],
  };
}

// ── Starter palette ─────────────────────────────────────────────────────────
// A freshly-inserted map ships with a small, evocative palette and a tiny seeded
// scene so the widget reads as a finished thing immediately and the live
// inference overlay has something to show (the same philosophy as the studio's
// default sheet and the timeline's seeded spine).

/** The default brushes a new map opens with. Stable labels so the inference can
 *  read material intent (grass → garden, stone → room, …). */
export function starterPalette(): PaletteTile[] {
  return [
    { id: mintId('t'), label: 'Grass', color: '#7d9b5a', role: 'floor', glyph: '' },
    { id: mintId('t'), label: 'Stone Floor', color: '#b9a06b', role: 'floor', glyph: '' },
    { id: mintId('t'), label: 'Wall', color: '#5b5660', role: 'wall', glyph: '' },
    { id: mintId('t'), label: 'Water', color: '#3f6f8f', role: 'water', glyph: '' },
    { id: mintId('t'), label: 'Door', color: '#cdb88a', role: 'door', glyph: '' },
    { id: mintId('t'), label: 'Chest', color: '#c9a24b', role: 'marker', glyph: '◆' },
  ];
}

/** A blank-but-valid, immediately-useful scene: a grass garden holding two
 *  chests, beside a small walled house with a door — so the inference overlay
 *  shows a garden / building / door / "2× chest" the moment the widget mounts. */
export function seedScene(): HexelScene {
  const palette = starterPalette();
  const byLabel = (label: string) => palette.find((p) => p.label === label)?.id ?? '';
  const grass = byLabel('Grass');
  const stone = byLabel('Stone Floor');
  const wall = byLabel('Wall');
  const door = byLabel('Door');
  const chest = byLabel('Chest');

  const cells: Cell[] = [];
  const rect = (x0: number, y0: number, x1: number, y1: number, z: number, t: string) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) cells.push(makeCell(x, y, z, t));
  };

  // Garden: a 9×6 grass field.
  rect(0, 0, 8, 5, 0, grass);
  // Two chests painted onto the grass (markers ride at z = 1, sitting on the floor).
  cells.push(makeCell(2, 2, 1, chest));
  cells.push(makeCell(5, 3, 1, chest));

  // House: a 5×5 footprint at the east edge — stone floor ringed by walls.
  rect(10, 0, 14, 4, 0, stone);
  for (let x = 10; x <= 14; x++) {
    cells.push(makeCell(x, 0, 1, wall));
    cells.push(makeCell(x, 4, 1, wall));
  }
  for (let y = 1; y <= 3; y++) {
    if (y !== 2) cells.push(makeCell(10, y, 1, wall)); // leave a gap for the door
    cells.push(makeCell(14, y, 1, wall));
  }
  // A door in the west wall gap, facing the garden.
  cells.push(makeCell(10, 2, 1, door));

  // Corridor: a 1-wide stone strip linking garden to the house door.
  rect(9, 2, 9, 2, 0, stone);

  return {
    title: 'Hexel Map',
    subtitle: 'Paint a place — the structure is read back as you go.',
    bounds: { x: 24, y: 24, z: 8 },
    palette,
    cells,
    annotations: [],
    sequence: [],
    location: { name: 'Untitled Place', notes: '' },
    defaultRot: 0,
  };
}

// ── Healing ─────────────────────────────────────────────────────────────────

/** Coerce loosely-stored block data into a valid scene. A blank / empty value
 *  heals to the seeded example so a freshly inserted widget is never empty; ids
 *  are minted for any palette tile / annotation that lacks one, and cells whose
 *  tile id no longer exists in the palette are dropped (so render/infer never
 *  chase a deleted material). */
export function asScene(value: unknown): HexelScene {
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  if (Object.keys(raw).length === 0) return seedScene();

  const parsed = HexelSceneSchema.safeParse(raw);
  const base = parsed.success ? parsed.data : seedScene();

  const palette = base.palette.map((p) => (p.id ? p : { ...p, id: mintId('t') }));
  const tileIds = new Set(palette.map((p) => p.id));
  // Drop cells whose tile no longer exists, and collapse any duplicate
  // coordinates to a single voxel (last write wins) so no two cells ever share a
  // key — robust against hand-edited / seeded / relay-roundtripped data.
  const seen = new Set<string>();
  const cells: Cell[] = [];
  for (let i = base.cells.length - 1; i >= 0; i--) {
    const c = base.cells[i];
    if (!tileIds.has(c.t)) continue;
    const k = cellKey(c);
    if (seen.has(k)) continue;
    seen.add(k);
    cells.push(c);
  }
  cells.reverse();
  const annotations = base.annotations.map((a) => (a.id ? a : { ...a, id: mintId('an') }));
  const bounds = clampBounds(base.bounds);

  return { ...base, palette, cells, annotations, bounds };
}

/** Serialize a scene back to the string stored in the block prop. */
export function serializeScene(scene: HexelScene): string {
  return JSON.stringify(scene);
}

/** Look a tile up by id (null when missing / dangling). */
export function tileById(scene: HexelScene, id: string): PaletteTile | null {
  return scene.palette.find((p) => p.id === id) ?? null;
}
