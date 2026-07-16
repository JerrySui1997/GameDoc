// Phase 4 — Hitman-style mansion: an annotation-ops workout (plans/03 §4).
// Models Sgàil's ground-floor great hall: one big room a level designer wants
// to *conceptually* split into two functional zones (front-of-house vs the
// guarded back corner) without repainting a single wall, dense guard/camera
// markers, a corrected false-positive camera, and route notes pinned for
// whoever reads the space next. Exercises the three Phase 4 code fixes
// end-to-end: `op:'split'`, `scope:'feature'` (rename + suppress), and
// `Annotation.notes` surfacing.

import { makeAnnotation, type Cell, type HexelScene } from '../../../src/lib/hexel/types';
import { palette, rect, wallRing, mark, dedupe, assert, type Scenario } from '../lib';

const P = palette({
  'Stone Floor': 'floor',
  Wall: 'wall',
  Door: 'door',
  Guard: 'marker',
  Camera: 'marker',
  Disguise: 'marker',
});

export const mansionAnnotations: Scenario = {
  key: 'mansion-annotation-ops',
  title: 'Hitman-style mansion — split zones, feature rename/suppress, route notes',
  build: (): HexelScene => {
    const floor = P.id('Stone Floor');
    const wall = P.id('Wall');
    const door = P.id('Door');
    const guard = P.id('Guard');
    const camera = P.id('Camera');
    const disguise = P.id('Disguise');

    // One great hall, 20×10 outer, one entrance. Interior is a single 18×8
    // region until the split annotation below carves it into two zones.
    const hallFloor = rect(0, 0, 19, 9, 0, floor);
    const hallWalls = wallRing(0, 0, 19, 9, 1, wall, [{ x: 10, y: 0, tile: door }]);

    // West zone dressing: two guards + a camera + a disguise cache.
    const guard1 = mark(5, 2, 1, guard); // canonical seed for the west guard cluster
    const guard2 = mark(5, 7, 1, guard);
    const camera1 = mark(2, 2, 1, camera);
    const disguiseMark = mark(4, 8, 1, disguise);

    // East zone dressing: one guard + a camera that turns out to be a
    // false-positive read (a wall sconce the classifier mis-tagged 'marker').
    const guard3 = mark(14, 4, 1, guard);
    const camera2 = mark(17, 7, 1, camera); // will be suppressed

    const cells: Cell[] = dedupe([
      ...hallFloor, ...hallWalls,
      guard1, guard2, camera1, disguiseMark,
      guard3, camera2,
    ]);

    // 1. Split the hall into west/east zones — nearest-anchor partition, no
    //    new paint (infer.ts `splits` handling).
    const split = makeAnnotation({ x: 3, y: 4, z: 0 }, 'space');
    split.op = 'split';
    split.withAnchor = { x: 16, y: 4, z: 0 };

    // 2. Rename the west guard cluster into a named patrol route + notes.
    const patrolNote = makeAnnotation({ x: 5, y: 2, z: 1 }, 'feature');
    patrolNote.kind = 'patrol-route';
    patrolNote.name = 'Patrol Route A';
    patrolNote.notes = 'passes this corner roughly every 45 seconds';

    // 3. Suppress the false-positive east camera.
    const suppressCamera = makeAnnotation({ x: 17, y: 7, z: 1 }, 'feature');
    suppressCamera.op = 'suppress';

    // 4. Route notes pinned on the east zone itself (space-scope, no kind/name
    //    change — proves notes surface even with nothing else overridden).
    const zoneNote = makeAnnotation({ x: 16, y: 4, z: 0 }, 'space');
    zoneNote.notes = 'east zone is the guarded wing — cameras cover the door';

    return {
      title: "Sgàil Great Hall",
      subtitle: 'Ground floor — split into front-of-house and guarded wings',
      bounds: { x: 20, y: 10, z: 8 },
      palette: P.tiles,
      cells,
      annotations: [split, patrolNote, suppressCamera, zoneNote],
      sequence: [],
      location: { name: 'Sgàil Great Hall', notes: '' },
      defaultRot: 0,
    };
  },
  expect: (g) => {
    // ── split ─────────────────────────────────────────────────────────────
    assert.equal(g.spaces.length, 2, 'the hall should split into exactly two zones');
    const total = g.spaces.reduce((n, s) => n + s.cellCount, 0);
    assert.equal(total, 144, '18×8 interior, no cells lost or duplicated across the split');
    assert.ok(g.spaces.every((s) => s.parentId === null), 'split halves are siblings, not nested in each other');

    const west = g.spaces.find((s) => s.bbox.maxX < 10);
    const east = g.spaces.find((s) => s.bbox.minX >= 10);
    assert.ok(west && east, `expected a west (<x10) and east (>=x10) zone, got bboxes ${JSON.stringify(g.spaces.map((s) => s.bbox))}`);

    // ── feature rename ────────────────────────────────────────────────────
    const patrol = g.features.find((f) => f.name === 'Patrol Route A');
    assert.ok(patrol, 'expected the renamed patrol-route feature');
    assert.equal(patrol!.kind, 'patrol-route');
    assert.equal(patrol!.count, 2, 'both west guards should still be one cluster after the rename');
    assert.equal(patrol!.notes, 'passes this corner roughly every 45 seconds');
    assert.equal(patrol!.source, 'annotated');
    assert.equal(patrol!.spaceId, west!.id, 'the patrol cluster belongs to the west zone');

    // ── feature suppress ──────────────────────────────────────────────────
    assert.ok(!g.features.some((f) => f.kind === 'camera' && f.spaceId === east!.id), 'the false-positive east camera should be gone');
    assert.ok(g.features.some((f) => f.kind === 'camera' && f.spaceId === west!.id), 'the west camera (never suppressed) should remain');
    assert.equal(east!.featureIds.length, 1, 'east zone keeps only its guard feature after the camera is suppressed');

    // ── space notes ───────────────────────────────────────────────────────
    assert.equal(east!.notes, 'east zone is the guarded wing — cameras cover the door');
    assert.equal(east!.source, 'annotated');
  },
};
