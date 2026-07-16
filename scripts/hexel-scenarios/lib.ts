// ── Hexel stress-test harness ───────────────────────────────────────────────
// Shared plumbing for the product stress-test scenarios (plans/03-hexel-stress-test.md).
// Each scenario builds a real HexelScene in code (never hand-typed JSON), runs it
// through inferSemantics exactly like the widget/MCP do, and asserts the shape a
// real level designer would expect. Mirrors the assert style of hexel-selftest.ts.

import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

import { makeCell, makeTile, makeAnnotation, serializeScene, type Cell, type HexelScene, type PaletteTile, type TileRole, type SequenceCamera, type SequenceOverlay, type Vec3 } from '../../src/lib/hexel/types';
import { inferSemantics, type SemanticGraph } from '../../src/lib/hexel/infer';
import { appendSequenceStep, resolveSequence, updateSequenceStep } from '../../src/lib/hexel/sequence';

// ── Palette helper ───────────────────────────────────────────────────────────

/** Build a named palette in one call: `palette({ floor: 'floor', wall: 'wall', ... })`.
 *  Returns { tiles, id } where id(label) looks up a minted tile id by label. */
export function palette(spec: Record<string, TileRole>): { tiles: PaletteTile[]; id: (label: string) => string } {
  const tiles = Object.entries(spec).map(([label, role], i) => ({ ...makeTile(i, role), label }));
  const byLabel = new Map(tiles.map((t) => [t.label, t.id]));
  return { tiles, id: (label: string) => byLabel.get(label) ?? '' };
}

// ── Cell painting helpers ────────────────────────────────────────────────────

export function rect(x0: number, y0: number, x1: number, y1: number, z: number, t: string): Cell[] {
  const out: Cell[] = [];
  for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++)
      out.push(makeCell(x, y, z, t));
  return out;
}

/** A hollow rectangular wall ring at height z (the walls sit *on* z, i.e. paint
 *  at z=1 for a ring around a z=0 floor). `doors` swaps specific perimeter
 *  cells for a door tile instead of wall — that keeps the two sides as distinct
 *  inferred regions joined by an explicit `door` relation (a bare gap, with no
 *  wall or door cell at all, would just silently flood-fill the regions into
 *  one — see infer.ts isWalkable/segment). */
export function wallRing(
  x0: number, y0: number, x1: number, y1: number, z: number, t: string,
  doors: { x: number; y: number; tile: string }[] = [],
): Cell[] {
  const perim = new Map<string, { x: number; y: number; t: string }>();
  const put = (x: number, y: number) => perim.set(`${x},${y}`, { x, y, t });
  for (let x = x0; x <= x1; x++) { put(x, y0); put(x, y1); }
  for (let y = y0 + 1; y < y1; y++) { put(x0, y); put(x1, y); }
  for (const d of doors) perim.set(`${d.x},${d.y}`, { x: d.x, y: d.y, t: d.tile });
  return [...perim.values()].map((c) => makeCell(c.x, c.y, z, c.t));
}

export function mark(x: number, y: number, z: number, t: string): Cell {
  return makeCell(x, y, z, t);
}

/** Collapse duplicate coordinates (last write wins) — same rule as asScene(),
 *  needed because scenario builders often paint floor then overlay walls/doors. */
