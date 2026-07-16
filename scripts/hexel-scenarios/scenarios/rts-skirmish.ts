// Phase 5 — RTS skirmish map: a scale + bounds stress test (plans/03 §5).
// Model: an Age of Empires skirmish quadrant — bigger than the old fixed 24×24
// canvas, thousands of cells, four player start "keeps" walled off from one
// open battlefield, a river + a mountain ridge (with chokepoint gaps) carving
// tactical lanes, a lake, and scattered forest/gold/stone resource clusters.
// Exercises the new bounds ceiling (types.ts BOUNDS_MAX = 64×64×16) and
// measures whether build/infer/export still perform at this scale.

import { BOUNDS_MAX, type Cell, type HexelScene } from '../../../src/lib/hexel/types';
import { toOBJ, toPlanes } from '../../../src/lib/hexel/scene';
import { palette, rect, wallRing, mark, dedupe, assert, type Scenario } from '../lib';

const P = palette({
  Grass: 'floor',
  Water: 'water',
  Cliff: 'wall',
  'Keep Floor': 'floor',
  'Keep Wall': 'wall',
  'Keep Gate': 'door',
  Forest: 'marker',
  Gold: 'marker',
  Stone: 'marker',
});

/** A deterministic grid of marker cells over a rect — the stand-in for
 *  "scattered resource nodes" without any non-reproducible randomness. */
function gridMarkers(x0: number, y0: number, x1: number, y1: number, step: number, z: number, t: string): Cell[] {
  const out: Cell[] = [];
  for (let y = y0; y <= y1; y += step) for (let x = x0; x <= x1; x += step) out.push(mark(x, y, z, t));
  return out;
}

