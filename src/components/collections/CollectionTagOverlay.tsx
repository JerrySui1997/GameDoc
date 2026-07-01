'use client';

import { useLayoutEffect, useMemo, useState, type RefObject } from 'react';
import { useCollections } from './CollectionsProvider';
import { slugify } from '@/components/docs/inline';
import type { CollectionCandidate } from '@/lib/collections/detect';

// ── Floating "name this collection" tags ──────────────────────────────────
// Given the auto-detected candidates for the current doc, anchors a small tag
// next to each block that could become a Collection. Clicking a tag opens a
// tiny inline name input (not the full CollectionCreator form); naming it
// persists the collection, after which the tag disappears (the block is now
// captured). Positioning queries the block's `data-id` element rendered by
// BlockNote 0.51 inside the editor wrapper.

export function CollectionTagOverlay({
  wrapRef,
  candidates,
  docId,
}: {
  /** The `relative` wrapper that contains the BlockNote editor DOM. */
  wrapRef: RefObject<HTMLDivElement | null>;
  candidates: CollectionCandidate[];
  docId: string;
}) {
  const { collections, createCollection } = useCollections();

  // Hide candidates whose block already backs a collection for this doc.
  const visible = useMemo(
    () =>
      candidates.filter(
        (c) => !collections.some((col) => col.sourceDocId === docId && col.sourceBlockId === c.anchorBlockId),
      ),
    [candidates, collections, docId],
  );

  const [tops, setTops] = useState<Record<string, number>>({});
  const [naming, setNaming] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visibleKey = visible.map((c) => c.anchorBlockId).join('|');

  // Measure each anchor block's vertical offset relative to the wrapper, and
  // keep it in sync as the document reflows (typing) or the window resizes.
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const measure = () => {
      const wrapTop = wrap.getBoundingClientRect().top;
      const next: Record<string, number> = {};
      for (const c of visible) {
        // JSON.stringify (not CSS.escape) for the attribute-value string: ids
        // can start with a digit, which CSS.escape would escape as an identifier
        // and break the match.
        const el = wrap.querySelector(`[data-id=${JSON.stringify(c.anchorBlockId)}]`);
        if (el) next[c.anchorBlockId] = el.getBoundingClientRect().top - wrapTop;
      }
      setTops(next);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [visibleKey, wrapRef]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save(cand: CollectionCandidate) {
    const id = slugify(name);
    if (!id) { setError('Name needs a letter or number'); return; }
    if (collections.some((c) => c.id === id)) { setError('A collection with that name exists'); return; }
    setBusy(true);
    setError(null);
    try {
      await createCollection({
        id,
        name: name.trim(),
        description: '',
        columns: cand.draft.columns,
        items: cand.draft.items,
        sourceDocId: docId,
        sourceBlockId: cand.anchorBlockId,
        sourceKind: cand.draft.sourceKind,
      });
      setNaming(null);
      setName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save collection');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-10" aria-hidden={false}>
      {visible.map((cand) => {
        const top = tops[cand.anchorBlockId];
        if (top == null) return null;
        const isNaming = naming === cand.anchorBlockId;
        return (
          <div key={cand.anchorBlockId} className="pointer-events-auto absolute right-1" style={{ top }}>
            {isNaming ? (
              <div className="flex items-center gap-1 rounded-lg border border-line bg-surface px-1.5 py-1 shadow-md">
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => { setName(e.target.value); setError(null); }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); save(cand); }
                    if (e.key === 'Escape') { setNaming(null); setName(''); setError(null); }
                  }}
                  placeholder="Name collection…"
                  className="w-36 rounded border border-line px-1.5 py-0.5 text-xs focus:border-brass focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => save(cand)}
                  disabled={busy}
                  className="rounded bg-ink px-2 py-0.5 text-xs font-semibold text-white hover:bg-ink-soft disabled:opacity-50"
                >
                  Save
                </button>
                {error && <span className="max-w-[10rem] text-[11px] text-oxblood">{error}</span>}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => { setNaming(cand.anchorBlockId); setName(''); setError(null); }}
                title={`Capture this ${cand.draft.sourceKind} as a reusable collection (${cand.draft.items.length} items)`}
                className="rounded-full border border-line bg-surface/90 px-2 py-0.5 text-[11px] font-medium text-muted shadow-sm backdrop-blur transition-colors hover:border-brass hover:text-ink"
              >
                ⊞ collection
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
