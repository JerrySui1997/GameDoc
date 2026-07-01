// Headless self-test for the pure hexel libs (src/lib/hexel/*). No test runner is
// installed, so — like validate / crossref / doc-graph — this runs under tsx:
//   npm run hexel-test     (or:  tsx scripts/hexel-selftest.ts)
// It exercises the model healing (types.ts), the isometric geometry (layout.ts),
// and the inference + export engine (infer.ts / scene.ts), asserting the concrete
// behaviours named in the plan. Exits non-zero on the first failure.

import assert from 'node:assert/strict';

import {
  asScene,
  seedScene,
  serializeScene,
  makeCell,
  cellKey,
  type HexelScene,
} from '../src/lib/hexel/types';
import {
  project,
  unproject,
  rotateXY,
  unrotateXY,
  paintOrder,
  pick,
  cubeFaces,
} from '../src/lib/hexel/layout';
import {
  ROTATIONS,
  type Rotation,
  type Cell,
  type PaletteTile,
  type Annotation,
} from '../src/lib/hexel/types';
import { inferSemantics } from '../src/lib/hexel/infer';
import { summarizeScene, toPlanes, toOBJ } from '../src/lib/hexel/scene';

let passed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
  } catch (err) {
    failures.push(`✗ ${name}\n    ${(err as Error).message.split('\n').join('\n    ')}`);
  }
}

// ── types.ts ─────────────────────────────────────────────────────────────────

test('asScene({}) heals to the seeded scene with paint', () => {
  const s = asScene({});
  assert.ok(s.cells.length > 0, 'seeded scene should have cells');
  assert.ok(s.palette.length >= 4, 'seeded scene should have a palette');
});

test('serialize → asScene round-trips paint losslessly', () => {
  const a = seedScene();
  const b = asScene(JSON.parse(serializeScene(a)));
  assert.equal(b.cells.length, a.cells.length);
  assert.equal(b.palette.length, a.palette.length);
});

test('asScene drops cells whose tile id is dangling', () => {
  const s = seedScene();
  s.cells.push(makeCell(99, 99, 0, 'nonexistent-tile-id'));
  const healed = asScene(JSON.parse(serializeScene(s)));
  assert.ok(!healed.cells.some((c) => c.t === 'nonexistent-tile-id'), 'dangling cell should be dropped');
});

test('cellKey is stable and unique per coordinate', () => {
  assert.equal(cellKey({ x: 1, y: 2, z: 3 }), '1,2,3');
  assert.notEqual(cellKey({ x: 1, y: 2, z: 3 }), cellKey({ x: 3, y: 2, z: 1 }));
});

test('the seed has no duplicate cells; asScene collapses dupes (last wins)', () => {
  const s = seedScene();
  const keys = s.cells.map(cellKey);
  assert.equal(new Set(keys).size, keys.length, 'seed must not paint two cells at one coordinate');
  const withDupes = asScene({
    ...s,
    cells: [...s.cells, { x: 0, y: 0, z: 0, t: s.palette[1].id }, { x: 0, y: 0, z: 0, t: s.palette[2].id }],
  });
  const dk = withDupes.cells.map(cellKey);
  assert.equal(new Set(dk).size, dk.length, 'no duplicate keys survive asScene');
  assert.equal(withDupes.cells.find((c) => c.x === 0 && c.y === 0 && c.z === 0)?.t, s.palette[2].id, 'last write wins');
});

// ── layout.ts ────────────────────────────────────────────────────────────────

test('rotateXY / unrotateXY are inverses for every yaw', () => {
  for (const rot of ROTATIONS) {
    for (const [x, y] of [[3, 5], [-2, 7], [0, 0], [4, -6]]) {
      const r = rotateXY(x, y, rot);
      const back = unrotateXY(r.x, r.y, rot);
      assert.deepEqual(back, { x, y }, `yaw ${rot} on (${x},${y})`);
    }
  }
});

test('project → unproject recovers the ground cell for every yaw', () => {
  for (const rot of ROTATIONS) {
    for (let x = -3; x <= 3; x++) {
      for (let y = -3; y <= 3; y++) {
        const { sx, sy } = project(x, y, 0, rot);
        assert.deepEqual(unproject(sx, sy, rot, 0), { x, y }, `yaw ${rot} on (${x},${y})`);
      }
    }
  }
});

