'use client';

import { useMemo } from 'react';
import { useDocs } from './DocsProvider';
import { buildDocGraph, relatedTo, type EdgeKind, type RelatedLink } from '@/lib/docs/graph';

// The "Related" panel surfaces the semantic links the doc graph derives for the
// current page — mirrors / references / appears-in — in both directions, each
// under a side-correct heading. Hierarchy (`child_of`) is deliberately excluded:
// the sidebar tree and DocView's own "Child pages" section already represent
// parent/child, so listing it here would only duplicate them.
//
// The graph is rebuilt from the live `docs` snapshot inside a memo, so the panel
// stays in sync as pages are edited (the same reactive pattern the Character Card
// uses). content.json is never touched — this is a read-only projection.

// One literal class per edge kind. Tailwind v4 only emits classes it sees
// literally in source, so these are spelled out and looked up (never `bg-${k}`).
const KIND_DOT: Record<EdgeKind, string> = {
  child_of: 'bg-slate-300',
  mirrors: 'bg-sky-400',
  references: 'bg-indigo-400',
  features: 'bg-violet-400',
  mentions: 'bg-emerald-400',
};

export function RelatedPanel({ docId }: { docId: string }) {
  const { docs } = useDocs();

  // Build the whole graph and pull this page's links. Cheap at the docs-tree's
  // scale; if the collection grows large this is the natural thing to hoist into
  // a shared memo/provider so every consumer reuses one graph.
  const links = useMemo(() => {
    const graph = buildDocGraph(docs);
    return relatedTo(graph, docId).filter((l) => l.kind !== 'child_of');
  }, [docs, docId]);

  if (links.length === 0) return null;

  // Group by the side-correct label so each relationship reads as its own list
  // ("mirrors", "appears in", …), preserving first-seen order.
  const groups = new Map<string, RelatedLink[]>();
  for (const link of links) {
    const existing = groups.get(link.label);
    if (existing) existing.push(link);
    else groups.set(link.label, [link]);
  }

  return (
    <section className="pt-6">
      <h2 className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-wide text-muted">Related</h2>
      <div className="space-y-4">
        {[...groups.entries()].map(([label, items]) => (
          <div key={label}>
            <p className="mb-1.5 font-mono text-[10px] font-medium uppercase tracking-wide text-muted">{label}</p>
            <ul className="grid gap-2 sm:grid-cols-2">
              {items.map((link, i) => (
                <li key={`${link.otherId}-${i}`}>
                  {link.other ? (
                    <a
                      href={`/docs/${link.otherId}`}
                      className="flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-sm font-medium text-ink hover:border-brass hover:bg-brass-soft"
                    >
                      <span className={`h-2 w-2 shrink-0 rounded-full ${KIND_DOT[link.kind]}`} aria-hidden />
                      <span className="truncate">{link.other.title}</span>
                      <span className="ml-auto shrink-0 font-mono text-[10px] uppercase tracking-wide text-muted">{link.other.kind}</span>
                    </a>
                  ) : (
                    <span
                      className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700"
                      title="This reference points at a page that no longer exists."
                    >
                      <span className="shrink-0 text-amber-500" aria-hidden>⚠</span>
                      <span className="truncate">{link.otherId}</span>
                      <span className="ml-auto shrink-0 text-[10px] uppercase tracking-wide text-amber-500">missing</span>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
