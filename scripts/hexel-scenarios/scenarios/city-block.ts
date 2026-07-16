// Phase 3 — Dishonored-style city block (plans/03-hexel-stress-test.md §3).
// A New Miri street: an open plaza wraps two buildings, one of which has a
// small chamber nested inside its hall (containment depth 2 — plaza ⊃ hall ⊃
// chamber), plus a walled canal channel to probe the water-classification
// threshold. Palette runs to 15 tiles so tile-index colour cycling
// (TILE_SWATCHES has 8 entries, types.ts:47) produces genuine duplicate
// swatches — another thing a real district-sized palette will hit.

import { makeAnnotation, type Cell, type HexelScene } from '../../../src/lib/hexel/types';
import { palette, rect, wallRing, mark, dedupe, assert, type Scenario } from '../lib';

const P = palette({
  Cobblestone: 'floor',
  'Marble Floor': 'floor',
  'Wood Floor': 'floor',
  Rug: 'floor',
  Carpet: 'floor',
  'Stone Wall': 'wall',
  'Brick Wall': 'wall',
  'Iron Gate': 'door',
  'Wood Door': 'door',
  'Canal Water': 'water',
  Fountain: 'marker',
  'Lamp Post': 'marker',
  Guard: 'marker',
  Crate: 'marker',
  Statue: 'marker',
});

export const cityBlock: Scenario = {
  key: 'city-block-nesting',
  title: 'Dishonored-style city block — nesting, street override, canal misclassification',
  build: (): HexelScene => {
    const cobble = P.id('Cobblestone');
    const marble = P.id('Marble Floor');
    const wall = P.id('Brick Wall');
    const stoneWall = P.id('Stone Wall');
    const ironGate = P.id('Iron Gate');
    const woodDoor = P.id('Wood Door');
    const canalWater = P.id('Canal Water');

    // Plaza: one big cobblestone blanket. Buildings are carved out of it —
    // their own wall rings overwrite the plaza floor at their perimeter
    // (dedupe keeps the wall, not the floor, at those columns) so the plaza
    // region wraps fully around both buildings' footprints.
    const plazaFloor = rect(0, 0, 49, 24, 0, cobble);

    // Building A ("Clockwork Manor"): a big hall with one nested side chamber.
    const hallFloor = rect(10, 8, 25, 20, 0, marble);
    const hallWalls = wallRing(10, 8, 25, 20, 1, wall, [{ x: 17, y: 8, tile: ironGate }]);
    const chamberWalls = wallRing(13, 11, 16, 14, 1, stoneWall, [{ x: 13, y: 12, tile: woodDoor }]);
    const fountainMarker = mark(9, 12, 1, P.id('Fountain'));

    // Building B: two rooms side by side (extra door relation + palette use).
    const bFloor = rect(30, 8, 45, 16, 0, marble);
    const bOuter = wallRing(30, 8, 45, 16, 1, wall, [{ x: 30, y: 12, tile: ironGate }]);
    const bDivider = Array.from({ length: 9 }, (_, y) => ({
      x: 38, y: 8 + y, z: 1, t: y === 4 ? woodDoor : stoneWall,
    }));
    const guardMarker = mark(41, 12, 1, P.id('Guard'));
    const crateMarker = mark(34, 10, 1, P.id('Crate'));

    // Street furniture out on the plaza itself.
    const lampMarkers = [mark(5, 3, 1, P.id('Lamp Post')), mark(45, 3, 1, P.id('Lamp Post'))];
    const statueMarker = mark(25, 3, 1, P.id('Statue'));

    // Canal: a walled, 3-wide water channel, spatially disconnected from the
    // plaza (gap at y:25-29) so it segments as its own region. 3 wide skips
    // the corridor rule (short<=2) but waterFrac>0.5 still hits — the
    // documented "canal reads as pond" finding.
    const canalFloor = rect(0, 30, 49, 32, 0, canalWater);

    const cells: Cell[] = dedupe([
      ...plazaFloor,
      ...hallFloor,
      ...hallWalls,
      ...chamberWalls,
      fountainMarker,
      ...bFloor,
      ...bOuter,
      ...bDivider,
      guardMarker,
      crateMarker,
      ...lampMarkers,
      statueMarker,
      ...canalFloor,
    ]);

    // Annotation: override the plaza's duck-typed kind ('courtyard') to
    // 'street' — this is the only way to get "street" into the graph at all,
    // since the classifier has no street output (plans/03 §3).
    const streetAnn = makeAnnotation({ x: 0, y: 0, z: 0 }, 'space');
    streetAnn.kind = 'street';
    streetAnn.name = 'New Miri Street';

    return {
      title: 'New Miri Street',
      subtitle: 'Clockwork Manor block — plaza, two buildings, canal',
      bounds: { x: 50, y: 34, z: 8 },
      palette: P.tiles,
      cells,
      annotations: [streetAnn],
      sequence: [],
      location: { name: 'New Miri Street', notes: '' },
      defaultRot: 0,
    };
  },
  expect: (g) => {
    // ── Nesting depth >1: chamber ⊂ hall ⊂ plaza ─────────────────────────────
    const plaza = g.spaces.find((s) => s.kind === 'street');
    assert.ok(plaza, `expected the plaza space annotated kind:'street', got kinds ${g.spaces.map((s) => s.kind).join(',')}`);
    assert.equal(plaza!.source, 'annotated', 'street kind must come from the annotation override, not inference');
    assert.equal(plaza!.parentId, null, 'the plaza is the outermost container, it has no parent');

    const hall = g.spaces.find((s) => s.bbox.minX === 11 && s.bbox.minY === 9 && s.kind === 'room');
    assert.ok(hall, `expected the hall interior as a distinct room space, got ${JSON.stringify(g.spaces.map((s) => s.bbox))}`);
    assert.equal(hall!.parentId, plaza!.id, 'hall sits inside the plaza bbox — plaza should be its parent');

    const chamber = g.spaces.find((s) => s.bbox.minX === 14 && s.bbox.minY === 12);
    assert.ok(chamber, 'expected the nested chamber as its own space');
    assert.equal(chamber!.parentId, hall!.id, 'chamber sits inside the hall bbox — hall (not plaza) should be its direct parent, proving depth-2 nesting');

    // ── Canal → pond misclassification (documented finding, not "fixed") ────
    const canal = g.spaces.find((s) => s.bbox.minY === 30);
    assert.ok(canal, 'expected the canal as its own segmented region');
    assert.equal(canal!.kind, 'pond', 'documents the finding: a 3-wide walled water channel reads as "pond", losing the canal/waterway semantic (classify() checks waterFrac before shape)');

    // ── Palette scale + duplicate colours (15 tiles, 8 swatches → repeats) ──
    assert.equal(P.tiles.length, 15, 'palette should carry 15 tiles for this scenario');
    const colorCounts = new Map<string, number>();
    for (const t of P.tiles) colorCounts.set(t.color, (colorCounts.get(t.color) ?? 0) + 1);
    assert.ok([...colorCounts.values()].some((n) => n > 1), 'expected at least one duplicate swatch once the palette exceeds TILE_SWATCHES.length (8)');

    // ── Sanity: buildings + furniture all came through ───────────────────────
    assert.ok(g.features.some((f) => f.kind === 'fountain'), 'expected the fountain feature');
    assert.ok(g.features.some((f) => f.kind === 'guard'), 'expected the guard feature');
    assert.ok(g.relations.some((r) => r.kind === 'door'), 'expected at least one door relation');
  },
};
