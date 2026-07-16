// An original competitive-FPS planning map, intentionally not a reproduction of
// any commercial game's protected layout. It stresses named zones, rotations,
// bombsite-style objectives, sightline blockers, and tactical feature metadata.

import { makeAnnotation, type Cell, type HexelScene } from '../../../src/lib/hexel/types';
import { palette, rect, wallRing, mark, dedupe, assert, withSequence, type Scenario } from '../lib';

const P = palette({
  'Concrete Floor': 'floor',
  'Retaining Wall': 'wall',
  'Steel Gate': 'door',
  Ramp: 'ramp',
  'Bombsite Marker': 'marker',
  'Spawn Marker': 'marker',
  'Cover Crate': 'marker',
  'Camera Node': 'marker',
});

function namedFeature(x: number, y: number, tile: string, name: string, notes: string) {
  const annotation = makeAnnotation({ x, y, z: 1 }, 'feature');
  annotation.name = name;
  annotation.notes = notes;
  return annotation;
}

function namedSpace(x: number, y: number, name: string, notes: string) {
  const annotation = makeAnnotation({ x, y, z: 0 }, 'space');
  annotation.name = name;
  annotation.notes = notes;
  return annotation;
}

export const originalTacticalMap: Scenario = {
  key: 'original-tactical-map',
  title: 'Redline Exchange — original 5v5 tactical map',
  build: (): HexelScene => {
    const floor = P.id('Concrete Floor');
    const wall = P.id('Retaining Wall');
    const gate = P.id('Steel Gate');
    const ramp = P.id('Ramp');
    const objective = P.id('Bombsite Marker');
    const spawn = P.id('Spawn Marker');
    const crate = P.id('Cover Crate');
    const camera = P.id('Camera Node');

    const cells: Cell[] = [
      ...rect(0, 0, 47, 31, 0, floor),
      // Long sightline blockers create three attack lanes and a protected mid.
      ...wallRing(2, 2, 11, 8, 1, wall, [{ x: 6, y: 2, tile: gate }]),
      ...wallRing(36, 2, 45, 8, 1, wall, [{ x: 40, y: 8, tile: gate }]),
      ...wallRing(2, 21, 11, 29, 1, wall, [{ x: 6, y: 29, tile: gate }]),
      ...wallRing(36, 21, 45, 29, 1, wall, [{ x: 40, y: 21, tile: gate }]),
      ...wallRing(18, 8, 29, 23, 1, wall, [
        { x: 18, y: 15, tile: gate },
        { x: 29, y: 16, tile: gate },
      ]),
      // A raised central divider forces mid players to choose a short or long
      // rotation instead of seeing both objectives from one tile.
      ...rect(14, 14, 16, 17, 1, wall),
      ...rect(31, 14, 33, 17, 1, wall),
      // Elevated mid catwalk: the ramp tile is a semantic transition, not
      // merely a taller wall.
      mark(23, 15, 1, ramp),
      // Objective, spawn, cover, and surveillance markers.
      mark(40, 5, 1, objective),
      mark(7, 25, 1, objective),
      mark(6, 5, 1, spawn),
      mark(41, 26, 1, spawn),
      mark(14, 12, 1, crate),
      mark(33, 19, 1, crate),
      mark(23, 5, 1, camera),
      mark(25, 26, 1, camera),
    ];

    const split = makeAnnotation({ x: 14, y: 12, z: 0 }, 'space');
    split.op = 'split';
    split.withAnchor = { x: 33, y: 19, z: 0 };
    const route = makeAnnotation({ x: 6, y: 5, z: 0 }, 'route');
    route.name = 'Attack Route — upper to Objective A';
    route.kind = 'attack';
    route.notes = 'Use the ramp for the high-ground peek; action beats are spawn, mid cut, catwalk, then plant.';
    route.path = [
      { x: 6, y: 5, z: 0 },
      { x: 14, y: 12, z: 0 },
      { x: 23, y: 15, z: 1 },
      { x: 32, y: 8, z: 0 },
      { x: 40, y: 5, z: 0 },
    ];

    const scene: HexelScene = {
      title: 'Redline Exchange',
      subtitle: 'Original 5v5 tactical map — two objectives, three lanes, named rotations',
      bounds: { x: 48, y: 32, z: 8 },
      palette: P.tiles,
      cells: dedupe(cells),
      annotations: [
        split,
        namedSpace(14, 12, 'Upper Attack Zone', 'Fast access to Objective A; mid control determines whether this zone is safe.'),
        namedSpace(33, 19, 'Lower Rotation Zone', 'Longer route to Objective B; cover and information nodes shape retakes.'),
        namedSpace(4, 4, 'Northwest Hold', 'Defender room with one gate; a safe plant denial position, not a free rotation.'),
        namedSpace(38, 4, 'Northeast Hold', 'Objective A support room; clear it before committing to the freight yard.'),
        namedSpace(20, 10, 'Mid Connector', 'Central connector with two gates; the highest-value rotation and information space.'),
        namedSpace(4, 23, 'Southwest Hold', 'Objective B support room; strongest when paired with low surveillance.'),
        namedSpace(38, 23, 'Southeast Hold', 'Defense fallback room; late retakes must choose between this room and the pump.'),
        route,
        namedFeature(40, 5, 'Bombsite Marker', 'Objective A — Freight Yard', 'Primary plant zone; exposed to long lane and elevated retake angle.'),
        namedFeature(7, 25, 'Bombsite Marker', 'Objective B — Flood Pump', 'Secondary plant zone; strongest defender hold is the south gate.'),
        namedFeature(6, 5, 'Spawn Marker', 'Attack Spawn — Service Road', 'Three rotation choices: upper lane, mid cut, or low lane.'),
        namedFeature(41, 26, 'Spawn Marker', 'Defense Spawn — Pump House', 'Fast B hold; rotating to A costs one full lane.'),
        namedFeature(14, 12, 'Cover Crate', 'Upper Lane Cover', 'Breaks the initial A-to-mid sightline without making the lane safe.'),
        namedFeature(33, 19, 'Cover Crate', 'Lower Lane Cover', 'Late-round retake cover; vulnerable to a wide swing from mid.'),
        namedFeature(23, 5, 'Camera Node', 'Mid Surveillance', 'Information node covering the upper connector; vulnerable to utility.'),
        namedFeature(25, 26, 'Camera Node', 'Low Surveillance', 'Information node covering the lower rotation; blind behind the divider.'),
      ],
      sequence: [],
      location: { name: 'Redline Exchange', notes: 'A neutral logistics terminal built around readable rotations rather than a copied real-world map.' },
      defaultRot: 0,
    };
    return withSequence(scene, [
      { title: 'Briefing — readable rotations', narration: 'Orient the team to the three lanes, two objectives, and the central information cut.' },
      { title: 'Attack spawn', narration: 'The attack begins at Service Road; the first decision is upper lane or mid cut.', set: [mark(8, 5, 1, crate)] },
      { title: 'Utility clears upper lane', narration: 'Upper lane cover breaks the first sightline without making the approach safe.', set: [mark(12, 10, 1, crate)] },
      { title: 'Mid gate breach', narration: 'Opening the central gate changes the defender response and exposes the catwalk route.', set: [mark(18, 15, 1, gate)], overlays: [{ id: 'overlay-breach', kind: 'arrow', points: [{ x: 0.36, y: 0.48 }, { x: 0.52, y: 0.45 }], color: '#b44f3b', width: 3, text: '' }] },
      { title: 'Ramp to high ground', narration: 'The route climbs one level before the attacker commits to the long sightline.', camera: { rotation: 90, floorZ: 1, zoom: 1.15, tx: 0, ty: 0 } },
      { title: 'Catwalk peek', narration: 'High ground reveals the objective support angle; the defender must give information or fall back.' },
      { title: 'Objective A pressure', narration: 'The attacking squad reaches Freight Yard while the lower rotation remains available.', set: [mark(40, 5, 1, crate)] },
      { title: 'Defender rotates', narration: 'A retake can arrive through mid or the long lower lane; neither is free.' },
      { title: 'Camera blind spot', narration: 'Utility cuts the surveillance node, creating a short window for the plant.', remove: [{ x: 23, y: 5, z: 1 }] },
      { title: 'Plant window', narration: 'The site is temporarily isolated; defenders must choose between two gates.' },
      { title: 'Lower lane retake', narration: 'The retake route re-enters through the lower rotation cover.', set: [mark(33, 19, 1, crate)] },
      { title: 'Mid control restored', narration: 'Regaining the central connector collapses the attacker choices.' },
      { title: 'Objective secured', narration: 'The sequence ends with a readable plant and a clear post-plant fallback.' },
    ]);
  },
  expect: (g, scene) => {
    assert.equal(scene.cells.length, dedupe(scene.cells).length, 'paint must not contain duplicate voxels');
    assert.ok(scene.cells.length > 1600, 'the tactical map should be materially larger than the elementary samples');
    assert.equal(g.features.filter((f) => f.name.startsWith('Objective')).length, 2, 'both objectives must be named');
    assert.equal(g.features.filter((f) => f.name.startsWith('Attack') || f.name.startsWith('Defense')).length, 2, 'both spawns must be named');
    assert.ok(g.features.some((f) => f.name === 'Mid Surveillance'), 'mid information node should be addressable');
    assert.ok(g.relations.filter((r) => r.kind === 'door').length >= 5, 'lane gates should produce tactical door relations');
    assert.equal(g.relations.filter((r) => r.kind === 'ramp').length, 1, 'the elevated catwalk must expose a ramp transition');
    assert.equal(g.routes.length, 1, 'the attack route must be represented as an ordered path');
    assert.equal(g.routes[0].points[2].z, 1, 'the route must preserve its elevation change');
    assert.ok(g.spaces.length >= 2, 'the split annotation must produce separately inspectable tactical zones');
    assert.equal(scene.sequence.length, 13, 'the encounter should be presentation-ready with authored beats');
    assert.equal(g.spaces.filter((s) => s.source === 'annotated').length, 7, 'every tactical zone must carry explicit planning metadata');
  },
};