export const rtsSkirmish: Scenario = {
  key: 'rts-skirmish-map',
  title: 'RTS skirmish quadrant — scale + bounds stress test',
  build: (): HexelScene => {
    const grass = P.id('Grass');
    const water = P.id('Water');
    const cliff = P.id('Cliff');
    const keepFloor = P.id('Keep Floor');
    const keepWall = P.id('Keep Wall');
    const keepGate = P.id('Keep Gate');
    const forest = P.id('Forest');
    const gold = P.id('Gold');
    const stone = P.id('Stone');

    const { x: MX, y: MY, z: MZ } = BOUNDS_MAX; // 64×64×16 — paint right up to the ceiling

    // Base terrain fills the whole lattice.
    const base = rect(0, 0, MX - 1, MY - 1, 0, grass);

    // A north-south river, 4 wide, the full height of the map.
    const river = rect(30, 0, 33, MY - 1, 0, water);

    // A lake tucked in the SE quadrant, clear of the keep and the ridge.
    const lake = rect(45, 45, 54, 52, 0, water);

    // An east-west mountain ridge with three gaps (the river's own channel
    // plus two land passes) — tactical chokepoints, not a hard wall between
    // two disconnected halves. Ridge sits at z=1 over the z=0 floor below it,
    // matching every other wall in this file.
    const ridgeGapX = (x: number) => (x >= 30 && x <= 33) || (x >= 14 && x <= 15) || (x >= 48 && x <= 49);
    const ridge: Cell[] = [];
    for (const y of [30, 31, 32]) for (let x = 0; x < MX; x++) if (!ridgeGapX(x)) ridge.push(mark(x, y, 1, cliff));

    // Four walled player-start keeps, one per corner, each with a single gate
    // facing the open field. 9×9 footprints, clear of the river/ridge/lake.
    const keep = (x0: number, y0: number, gate: { x: number; y: number }) => ({
      floor: rect(x0, y0, x0 + 8, y0 + 8, 0, keepFloor),
      walls: wallRing(x0, y0, x0 + 8, y0 + 8, 1, keepWall, [{ x: gate.x, y: gate.y, tile: keepGate }]),
    });
    const nw = keep(2, 2, { x: 10, y: 6 });   // gate on the east wall, facing the field
    const ne = keep(53, 2, { x: 53, y: 6 });  // gate on the west wall
    const sw = keep(2, 53, { x: 6, y: 53 });  // gate on the north wall
    const se = keep(53, 53, { x: 53, y: 57 }); // gate on the west wall

    // Resource clusters — deliberately dense (a real "hundreds of markers"
    // stress) and deliberately clear of the keeps/river/ridge/lake.
    const forestNW = gridMarkers(13, 2, 27, 27, 2, 1, forest);
    const forestSE = gridMarkers(36, 36, 44, 44, 2, 1, forest);
    const goldNE = gridMarkers(36, 2, 50, 27, 3, 1, gold);
    const stoneSW = gridMarkers(13, 36, 27, 50, 3, 1, stone);

    const cells: Cell[] = dedupe([
      ...base, ...river, ...lake, ...ridge,
      ...nw.floor, ...nw.walls, ...ne.floor, ...ne.walls, ...sw.floor, ...sw.walls, ...se.floor, ...se.walls,
      ...forestNW, ...forestSE, ...goldNE, ...stoneSW,
    ]);

    return {
      title: 'Ashfen Crossing',
      subtitle: 'A four-player skirmish quadrant — river, ridge chokepoints, lake, four keeps',
      bounds: { x: MX, y: MY, z: MZ },
      palette: P.tiles,
      cells,
      annotations: [],
      sequence: [],
      location: { name: 'Ashfen Crossing', notes: '' },
      defaultRot: 0,
    };
  },
  expect: (g, scene) => {
    // ── scale ────────────────────────────────────────────────────────────
    assert.ok(
      scene.cells.length >= 4000 && scene.cells.length <= 8000,
      `expected a dense 4,000–8,000 cell map, got ${scene.cells.length}`,
    );
    assert.deepEqual(scene.bounds, BOUNDS_MAX, 'scene should be painted right up to the documented bounds ceiling');

    // ── structure: one battlefield + four walled-off keeps nested inside it ─
    assert.equal(g.spaces.length, 5, 'expected one open battlefield plus four keep interiors');
    const byCell = [...g.spaces].sort((a, b) => b.cellCount - a.cellCount);
    const field = byCell[0];
    const keeps = byCell.slice(1);
    assert.equal(keeps.length, 4);
    for (const k of keeps) {
      // 9×9 footprint, but the wall ring's own columns aren't walkable (a wall
      // cell outranks a floor cell in the same column, see infer.ts
      // ROLE_PRIORITY) — so the walkable interior is the inner 7×7 = 49, not
      // the full 81-cell footprint.
      assert.equal(k.cellCount, 49, `keep interior should be the inner 7×7, got ${k.cellCount}`);
      assert.equal(k.parentId, field.id, 'the ridge gaps should leave one giant field that contains every keep');
    }
    assert.equal(field.parentId, null);

    // ── the ridge's gaps actually work: north and south are NOT split ──────
    assert.ok(field.cellCount > 3000, 'the river/land gaps in the ridge should keep the field one connected region, not two');

    // ── door relations: exactly one gate per keep ───────────────────────────
    const doorRelations = g.relations.filter((r) => r.kind === 'door');
    assert.equal(doorRelations.length, 4, 'expected exactly one gate relation per keep');

    // ── resource features (clusters merge across the single shared field) ──
    const forestFeature = g.features.find((f) => f.kind === 'forest');
    const goldFeature = g.features.find((f) => f.kind === 'gold');
    const stoneFeature = g.features.find((f) => f.kind === 'stone');
    assert.ok(forestFeature && forestFeature.count > 100, 'expected the two forest patches to merge into one dense cluster');
    assert.ok(goldFeature && goldFeature.count > 20);
    assert.ok(stoneFeature && stoneFeature.count > 10);

    // ── export doesn't fall over at this scale ──────────────────────────────
    const planes = toPlanes(scene);
    const obj = toOBJ(planes);
    assert.ok(planes.length > 0 && obj.length > 0, 'OBJ export should produce real output at this scale');
    console.log(
      `    (rts-skirmish-map) OBJ export: ${planes.length} planes, ${(obj.length / 1024).toFixed(1)} KB`,
    );
  },
};
