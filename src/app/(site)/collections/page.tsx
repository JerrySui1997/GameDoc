'use client';

import { useEffect, useState } from 'react';
import { useCollections } from '@/components/collections/CollectionsProvider';
import { CollectionEditor } from '@/components/collections/CollectionEditor';
import { COLLECTION_SOURCE_LABEL, type Collection } from '@/lib/collections/types';

export default function CollectionsPage() {
  const { collections } = useCollections();
  const [editing, setEditing] = useState<Collection | null>(null);

  // A block's shelf can deep-link here (?open=<id>) to jump straight into that
  // collection's editor — the "quickly view from the source page" path.
  useEffect(() => {
    const openId = new URLSearchParams(window.location.search).get('open');
    if (!openId) return;
    const found = collections.find((c) => c.id === openId);
    if (found) setEditing(found);
  }, [collections]);

  // Re-read the live record while editing so saves elsewhere stay consistent.
  const editTarget = editing ? collections.find((c) => c.id === editing.id) ?? editing : null;

  if (editTarget) {
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        <h1 className="text-2xl font-bold text-ink">Edit “{editTarget.name}”</h1>
        <CollectionEditor collection={editTarget} onClose={() => setEditing(null)} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-ink">Collections</h1>
        <p className="mt-1 text-sm text-muted">
          Reusable lists captured from your docs. Select a list, table, or comma-separated sentence in any doc and choose
          “Make collection from selection”, then embed it in a specialized page with a <span className="font-mono">Collection</span> field.
        </p>
      </div>

      {collections.length === 0 ? (
        <p className="rounded-xl border border-line bg-surface p-6 text-sm text-muted">
          No collections yet. Open a doc, select some content, and capture it as a collection.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {collections.map((c) => (
            <li key={c.id}>
              <button
                onClick={() => setEditing(c)}
                className="block w-full rounded-xl border border-line bg-surface p-4 text-left hover:border-brass hover:bg-brass-soft"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-ink">{c.name}</span>
                  <span className="font-mono text-xs text-muted">{c.id}</span>
                </div>
                {c.description && <p className="mt-1 text-sm text-muted">{c.description}</p>}
                <p className="mt-2 text-xs text-muted">
                  {COLLECTION_SOURCE_LABEL[c.sourceKind]} · {c.items.length} items · {c.columns.length} column{c.columns.length === 1 ? '' : 's'}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
