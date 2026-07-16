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
import {
  appendSequenceStep,
  diffCells,
  resolveSequence,
  updateSequenceStep,
} from '../src/lib/hexel/sequence';

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
    palette: Object.values(P), cells, annotations, sequence: [],
    location: { name: '', notes: '' }, defaultRot: 0,
  };
}

test('sequence deltas resolve terrain changes across inherited steps', () => {
  const base = scn(rect(0, 0, 1, 0, 0, P.floor.id));
  const first = appendSequenceStep(base, 'Block the lane');
  const firstState = resolveSequence(first.scene, first.index);
  const changed = { ...firstState, cells: firstState.cells.filter((cell) => cell.x !== 1) };
  const updatedFirst = updateSequenceStep(first.scene, first.index, changed);
  const second = appendSequenceStep(updatedFirst, 'Open a bypass');
  const secondState = resolveSequence(second.scene, second.index);
  assert.equal(secondState.cells.length, 1);
  assert.equal(diffCells(firstState.cells, changed.cells).length, 1);
});

test('later sequence overrides survive edits to an earlier step', () => {
  const base = scn(rect(0, 0, 0, 0, 0, P.floor.id));
  const first = appendSequenceStep(base, 'Initial state');
  const firstState = resolveSequence(first.scene, first.index);
  const firstChanged = { ...firstState, cells: [...firstState.cells, { x: 1, y: 0, z: 0, t: P.floor.id }] };
  const firstUpdated = updateSequenceStep(first.scene, first.index, firstChanged);
  const second = appendSequenceStep(firstUpdated, 'Move marker');
  const secondState = resolveSequence(second.scene, second.index);
  const secondChanged = {
    ...secondState,
    cells: secondState.cells.map((cell) => cell.x === 1 ? { ...cell, t: P.grass.id } : cell),
  };
  const secondUpdated = updateSequenceStep(second.scene, second.index, secondChanged);
  const editedEarlier = updateSequenceStep(
    secondUpdated,
    first.index,
    { ...firstState, cells: [{ x: 0, y: 0, z: 0, t: P.grass.id }] },
  );
  const resolved = resolveSequence(editedEarlier, second.index);
  assert.equal(resolved.cells.find((cell) => cell.x === 0)?.t, P.grass.id);
  assert.equal(resolved.cells.find((cell) => cell.x === 1)?.t, P.grass.id);
});

test('sequence metadata round-trips with camera and presentation overlays', () => {
  const base = scn(rect(0, 0, 1, 0, 0, P.floor.id));
  const created = appendSequenceStep(base, 'Callout');
  created.scene.sequence[created.index].camera.floorZ = 1;
  created.scene.sequence[created.index].overlays.push({
    id: 'overlay-1',
    kind: 'text',
    points: [{ x: 0.5, y: 0.5 }],
    color: '#b44f3b',
    width: 3,
    text: 'Advance',
  });
  const roundTrip = asScene(JSON.parse(serializeScene(created.scene)));
  assert.equal(roundTrip.sequence[0].camera.floorZ, 1);
  assert.equal(roundTrip.sequence[0].overlays[0].text, 'Advance');
});