test('paintOrder sorts back-to-front and re-sorts when the view yaws', () => {
  const back = { x: 0, y: 0, z: 0 };
  const front = { x: 5, y: 5, z: 0 };
  const at0 = paintOrder([front, back], 0);
  assert.deepEqual(at0[0], back, 'at yaw 0 the low-sum cell is furthest back');
  const at180 = paintOrder([front, back], 180);
  assert.deepEqual(at180[0], front, 'at yaw 180 the order flips');
});

test('pick returns the topmost (highest) voxel under the cursor', () => {
  const low = makeCell(2, 2, 0, 'a');
  const high = makeCell(2, 2, 1, 'a');
  for (const rot of ROTATIONS) {
    // Screen centre of the high voxel's top face = projected centre of its top.
    const c = project(2.5, 2.5, 2, rot);
    const hit = pick(c.sx, c.sy, rot, [low, high]);
    assert.deepEqual(hit, high, `yaw ${rot} should pick the raised cell`);
  }
});

test('cubeFaces shows a 4-point top and exactly two front side faces', () => {
  for (const rot of ROTATIONS) {
    const f = cubeFaces(1, 1, 0, rot as Rotation);
    assert.equal(f.top.length, 4, `yaw ${rot} top is a quad`);
    assert.equal(f.sides.length, 2, `yaw ${rot} shows two front faces`);
    for (const s of f.sides) {
      const rn = rotateXY(s.dir.x, s.dir.y, rot as Rotation);
      assert.ok(rn.x + rn.y > 0, `yaw ${rot} side normal faces the viewer`);
      assert.equal(s.quad.length, 4);
    }
  }
});

// ── infer.ts (the inference engine) ──────────────────────────────────────────

const P = {
  floor: { id: 't-floor', label: 'Stone Floor', color: '#b9a06b', role: 'floor', glyph: '' },
  grass: { id: 't-grass', label: 'Grass', color: '#7d9b5a', role: 'floor', glyph: '' },
  wall: { id: 't-wall', label: 'Wall', color: '#5b5660', role: 'wall', glyph: '' },
  door: { id: 't-door', label: 'Door', color: '#cdb88a', role: 'door', glyph: '' },
  chest: { id: 't-chest', label: 'Chest', color: '#c9a24b', role: 'marker', glyph: '◆' },
} as const satisfies Record<string, PaletteTile>;

function scn(cells: Cell[], annotations: Annotation[] = []): HexelScene {
  return {
    title: 'T', subtitle: '', bounds: { x: 32, y: 32, z: 8 },
    palette: Object.values(P), cells, annotations,
    location: { name: '', notes: '' }, defaultRot: 0,
  };
}
function rect(x0: number, y0: number, x1: number, y1: number, z: number, t: string): Cell[] {
  const out: Cell[] = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push({ x, y, z, t });
  return out;
}

test('a long narrow strip is duck-typed as a corridor', () => {
  const g = inferSemantics(scn(rect(0, 0, 7, 0, 0, P.floor.id)));
  assert.equal(g.spaces.length, 1);
  assert.equal(g.spaces[0].kind, 'corridor', g.spaces[0].why);
});

test('an enclosed floor ringed by walls is a room', () => {
  const cells: Cell[] = [];
  for (let y = 0; y <= 6; y++)
    for (let x = 0; x <= 6; x++)
      cells.push({ x, y, z: x === 0 || x === 6 || y === 0 || y === 6 ? 1 : 0, t: x === 0 || x === 6 || y === 0 || y === 6 ? P.wall.id : P.floor.id });
  const g = inferSemantics(scn(cells));
  const room = g.spaces.find((s) => s.cellCount === 25);
  assert.ok(room, 'the 5×5 interior should be one space');
  assert.equal(room!.kind, 'room', room!.why);
});

test('a wall gap (door) between two rooms is detected as a connection', () => {
  const cells = [
    ...rect(0, 0, 2, 2, 0, P.floor.id),
    ...rect(4, 0, 6, 2, 0, P.floor.id),
    { x: 3, y: 0, z: 1, t: P.wall.id },
    { x: 3, y: 2, z: 1, t: P.wall.id },
    { x: 3, y: 1, z: 1, t: P.door.id }, // the door
  ];
  const g = inferSemantics(scn(cells));
  assert.equal(g.spaces.length, 2, 'two separate rooms');
  assert.ok(g.relations.some((r) => r.kind === 'door'), 'a door relation links them');
});