export function dedupe(cells: Cell[]): Cell[] {
  const seen = new Set<string>();
  const out: Cell[] = [];
  for (let i = cells.length - 1; i >= 0; i--) {
    const c = cells[i];
    const k = `${c.x},${c.y},${c.z}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(c);
  }

  out.reverse();
  return out;
}

export type SequenceEvent = {
  title: string;
  narration: string;
  set?: Cell[];
  remove?: Vec3[];
  camera?: SequenceCamera;
  overlays?: SequenceOverlay[];
};

/** Build a deliberately authored presentation sequence from sparse level events.
 * Each event is converted to a step delta, keeping the fixture representative of
 * the editor's persisted format instead of hiding a full snapshot in test data. */
export function withSequence(scene: HexelScene, events: SequenceEvent[]): HexelScene {
  let source: HexelScene = { ...scene, sequence: [] };
  for (const event of events) {
    const created = appendSequenceStep(source, event.title, event.camera);
    const current = resolveSequence(created.scene, created.index);
    const removed = new Set((event.remove ?? []).map((point) => `${point.x},${point.y},${point.z}`));
    const byKey = new Map(current.cells.map((cell) => [`${cell.x},${cell.y},${cell.z}`, cell]));
    for (const key of removed) byKey.delete(key);
    for (const cell of event.set ?? []) byKey.set(`${cell.x},${cell.y},${cell.z}`, cell);
    source = updateSequenceStep(created.scene, created.index, {
      ...current,
      cells: [...byKey.values()],
    });
    source.sequence[source.sequence.length - 1].narration = event.narration;
    source.sequence[source.sequence.length - 1].overlays = event.overlays ?? [];
  }
  return source;
}

// ── Scenario harness ─────────────────────────────────────────────────────────

export type Scenario = {
  key: string;
  title: string;
  build: () => HexelScene;
  /** Assertions against the inferred graph. Throw (via node:assert) to fail. */
  expect: (graph: SemanticGraph, scene: HexelScene) => void;
};

export type ScenarioResult = {
  key: string;
  title: string;
  ok: boolean;
  error?: string;
  cellCount: number;
  spaceCount: number;
  featureCount: number;
  relationCount: number;
  buildMs: number;
  inferMs: number;
};

/** Wrap a scene as the v2 block-JSON body a hexelMap page needs, ready to hand
 *  to gamedoc_create_doc / gamedoc_update_doc (parseBody auto-detects v2 JSON —
 *  see src/lib/docs/blocks.ts parseBody / mcp/src/data.ts). */
export function toPageBody(scene: HexelScene, blockId = 'hexel-1'): string {
  return JSON.stringify({
    v: 2,
    blocks: [{ id: blockId, type: 'hexelMap', props: { dataJson: serializeScene(scene) } }],
  });
}

/** Run every scenario, print a pass/fail report, and (if --publish) write each
 *  scene's ready-to-publish page body to scripts/hexel-scenarios/out/<key>.json
 *  for the agent to hand to the dryrun MCP's gamedoc_create_doc. Exits non-zero
 *  on the first failure, matching hexel-selftest.ts. */
export function runScenarios(scenarios: Scenario[]): void {
  const publish = process.argv.includes('--publish');
  const results: ScenarioResult[] = [];
  const failures: string[] = [];

  for (const s of scenarios) {
    const t0 = performance.now();
    let scene: HexelScene;
    try {
      scene = s.build();
    } catch (err) {
      failures.push(`✗ ${s.key} (build)\n    ${(err as Error).message}`);
      continue;
    }
    const t1 = performance.now();
    let graph: SemanticGraph;
    try {
      graph = inferSemantics(scene);
    } catch (err) {
      failures.push(`✗ ${s.key} (infer)\n    ${(err as Error).message}`);
      continue;
    }
    const t2 = performance.now();

    let ok = true;
    let error: string | undefined;
    try {
      s.expect(graph, scene);
    } catch (err) {
      ok = false;
      error = (err as Error).message;
      failures.push(`✗ ${s.key} (expect)\n    ${error.split('\n').join('\n    ')}`);
    }

    results.push({
      key: s.key,
      title: s.title,
      ok,
      error,
      cellCount: scene.cells.length,
      spaceCount: graph.spaces.length,
      featureCount: graph.features.length,
      relationCount: graph.relations.length,
      buildMs: Math.round((t1 - t0) * 100) / 100,
      inferMs: Math.round((t2 - t1) * 100) / 100,
    });

    if (publish) {
      const outDir = path.join(__dirname, 'out');
      mkdirSync(outDir, { recursive: true });
      writeFileSync(
        path.join(outDir, `${s.key}.json`),
        JSON.stringify({ id: s.key, title: s.title, body: toPageBody(scene) }, null, 2),
      );
    }
  }

  console.log('\nHexel scenario report:');
  console.log('-'.repeat(72));
  for (const r of results) {
    const status = r.ok ? 'PASS' : 'FAIL';
    console.log(
      `${status}  ${r.key.padEnd(28)} cells=${String(r.cellCount).padEnd(6)} ` +
      `spaces=${String(r.spaceCount).padEnd(3)} features=${String(r.featureCount).padEnd(3)} ` +
      `relations=${String(r.relationCount).padEnd(3)} build=${r.buildMs}ms infer=${r.inferMs}ms`,
    );
  }
  console.log('-'.repeat(72));

  if (failures.length) {
    console.error(`\n${results.length - failures.length} passed, ${failures.length} FAILED\n`);
    console.error(failures.join('\n\n'));
    process.exit(1);
  }
  console.log(`\nall ${results.length} scenarios passed ✓${publish ? ` (bodies written to scripts/hexel-scenarios/out/)` : ''}`);
}

// Re-export the node assert used by scenario `expect` blocks so scenario files
// need only one import.
export { assert };