function rect(x0: number, y0: number, x1: number, y1: number, z: number, t: string): Cell[] {
  const out: Cell[] = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push({ x, y, z, t });
  return out;
}
function columnsConnected(columns: string[]): boolean {
  if (!columns.length) return false;
  const all = new Set(columns);
  const seen = new Set<string>([columns[0]]);
  const queue = [columns[0]];
  for (let head = 0; head < queue.length; head++) {
    const [x, y] = queue[head].split(',').map(Number);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const next = `${x + dx},${y + dy}`;
      if (all.has(next) && !seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen.size === all.size;
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

test('ramp tiles and route annotations preserve elevation and action flow', () => {
  const ramp = { id: 'ramp', label: 'Ramp', color: '#c9a24b', role: 'ramp' as const, glyph: '' };
  const floor = { id: 'floor', label: 'Floor', color: '#b9a06b', role: 'floor' as const, glyph: '' };
  const route: Annotation = {
    id: 'route-1', anchor: { x: 0, y: 0, z: 0 }, scope: 'route',
    kind: 'attack', name: 'High-ground push', op: undefined, withAnchor: null,
    links: [], notes: 'take the ramp before the objective',
    path: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 1 }, { x: 2, y: 0, z: 0 }],
  };
  const graph = inferSemantics({
    title: 'route',
    subtitle: '',
    bounds: { x: 4, y: 2, z: 4 },
    palette: [floor, ramp],
    cells: [
      { x: 0, y: 0, z: 0, t: floor.id },
      { x: 1, y: 0, z: 0, t: floor.id },
      { x: 1, y: 0, z: 1, t: ramp.id },
      { x: 2, y: 0, z: 0, t: floor.id },
    ],
    annotations: [route],
    location: { name: '', notes: '' },
    sequence: [],
    defaultRot: 0,
  });
  assert.equal(graph.relations.filter((r) => r.kind === 'ramp').length, 1);
  assert.equal(graph.routes[0].points[1].z, 1);
  assert.equal(graph.routes[0].notes, 'take the ramp before the objective');
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

test('a split annotation uses deterministic BFS and preserves connectivity', () => {
  const cells = rect(0, 0, 9, 4, 0, P.floor.id); // one 10×5 = 50-cell region
  assert.equal(inferSemantics(scn(cells)).spaces.length, 1, 'one space before split');
  const ann: Annotation = {
    id: 'an-split', anchor: { x: 1, y: 2, z: 0 }, scope: 'space',
    kind: undefined, name: undefined, op: 'split', withAnchor: { x: 8, y: 2, z: 0 },
    links: [], notes: '',
  };
  const g = inferSemantics(scn(cells, [ann]));
  assert.equal(g.spaces.length, 2, 'two spaces after split');
  const total = g.spaces.reduce((n, s) => n + s.cellCount, 0);
  assert.equal(total, 50, 'no cells lost or duplicated across the split halves');
  assert.ok(g.spaces.every((s) => s.cellCount > 0), 'both halves are non-empty');
  const primary = g.spaces.find((s) => s.columns.includes('1,2'));
  const secondary = g.spaces.find((s) => s.columns.includes('8,2'));
  assert.ok(primary && secondary && primary.id !== secondary.id, 'each anchor belongs to its own half');
  assert.ok(columnsConnected(primary!.columns), 'primary BFS half stays connected');
  assert.ok(columnsConnected(secondary!.columns), 'secondary BFS half stays connected');
});

test('a split annotation is a no-op when both anchors land in different regions', () => {
  const cells = [...rect(0, 0, 1, 1, 0, P.floor.id), ...rect(5, 0, 6, 1, 0, P.floor.id)];
  const ann: Annotation = {
    id: 'an-split-2', anchor: { x: 0, y: 0, z: 0 }, scope: 'space',
    kind: undefined, name: undefined, op: 'split', withAnchor: { x: 5, y: 0, z: 0 },
    links: [], notes: '',
  };
  assert.equal(inferSemantics(scn(cells, [ann])).spaces.length, 2, 'already-separate regions are untouched');
  const degenerate = { ...ann, id: 'an-split-same', withAnchor: { x: 0, y: 0, z: 0 } };
  const unchanged = inferSemantics(scn(cells, [degenerate]));
  assert.equal(unchanged.spaces.length, 2, 'coincident anchors are a no-op');
});

test('a feature-scoped annotation renames/re-kinds the nearest marker cluster', () => {
  const cells = [
    ...rect(0, 0, 4, 4, 0, P.floor.id),
    { x: 1, y: 1, z: 1, t: P.chest.id },
    { x: 2, y: 3, z: 1, t: P.chest.id },
    { x: 3, y: 2, z: 1, t: P.chest.id },
  ];
  const ann: Annotation = {
    id: 'an-feat', anchor: { x: 2, y: 3, z: 1 }, scope: 'feature',
    kind: 'treasure-cache', name: 'Grand Cache', op: undefined, withAnchor: null,
    links: [], notes: 'guarded by a pressure plate',
  };
  const g = inferSemantics(scn(cells, [ann]));
  assert.equal(g.features.length, 1, 'still one clustered feature');
  assert.equal(g.features[0].count, 3, 'the whole cluster, not just the anchored cell');
  assert.equal(g.features[0].kind, 'treasure-cache');
  assert.equal(g.features[0].name, 'Grand Cache');
  assert.equal(g.features[0].notes, 'guarded by a pressure plate');
  assert.equal(g.features[0].source, 'annotated');
  assert.notEqual(g.spaces[0].name, 'Grand Cache', 'feature scope must not rename its space');
});

test('feature annotations do not retarget a distant unrelated marker', () => {
  const orb: PaletteTile = { id: 't-orb', label: 'Orb', color: '#fff', role: 'marker', glyph: '○' };
  const cells = [
    ...rect(0, 0, 6, 6, 0, P.floor.id),
    { x: 1, y: 1, z: 1, t: P.chest.id },
    { x: 5, y: 5, z: 1, t: orb.id },
  ];
  const ann: Annotation = {
    id: 'an-feature-miss', anchor: { x: 3, y: 3, z: 0 }, scope: 'feature',
    kind: 'wrong-target', name: 'Wrong Target', op: undefined, withAnchor: null, links: [], notes: '',
  };
  const g = inferSemantics({
    ...scn(cells, [ann]),
    palette: [...Object.values(P), orb],
  });
  assert.equal(g.features.find((f) => f.kind === 'chest')?.name, 'Chest');
  assert.equal(g.features.find((f) => f.kind === 'orb')?.name, 'Orb');
});

test('a suppress annotation on scope:feature removes the feature entirely', () => {
  const cells = [
    ...rect(0, 0, 4, 4, 0, P.floor.id),
    { x: 1, y: 1, z: 1, t: P.chest.id },
  ];
  const ann: Annotation = {
    id: 'an-feat-sup', anchor: { x: 1, y: 1, z: 1 }, scope: 'feature',
    kind: undefined, name: undefined, op: 'suppress', withAnchor: null, links: [], notes: '',
  };
  const g = inferSemantics(scn(cells, [ann]));
  assert.equal(g.features.length, 0, 'the false-positive feature is gone');
  assert.ok(g.spaces[0].featureIds.length === 0, 'the space no longer references it');
});

test('Annotation.notes on a space annotation surfaces on the SpaceNode and flips source', () => {
  const cells = rect(0, 0, 4, 4, 0, P.floor.id);
  const ann: Annotation = {
    id: 'an-notes', anchor: { x: 0, y: 0, z: 0 }, scope: 'space',
    kind: undefined, name: undefined, op: undefined, withAnchor: null,
    links: [], notes: 'the floor here is trapped',
  };
  const ann2: Annotation = {
    id: 'an-notes-2', anchor: { x: 1, y: 1, z: 0 }, scope: 'space',
    kind: undefined, name: undefined, op: undefined, withAnchor: null,
    links: [], notes: 'the west wall is unsafe',
  };
  const g = inferSemantics(scn(cells, [ann, ann2]));
  assert.equal(g.spaces[0].notes, 'the floor here is trapped\nthe west wall is unsafe');
  assert.equal(g.spaces[0].source, 'annotated');
});

test('relation annotations apply metadata without losing relation suppression', () => {
  const cells = [
    ...rect(0, 0, 2, 2, 0, P.floor.id),
    ...rect(4, 0, 6, 2, 0, P.floor.id),
    { x: 3, y: 0, z: 1, t: P.wall.id },
    { x: 3, y: 2, z: 1, t: P.wall.id },
    { x: 3, y: 1, z: 1, t: P.door.id },
  ];
  const ann: Annotation = {
    id: 'an-relation', anchor: { x: 3, y: 1, z: 0 }, scope: 'relation',
    kind: 'boss-door', name: 'Boss Lock', op: 'confirm', withAnchor: null,
    links: ['boss'], notes: 'requires the red key',
  };
  const followUp: Annotation = {
    ...ann, id: 'an-relation-follow-up', kind: undefined, name: undefined,
    op: undefined, links: [], notes: 'check twice',
  };
  const g = inferSemantics(scn(cells, [ann, followUp]));
  assert.equal(g.relations.length, 1);
  assert.equal(g.relations[0].kind, 'boss-door');
  assert.equal(g.relations[0].name, 'Boss Lock');
  assert.equal(g.relations[0].confidence, 1);
  assert.deepEqual(g.relations[0].links, ['boss']);
  assert.equal(g.relations[0].notes, 'requires the red key\ncheck twice');
  assert.equal(g.spaces.every((s) => s.name !== 'Boss Lock'), true, 'relation scope must not touch spaces');

  const suppressed = inferSemantics(scn(cells, [{
    ...ann, id: 'an-relation-suppress', op: 'suppress', name: undefined, kind: undefined,
  }]));
  assert.equal(suppressed.relations.length, 0, 'relation suppress remains supported');
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

test('summarizeScene surfaces a pinned space note in the digest', () => {
  const cells = rect(0, 0, 4, 4, 0, P.floor.id);
  const ann: Annotation = {
    id: 'an-sum-notes', anchor: { x: 0, y: 0, z: 0 }, scope: 'space',
    kind: undefined, name: undefined, op: undefined, withAnchor: null,
    links: [], notes: 'watch the patrol timing here',
  };
  const s = summarizeScene(JSON.stringify(scn(cells, [ann])));
  assert.match(s, /watch the patrol timing here/, 'the digest should include the designer note');
});

test('summarizeScene includes space, feature, and relation notes', () => {
  const cells = [
    ...rect(0, 0, 2, 2, 0, P.floor.id),
    ...rect(4, 0, 6, 2, 0, P.floor.id),
    { x: 1, y: 1, z: 1, t: P.chest.id },
    { x: 3, y: 0, z: 1, t: P.wall.id },
    { x: 3, y: 2, z: 1, t: P.wall.id },
    { x: 3, y: 1, z: 1, t: P.door.id },
  ];
  const annotations: Annotation[] = [
    {
      id: 'an-summary-space', anchor: { x: 0, y: 0, z: 0 }, scope: 'space',
      kind: undefined, name: undefined, op: undefined, withAnchor: null, links: [],
      notes: 'space note',
    },
    {
      id: 'an-summary-feature', anchor: { x: 1, y: 1, z: 1 }, scope: 'feature',
      kind: undefined, name: undefined, op: undefined, withAnchor: null, links: [],
      notes: 'feature note',
    },
    {
      id: 'an-summary-relation', anchor: { x: 3, y: 1, z: 0 }, scope: 'relation',
      kind: undefined, name: undefined, op: undefined, withAnchor: null, links: [],
      notes: 'relation note',
    },
  ];
  const summary = summarizeScene(JSON.stringify(scn(cells, annotations)));
  assert.match(summary, /space note/);
  assert.match(summary, /feature note/);
  assert.match(summary, /relation note/);
});

// ── report ─────────────────────────────────────────────────────────────────

if (failures.length) {
  console.error(`\nhexel self-test: ${passed} passed, ${failures.length} FAILED\n`);
  console.error(failures.join('\n\n'));
  process.exit(1);
}
console.log(`hexel self-test: all ${passed} checks passed ✓`);
