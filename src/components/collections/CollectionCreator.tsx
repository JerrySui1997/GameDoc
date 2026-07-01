'use client';

import { useState } from 'react';
import { useCollections } from './CollectionsProvider';
import { slugify } from '@/components/docs/inline';
import { COLLECTION_SOURCE_LABEL, type Collection } from '@/lib/collections/types';
import type { ExtractedCollection } from '@/lib/collections/extract';

/**
 * Names and saves a collection extracted from doc content. Shows a preview of
 * the parsed columns/items so the author can confirm before persisting.
 */
export function CollectionCreator({
  draft,
  sourceDocId,
  onSaved,
  onCancel,
}: {
  draft: ExtractedCollection;
  sourceDocId: string | null;
  onSaved: (collection: Collection) => void;
  onCancel: () => void;
}) {
  const { createCollection } = useCollections();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const id = slugify(name);

  async function save() {
    if (!id) { setError('Enter a name with at least one letter or number'); return; }
    if (draft.items.length === 0) { setError('Nothing to capture — select a list, table, or comma-separated sentence first'); return; }
    setBusy(true);
    setError(null);
    try {
      const created = await createCollection({
        id,
        name: name.trim(),
        description: '',
        columns: draft.columns,
        items: draft.items,
        sourceDocId,
        sourceBlockId: null,
        sourceKind: draft.sourceKind,
      });
      onSaved(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save collection');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-line bg-surface p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-xs font-semibold uppercase tracking-wide text-muted">
          New collection · <span className="text-muted">{COLLECTION_SOURCE_LABEL[draft.sourceKind]}</span>
        </p>
        <span className="font-mono text-[11px] text-muted">{draft.items.length} items</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } if (e.key === 'Escape') onCancel(); }}
          placeholder="Collection name (e.g. Weapons)"
          className="flex-1 min-w-[12rem] rounded-lg border border-line px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brass"
        />
        {id && <span className="font-mono text-xs text-muted">{id}</span>}
      </div>

      {/* Preview */}
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="bg-canvas">
              {draft.columns.map((col) => (
                <th key={col} className="px-2.5 py-1.5 font-semibold text-muted">{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {draft.items.slice(0, 8).map((item) => (
              <tr key={item.id} className="border-t border-line-soft">
                {draft.columns.map((col) => (
                  <td key={col} className="px-2.5 py-1.5 text-ink">{item.values[col] ?? ''}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {draft.items.length > 8 && <p className="text-xs text-muted">…and {draft.items.length - 8} more</p>}

      {error && <p className="rounded-lg bg-oxblood-soft px-3 py-2 text-sm text-oxblood">{error}</p>}

      <div className="flex gap-2">
        <button onClick={save} disabled={busy} className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-ink-soft disabled:opacity-50">
          Save collection
        </button>
        <button onClick={onCancel} className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-ink hover:bg-canvas">
          Cancel
        </button>
      </div>
    </div>
  );
}
