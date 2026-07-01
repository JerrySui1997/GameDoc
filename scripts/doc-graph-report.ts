/**
 * doc-graph-report.ts
 * Run: npm run doc-graph   (or: npx tsx scripts/doc-graph-report.ts)
 *
 * Builds the derived doc graph (src/lib/docs/graph.ts) from the live
 * content.json and prints a summary: node kinds, character facets, edge kinds,
 * the mirror bindings, a backlinks/related sample, and integrity (dangling
 * references + orphan pages). Strictly read-only — it never writes anything.
 */
import { readDocs } from '../src/lib/docs/store';
import {
  buildDocGraph,
  relatedTo,
  danglingEdges,
  orphanNodes,
  EDGE_LABELS,
  NODE_KINDS,
  EDGE_KINDS,
  type NodeKind,
  type EdgeKind,
} from '../src/lib/docs/graph';

function countBy<T, K extends string>(items: T[], kinds: readonly K[], pick: (t: T) => K): Record<K, number> {
  const out = Object.fromEntries(kinds.map((k) => [k, 0])) as Record<K, number>;
  for (const it of items) out[pick(it)]++;
  return out;
}

async function main() {
  const docs = await readDocs();
  const graph = buildDocGraph(docs);

  console.log(`\n=== Doc graph: ${graph.nodes.length} nodes, ${graph.edges.length} edges ===\n`);

  // Nodes by kind.
  const nodeCounts = countBy<typeof graph.nodes[number], NodeKind>(graph.nodes, NODE_KINDS, (n) => n.kind);
  console.log('Nodes by kind:');
  for (const k of NODE_KINDS) console.log(`  ${k.padEnd(10)} ${nodeCounts[k]}`);

  // Character facets — proof the studio sheet is queryable.
  const chars = graph.nodes.filter((n) => n.kind === 'character');
  if (chars.length) {
    console.log('\nCharacters (id · codename · tier · personality):');
    for (const c of chars) {
      const f = c.facets!;
      console.log(`  ${c.id.padEnd(14)} ${f.codename.padEnd(16)} tier ${f.tier ?? '—'}  ${f.personality || '—'}`);
    }
  }

  // Edges by kind.
  const edgeCounts = countBy<typeof graph.edges[number], EdgeKind>(graph.edges, EDGE_KINDS, (e) => e.kind);
  console.log('\nEdges by kind:');
  for (const k of EDGE_KINDS) console.log(`  ${k.padEnd(12)} ${edgeCounts[k]}  (${EDGE_LABELS[k].forward} / ${EDGE_LABELS[k].inverse})`);

  // Mirror bindings — the clearest existing cross-page relationship.
  const mirrors = graph.edges.filter((e) => e.kind === 'mirrors');
  if (mirrors.length) {
    console.log('\nmirrors edges (Character Card → source of truth):');
    for (const e of mirrors) {
      const from = graph.byId.get(e.from);
      const to = graph.byId.get(e.to);
      console.log(`  "${from?.title ?? e.from}"  →  "${to?.title ?? e.to}"${e.resolved ? '' : '  ⚠ DANGLING'}`);
    }
  }

  // Backlinks/related sample: the most-referenced page.
  const incoming = new Map<string, number>();
  for (const e of graph.edges) incoming.set(e.to, (incoming.get(e.to) ?? 0) + 1);
  const top = [...incoming.entries()].sort((a, b) => b[1] - a[1])[0];
  if (top) {
    const [pageId] = top;
    const node = graph.byId.get(pageId);
    console.log(`\nrelatedTo("${node?.title ?? pageId}")  — most-referenced page:`);
    for (const link of relatedTo(graph, pageId)) {
      const other = link.other?.title ?? `${link.otherId} (missing)`;
      console.log(`  ${link.direction === 'out' ? '→' : '←'} ${link.label.padEnd(13)} ${other}`);
    }
  }

  // Integrity.
  const dangling = danglingEdges(graph);
  const orphans = orphanNodes(graph);
  console.log('\n=== Integrity ===');
  console.log(`Dangling references: ${dangling.length}`);
  for (const e of dangling) console.log(`  ${e.kind}: "${graph.byId.get(e.from)?.title ?? e.from}" → ${e.to} (no such page)`);
  console.log(`Orphan pages (no links in or out): ${orphans.length}`);
  for (const n of orphans) console.log(`  ${n.id} — "${n.title}" [${n.kind}]`);

  console.log('');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
