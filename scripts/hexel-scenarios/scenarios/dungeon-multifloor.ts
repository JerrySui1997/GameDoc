// Phase 2 — Zelda-style multi-floor dungeon (plans/03-hexel-stress-test.md §2).
// Models a simplified OoT Forest Temple: several floors, each a chain of rooms
// linked by real doors (not open gaps — see wallRing's doc comment), with
// themed markers (switch / key / boss) and a stairs marker per floor.
//
// The interesting question this scenario is built to answer: inferSemantics
// segments space by *flooding the (x,y) plane* (see infer.ts buildPlane/segment)
// — z only feeds the wall-vs-floor role heuristic for 'auto' tiles and the
// bbox z-range, never region identity. So two floors that occupy the *same*
// (x,y) footprint, one physically above the other, are NOT seen as two rooms —
// they collapse into a single 2D region, and their floor materials double-count
// (materialsOf sums every cell in the column stack, not just the ground
// winner). `dungeonStackedCollapse` below proves this concretely.
//
// The workable pattern for real multi-floor content, `dungeonUnrolled`, is to
// give every floor a *distinct* (x,y) footprint (offset sideways) while still
// raising it in z — the isometric view then reads as "this floor sits above
// that one" (and toOBJ exports it at real height), while inference still
// segments each floor's rooms correctly. There is no first-class way to author
// a "these two rooms are vertically connected by stairs" relation across two
// disconnected regions (annotations only carry `links` to *page* ids, and the
// engine only auto-detects relations between XY-adjacent regions) — documented
// as a product gap, not fixed here (see plans/03-hexel-stress-test.md §2).

import type { Cell, HexelScene } from '../../../src/lib/hexel/types';
import { palette, rect, wallRing, dedupe, assert, type Scenario } from '../lib';

// ── dungeonUnrolled: 3 floors, each a 3-room chain, offset in XY + raised in Z ──

const P = palette({
  'Stone Floor': 'floor',
  Wall: 'wall',
  Door: 'door',
  Switch: 'marker',
  Key: 'marker',
  Boss: 'marker',
  Stairs: 'marker',
});

const FLOOR_DX = 30; // xy offset between floors — keeps regions disconnected
const FLOOR_DZ = 10; // z raise per floor — purely for the 3D/OBJ read, inference ignores it
const FLOOR_W = 20; // outer footprint x1 (0..20)
const FLOOR_H = 6; // outer footprint y1 (0..6)
const DOOR_Y = 3; // the row every divider door sits on

/** One floor: Landing → (door) → MidRoom[marker] → (door) → Alcove[Stairs]. */
function buildFloor(floorIndex: number, midMarkerLabel: 'Switch' | 'Key' | 'Boss'): Cell[] {
  const x0 = floorIndex * FLOOR_DX;
  const z = floorIndex * FLOOR_DZ;
  const floor = P.id('Stone Floor');
  const wall = P.id('Wall');
  const door = P.id('Door');

  const cells: Cell[] = [
    // Floor slab under the whole footprint.
    ...rect(x0, 0, x0 + FLOOR_W, FLOOR_H, z, floor),
    // Outer ring.
    ...wallRing(x0, 0, x0 + FLOOR_W, FLOOR_H, z + 1, wall),
    // Two full-height dividers, each with one door gap, splitting the footprint
    // into three chambers: Landing | MidRoom | Alcove.
    ...Array.from({ length: FLOOR_H + 1 }, (_, y) => ({ x: x0 + 6, y, z: z + 1, t: y === DOOR_Y ? door : wall })),
    ...Array.from({ length: FLOOR_H + 1 }, (_, y) => ({ x: x0 + 13, y, z: z + 1, t: y === DOOR_Y ? door : wall })),
    // Themed marker in the mid room, stairs marker in the alcove.
    { x: x0 + 9, y: DOOR_Y, z: z + 1, t: P.id(midMarkerLabel) },
    { x: x0 + 17, y: DOOR_Y, z: z + 1, t: P.id('Stairs') },
  ];
  return cells;
}

