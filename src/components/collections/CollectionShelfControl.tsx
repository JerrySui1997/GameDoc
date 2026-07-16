'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { useCollections } from './CollectionsProvider';
import { slugify } from '@/components/docs/inline';
import { itemPrimary, type Collection, type CollectionItem } from '@/lib/collections/types';
import type { CollectionCandidate } from '@/lib/collections/detect';

// ── Collection action, in the block shelf ──────────────────────────────────
// Lives in the bottom-fixed BlockShelf (same real estate as move/width/colour/
// delete), never floating over the block's own text. Two states:
//  - `candidate` (not yet captured): "Collection" opens a popover previewing
//    the items that would be captured, with a name field to save.
//  - `linked` (already captured): opens a popover showing the live items and
//    a link into the Collections page to edit — the "quickly view" affordance.
// Only one of candidate/linked is ever passed; the caller (PageEditor) already
// knows which applies to the active block.

const PREVIEW_LIMIT = 6;

export function CollectionShelfControl({
  docId,
  blockId,
  candidate,
  linked,
}: {
  docId: string;
  blockId: string;
  candidate?: CollectionCandidate;
  linked?: Collection;
}) {
  const { collections, createCollection } = useCollections();
  const pathname = usePathname();
  const collectionsHref = pathname?.startsWith('/app') ? '/app/collections' : '/collections';

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!candidate && !linked) return null;

  async function save() {
    if (!candidate) return;
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
        columns: candidate.draft.columns,
        items: candidate.draft.items,
        sourceDocId: docId,
        sourceBlockId: blockId,
        sourceKind: candidate.draft.sourceKind,
      });
      setOpen(false);
      setName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save collection');
    } finally {
      setBusy(false);
    }
  }

  const columns = linked?.columns ?? candidate?.draft.columns ?? [];
  const items = linked?.items ?? candidate?.draft.items ?? [];

  return (
    <div className="relative flex-shrink-0">
      <button
        type="button"
        onClick={() => { setOpen((o) => !o); setError(null); }}
        title={linked ? `View collection "${linked.name}"` : `Capture this as a reusable collection (${items.length} items)`}
        className={`flex h-7 items-center gap-1 rounded-lg px-2 text-[11px] font-medium transition-colors hover:bg-canvas hover:text-ink ${linked ? 'text-teal' : 'text-muted'}`}
      >
        ⊞ {linked ? linked.name : 'Collection'}
      </button>
      {open && (
        <>
          <button type="button" aria-label="Close" className="fixed inset-0 z-20 cursor-default" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full right-0 z-30 mb-2 w-64 rounded-xl border border-line bg-surface p-2.5 shadow-lg">
            {linked ? (
              <>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-ink">{linked.name}</span>
                  <span className="flex-shrink-0 font-mono text-[10px] text-muted">{linked.items.length} items</span>
                </div>
                {linked.description && <p className="mb-1.5 text-xs text-muted">{linked.description}</p>}
                <ItemPreview columns={columns} items={items} />
                <a
                  href={`${collectionsHref}?open=${linked.id}`}
                  className="mt-2 block rounded-lg border border-line px-2 py-1 text-center text-xs font-semibold text-ink hover:bg-canvas"
                >
                  Edit collection →
                </a>
              </>
            ) : candidate ? (
              <>
                <p className="mb-1.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-muted">
                  Capture as collection · {items.length} items
                </p>
                <ItemPreview columns={columns} items={items} />
                <div className="mt-2 flex items-center gap-1">
                  <input
                    autoFocus
                    value={name}
                    onChange={(e) => { setName(e.target.value); setError(null); }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); save(); }
                      if (e.key === 'Escape') { setOpen(false); setName(''); setError(null); }
                    }}
                    placeholder="Name this collection…"
                    className="w-full rounded border border-line px-1.5 py-1 text-xs focus:border-brass focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={save}
                    disabled={busy}
                    className="shrink-0 rounded bg-ink px-2 py-1 text-xs font-semibold text-white hover:bg-ink-soft disabled:opacity-50"
                  >
                    Save
                  </button>
                </div>
                {error && <p className="mt-1 text-[11px] text-oxblood">{error}</p>}
              </>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

/** What's actually being placed into the collection — shown before *and* after
 *  capture, so it's never a mystery which lines/rows got swept in. */
function ItemPreview({ columns, items }: { columns: string[]; items: CollectionItem[] }) {
  const shown = items.slice(0, PREVIEW_LIMIT);
  return (
    <ul className="max-h-32 space-y-0.5 overflow-y-auto rounded-lg bg-canvas p-1.5 text-xs text-ink">
      {shown.map((it) => (
        <li key={it.id} className="truncate">· {itemPrimary(it, columns) || <span className="text-muted">—</span>}</li>
      ))}
      {items.length > PREVIEW_LIMIT && <li className="text-muted">+{items.length - PREVIEW_LIMIT} more</li>}
      {items.length === 0 && <li className="text-muted">No items detected.</li>}
    </ul>
  );
}