test('three chest marks in one region cluster to one feature, count 3', () => {
  const cells = [
    ...rect(0, 0, 4, 4, 0, P.floor.id),
    { x: 1, y: 1, z: 1, t: P.chest.id },
    { x: 2, y: 3, z: 1, t: P.chest.id },
    { x: 3, y: 2, z: 1, t: P.chest.id },
  ];
  const g = inferSemantics(scn(cells));
  assert.equal(g.features.length, 1);
  assert.equal(g.features[0].kind, 'chest');
  assert.equal(g.features[0].count, 3);
});

test('a region nested inside a larger one gets a parentId', () => {
  const cells: Cell[] = rect(0, 0, 8, 8, 0, P.grass.id);
  // Carve a tiny walled room at the centre, on the grass.
  for (const [x, y] of [[3, 3], [4, 3], [5, 3], [3, 4], [5, 4], [3, 5], [4, 5], [5, 5]] as const) {
    // replace the grass cell with a wall
    const i = cells.findIndex((c) => c.x === x && c.y === y);
    if (i >= 0) cells.splice(i, 1);
    cells.push({ x, y, z: 1, t: P.wall.id });
  }
  const i = cells.findIndex((c) => c.x === 4 && c.y === 4);
  if (i >= 0) cells.splice(i, 1);
  cells.push({ x: 4, y: 4, z: 0, t: P.floor.id }); // inner room floor
  const g = inferSemantics(scn(cells));
  const garden = g.spaces.find((s) => s.cellCount > 50);
  const inner = g.spaces.find((s) => s.cellCount === 1);
  assert.ok(garden && inner, 'both the garden and the inner room exist');
  assert.equal(inner!.parentId, garden!.id, 'the inner room nests in the garden');
});

test('open grassy ground is duck-typed as a garden', () => {
  const g = inferSemantics(scn(rect(0, 0, 5, 5, 0, P.grass.id)));
  assert.equal(g.spaces[0].kind, 'garden', g.spaces[0].why);
});

test('a merge annotation fuses two regions into one space', () => {
  const cells = [...rect(0, 0, 1, 1, 0, P.floor.id), ...rect(5, 0, 6, 1, 0, P.floor.id)];
  assert.equal(inferSemantics(scn(cells)).spaces.length, 2, 'two regions before merge');
  const ann: Annotation = {
    id: 'an-1', anchor: { x: 0, y: 0, z: 0 }, scope: 'space',
    kind: undefined, name: undefined, op: 'merge', withAnchor: { x: 5, y: 0, z: 0 },
    links: [], notes: '',
  };
  assert.equal(inferSemantics(scn(cells, [ann])).spaces.length, 1, 'one space after merge');
});

test('a kind annotation overrides the guess and flips source to annotated', () => {
  const cells = rect(0, 0, 4, 0, 0, P.floor.id); // would infer corridor
  const ann: Annotation = {
    id: 'an-2', anchor: { x: 0, y: 0, z: 0 }, scope: 'space',
    kind: 'sanctum', name: undefined, op: undefined, withAnchor: null, links: [], notes: '',
  };
  const g = inferSemantics(scn(cells, [ann]));
  assert.equal(g.spaces[0].kind, 'sanctum');
  assert.equal(g.spaces[0].source, 'annotated');
});

// ── scene.ts (export + summary) ──────────────────────────────────────────────

test('a single voxel exports six exposed face-planes', () => {
  const planes = toPlanes(scn([{ x: 0, y: 0, z: 0, t: P.floor.id }]));
  assert.equal(planes.length, 6);
  const obj = toOBJ(planes);
  assert.equal(obj.split('\n').filter((l) => l.startsWith('v ')).length, 24);
  assert.equal(obj.split('\n').filter((l) => l.startsWith('f ')).length, 6);
});

test('adjacent voxels cull their shared faces', () => {
  const planes = toPlanes(scn([{ x: 0, y: 0, z: 0, t: P.floor.id }, { x: 1, y: 0, z: 0, t: P.floor.id }]));
  assert.equal(planes.length, 10, 'two cubes share one face pair → 12 − 2 = 10');
});

test('summarizeScene yields searchable, kind-aware text', () => {
  const s = summarizeScene(JSON.stringify(seedScene()));
  assert.ok(s.length > 0, 'non-empty');
  assert.match(s, /spaces|garden|room|chest/i);
});

// ── report ─────────────────────────────────────────────────────────────────

if (failures.length) {
  console.error(`\nhexel self-test: ${passed} passed, ${failures.length} FAILED\n`);
  console.error(failures.join('\n\n'));
  process.exit(1);
}
console.log(`hexel self-test: all ${passed} checks passed ✓`);