export const dungeonUnrolled: Scenario = {
  key: 'dungeon-unrolled-3floor',
  title: 'Zelda-style dungeon — 3 floors, offset footprints (working pattern)',
  build: (): HexelScene => {
    const cells = dedupe([
      ...buildFloor(0, 'Switch'),
      ...buildFloor(1, 'Key'),
      ...buildFloor(2, 'Boss'),
    ]);
    return {
      title: 'Sunken Grove Dungeon',
      subtitle: '3 floors — entry, key vault, boss chamber',
      bounds: { x: FLOOR_DX * 3 + FLOOR_W, y: FLOOR_H + 4, z: FLOOR_DZ * 3 + 4 },
      palette: P.tiles,
      cells,
      annotations: [],
      sequence: [],
      location: { name: 'Sunken Grove Dungeon', notes: '' },
      defaultRot: 0,
    };
  },
  expect: (g) => {
    assert.equal(g.spaces.length, 9, `expected 3 rooms × 3 floors = 9 spaces, got ${g.spaces.length}`);
    assert.ok(g.spaces.every((s) => s.kind === 'room'), 'every chamber should duck-type as a room');
    assert.equal(g.relations.filter((r) => r.kind === 'door').length, 6, 'expected 2 doors per floor × 3 floors');
    assert.equal(g.features.length, 6, 'expected 1 themed marker + 1 stairs marker per floor × 3 floors');
    const kinds = g.features.map((f) => f.kind).sort();
    assert.deepEqual(kinds, ['boss', 'key', 'stairs', 'stairs', 'stairs', 'switch'].sort(), `unexpected feature kinds: ${kinds.join(',')}`);
    // Nothing links the three floors' spaces to each other — confirms the
    // documented gap (no relation/annotation kind exists for "stairs go up to
    // this other, disconnected region").
    assert.equal(g.adjacency.length, 6, 'only the 6 in-floor door adjacencies should exist, none across floors');
  },
};

// ── dungeonStackedCollapse: proves the same-footprint collapse finding ────────

const room = (x0: number, y0: number, x1: number, y1: number, z: number, floorT: string, wallT: string): Cell[] => [
  ...rect(x0, y0, x1, y1, z, floorT),
  ...wallRing(x0, y0, x1, y1, z + 1, wallT),
];

export const dungeonStackedCollapse: Scenario = {
  key: 'dungeon-stacked-collapse',
  title: 'Two floors stacked on the SAME footprint (documents a real limitation)',
  build: (): HexelScene => {
    const floorT = P.id('Stone Floor');
    const wallT = P.id('Wall');
    // Ground floor: 5×5 outer room (3×3 walkable interior) at z=0/1.
    // Upper floor: the identical 5×5 footprint, directly above, at z=10/11.
    const cells = dedupe([
      ...room(0, 0, 4, 4, 0, floorT, wallT),
      ...room(0, 0, 4, 4, 10, floorT, wallT),
    ]);
    return {
      title: 'Vertical Stack (bug demo)',
      subtitle: 'Same XY footprint on two physically separate floors',
      bounds: { x: 8, y: 8, z: 16 },
      palette: P.tiles,
      cells,
      annotations: [],
      sequence: [],
      location: { name: 'Vertical Stack (bug demo)', notes: '' },
      defaultRot: 0,
    };
  },
  expect: (g) => {
    // The two floors are NOT reported as two spaces — the 2D plane collapse
    // merges them into one. This assertion documents current behaviour; if it
    // ever starts failing, the engine has gained real per-floor segmentation
    // and this whole finding (and the "unrolled" workaround) should be revisited.
    assert.equal(g.spaces.length, 1, 'documents the known same-footprint collapse (see file header) — two floors read as one space');
    const space = g.spaces[0];
    assert.equal(space.cellCount, 9, '3×3 walkable interior, counted once (columns, not voxels)');
    // materialsOf sums every cell in the column stack regardless of which one
    // "wins" the ground role — so a column with a floor cell on each of the
    // two stacked floors counts that tile twice. This is the double-count half
    // of the same finding.
    assert.equal(space.materials['Stone Floor'], 18, '9 interior columns × 2 stacked floor cells each = 18 — materials silently double-count stacked floors');
  },
};
