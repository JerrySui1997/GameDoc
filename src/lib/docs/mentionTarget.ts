// Mention targets — the resolved "what does this @page-id point at?" used to
// render a mention chip, its hover excerpt, and the slide-in detail panel.
//
// A mention is just a page id written inline (see ./mentions). To draw it as a
// chip we need the target page's display title, its *kind* (so the chip can be
// colored by what it references — character / timeline / page — an automatic,
// self-forming color legend), and a short excerpt for the hover popup + panel.
// All three are projections of the existing docs collection, so this module is
// pure and server-safe (no React): it builds an index once from the docs snapshot
// and the editor looks chips up by id. content.json stays the single source.

import type { DocNode } from '@/lib/schema/doc';
import { parseBody, blocksToPlainText } from '@/lib/docs/blocks';
import { buildDocGraph, type NodeKind } from '@/lib/docs/graph';

/** Everything a mention chip / tooltip / panel needs about the page it points at. */
export type MentionTarget = {
  id: string;
  title: string;
  /** Inferred page kind — drives the chip's color (the auto color legend). */
  kind: NodeKind;
  /** A short, whitespace-collapsed lede pulled from the page's prose. */
  excerpt: string;
};

/** First ~280 chars of a page's readable prose, whitespace-collapsed. */
export function excerptFromBody(body: string): string {
  const text = blocksToPlainText(parseBody(body)).replace(/\s+/g, ' ').trim();
  if (text.length <= 280) return text;
  return `${text.slice(0, 279).trimEnd()}…`;
}

/**
 * Resolve every page into a mention target, keyed by id. Kind comes from the same
 * derived graph the Related panel uses (so "character"/"timeline"/"page" means the
 * same thing everywhere); the excerpt is a light second pass over each body. The
 * docs collection is small, and this is memoized on `docs` by callers — it never
 * recomputes on a keystroke (live prose flows through Yjs, not the docs snapshot).
 */
export function buildMentionIndex(docs: DocNode[]): Map<string, MentionTarget> {
  const graph = buildDocGraph(docs);
  const index = new Map<string, MentionTarget>();
  for (const doc of docs) {
    const node = graph.byId.get(doc.id);
    index.set(doc.id, {
      id: doc.id,
      title: doc.title,
      kind: node?.kind ?? 'page',
      excerpt: excerptFromBody(doc.body),
    });
  }
  return index;
}
