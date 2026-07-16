// An original GTA-scale city-planning sample: districts, arterial roads,
// waterfront, civic anchors, transit nodes, and development parcels. This is
// deliberately an original city rather than a reconstruction of a game map.

import { makeAnnotation, type Cell, type HexelScene } from '../../../src/lib/hexel/types';
import { palette, rect, mark, dedupe, assert, withSequence, type Scenario } from '../lib';

const P = palette({
  'Street Grid': 'floor',
  'Canal': 'water',
  'Building Mass': 'wall',
  'District Old Port': 'marker',
  'District Market Ward': 'marker',
  'District Glassworks': 'marker',
  'District North Estates': 'marker',
  'District Foundry': 'marker',
  'District Rail Yards': 'marker',
  'District Civic Basin': 'marker',
  'District Southbank': 'marker',
  'Transit Stop': 'marker',
  'Civic Landmark': 'marker',
  'Development Parcel': 'marker',
  'Park': 'marker',
});

function district(x: number, y: number, label: string, notes: string) {
  const a = makeAnnotation({ x, y, z: 1 }, 'feature');
  a.name = label;
  a.notes = notes;
  return a;
}

export const originalCityPlan: Scenario = {
  key: 'original-city-plan',
  title: 'Port Meridian — GTA-style city planning stress test',
  build: (): HexelScene => {
    const street = P.id('Street Grid');
    const canal = P.id('Canal');
    const building = P.id('Building Mass');
    const transit = P.id('Transit Stop');
    const civic = P.id('Civic Landmark');
    const parcel = P.id('Development Parcel');
    const park = P.id('Park');
    const cells: Cell[] = [...rect(0, 0, 63, 63, 0, street)];

    // Waterfront and a canal spine split the city into recognizable planning
    // sectors while bridges remain readable as door-like crossings.
    cells.push(...rect(29, 0, 33, 63, 0, canal));
    for (const y of [8, 24, 40, 56]) cells.push(...rect(29, y, 33, y, 0, street));

    // Dense blocks: wall mass at z=1 leaves the street grid as the playable
    // public realm. Each district has a distinct block rhythm.
    const blocks = [
      [2, 2, 10, 10], [14, 2, 24, 10], [38, 2, 47, 10], [51, 2, 61, 10],
      [2, 14, 10, 22], [14, 14, 24, 22], [38, 14, 47, 22], [51, 14, 61, 22],
      [2, 30, 10, 38], [14, 30, 24, 38], [38, 30, 47, 38], [51, 30, 61, 38],
      [2, 46, 10, 54], [14, 46, 24, 54], [38, 46, 47, 54], [51, 46, 61, 54],
    ] as const;
    for (const [x0, y0, x1, y1] of blocks) cells.push(...rect(x0, y0, x1, y1, 1, building));

    // Eight explicit district anchors make zoning legible even when the
    // classifier sees the whole public realm as one connected street space.
    const anchors = [
      [6, 12, 'Old Port', 'Historic mixed-use waterfront; preserve narrow parcels and pedestrian access.', 'District Old Port'],
      [19, 12, 'Market Ward', 'High-footfall retail core; transit and loading conflicts are intentional.', 'District Market Ward'],
      [42, 12, 'Glassworks', 'Commercial skyline parcel; reserve a tower setback along the canal.', 'District Glassworks'],
      [56, 12, 'North Estates', 'Low-density residential district; protect the park edge.', 'District North Estates'],
      [6, 42, 'Foundry', 'Industrial conversion district; stage brownfield remediation before housing.', 'District Foundry'],
      [19, 42, 'Rail Yards', 'Intermodal logistics; future station footprint occupies the east parcel.', 'District Rail Yards'],
      [42, 42, 'Civic Basin', 'Government and cultural anchor; central plaza is a public-realm priority.', 'District Civic Basin'],
      [56, 42, 'Southbank', 'Mixed-income expansion zone; flood resilience is a gating dependency.', 'District Southbank'],
    ] as const;
    for (const [x, y, , , tile] of anchors) cells.push(mark(x, y, 1, P.id(tile)));

    const transitStops = [[12, 12], [26, 28], [37, 40], [48, 28], [56, 44], [20, 56]] as const;
    for (const [x, y] of transitStops) cells.push(mark(x, y, 1, transit));
    const civicLandmarks = [[8, 28], [42, 28], [55, 28], [24, 44]] as const;
    for (const [x, y] of civicLandmarks) cells.push(mark(x, y, 1, civic));
    const parcels = [[12, 44], [26, 44], [37, 12], [48, 44], [60, 28], [20, 60]] as const;
    for (const [x, y] of parcels) cells.push(mark(x, y, 1, parcel));
    const parks = [[12, 4], [26, 20], [37, 52], [48, 20], [60, 52]] as const;
    for (const [x, y] of parks) cells.push(mark(x, y, 1, park));

    const scene: HexelScene = {
      title: 'Port Meridian',
      subtitle: 'Original open-world city plan — districts, transit, waterfront, civic anchors, and redevelopment parcels',
      bounds: { x: 64, y: 64, z: 8 },
      palette: P.tiles,
      cells: dedupe(cells),
      annotations: [
        ...anchors.map(([x, y, label, notes]) => district(x, y, label, notes)),
        district(12, 12, 'Transit Hub — Old Port', 'Interchange target: connect bus, tram, and ferry without severing the market frontage.'),
        district(42, 28, 'Civic Basin Plaza', 'City-scale gathering space; landmark visibility should survive tower development.'),
        district(12, 44, 'Foundry Redevelopment Parcel', 'Brownfield conversion candidate; reserve service access and flood-safe utilities.'),
      ],
      sequence: [],
      location: { name: 'Port Meridian', notes: 'Original fictional city-planning canvas for testing district-scale annotations and development dependencies.' },
      defaultRot: 0,
    };
    return withSequence(scene, [
      { title: 'Planning brief — public realm first', narration: 'Read the city as districts, transit, waterfront, and civic anchors before placing individual buildings.' },
      { title: 'Close the canal bridge', narration: 'A temporary closure severs one crossing and forces traffic toward the next bridge.', remove: [{ x: 29, y: 24, z: 0 }, { x: 30, y: 24, z: 0 }, { x: 31, y: 24, z: 0 }, { x: 32, y: 24, z: 0 }, { x: 33, y: 24, z: 0 }], overlays: [{ id: 'overlay-closure', kind: 'text', points: [{ x: 0.45, y: 0.48 }], color: '#b44f3b', width: 3, text: 'BRIDGE CLOSED' }] },
      { title: 'Temporary construction compound', narration: 'A construction parcel occupies the closed approach while the old port remains active.', set: [mark(30, 24, 1, building), mark(31, 24, 1, building)] },
      { title: 'Reroute transit', narration: 'The transit hub shifts one block east to preserve market frontage during construction.', remove: [{ x: 12, y: 12, z: 1 }], set: [mark(13, 12, 1, transit)] },
      { title: 'Civic plaza protected', narration: 'The civic basin remains a public gathering space while the skyline parcel grows.', set: [mark(42, 28, 1, civic)] },
      { title: 'Flood resilience works', narration: 'Southbank receives a raised resilience strip before new housing is released.', set: [mark(56, 43, 1, building), mark(57, 43, 1, building)] },
      { title: 'Old Port pedestrian hour', narration: 'Remove a service lane to show the intended pedestrian-first event condition.', remove: [{ x: 10, y: 12, z: 0 }, { x: 11, y: 12, z: 0 }] },
      { title: 'Rail yards station footprint', narration: 'The future station claims the east parcel and creates a new cross-city desire line.', set: [mark(20, 56, 1, transit), mark(21, 56, 1, transit)] },
      { title: 'Market Ward loading window', narration: 'A timed loading bay appears without changing the district boundary.', set: [mark(18, 12, 1, parcel)] },
      { title: 'Glassworks tower setback', narration: 'The development parcel steps back from the canal to preserve a civic view corridor.', remove: [{ x: 42, y: 12, z: 1 }] },
      { title: 'Park edge connected', narration: 'A green corridor links North Estates to the canal-side park.', set: [mark(27, 20, 1, park), mark(28, 20, 1, park)] },
      { title: 'Redevelopment handoff', narration: 'The final plan shows the dependencies a level designer can present to a team: closure, reroute, construction, and public-realm protection.', camera: { rotation: 180, floorZ: 1, zoom: 0.9, tx: 0, ty: 0 } },
    ]);
  },
  expect: (g, scene) => {
    assert.ok(scene.cells.length > 4300, `expected a city-scale paint set, got ${scene.cells.length}`);
    assert.deepEqual(scene.bounds, { x: 64, y: 64, z: 8 });
    assert.equal(g.features.filter((f) => f.name === 'Old Port' || f.name === 'Market Ward' || f.name === 'Glassworks' || f.name === 'North Estates' || f.name === 'Foundry' || f.name === 'Rail Yards' || f.name === 'Civic Basin' || f.name === 'Southbank').length, 8, 'all eight districts must be explicitly named');
    assert.ok(g.features.some((f) => f.kind === 'transit stop' && f.count >= 5), 'transit network markers should survive at city scale');
    assert.ok(g.features.some((f) => f.kind === 'civic landmark' && f.count >= 4), 'civic landmarks should be queryable');
    assert.ok(g.features.some((f) => f.kind === 'development parcel' && f.count >= 6), 'development parcels should be queryable');
    assert.ok(g.features.filter((f) => f.source === 'annotated').every((f) => f.notes.length > 0), 'city annotations must surface planning notes');
    assert.equal(scene.sequence.length, 12, 'the city plan should include an editable planning walkthrough');
  },
};
