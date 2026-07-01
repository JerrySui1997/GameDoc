'use client';

import { useState } from 'react';
import { useCollections } from './CollectionsProvider';
import { COLLECTION_SOURCE_LABEL, type Collection, type CollectionItem } from '@/lib/collections/types';

const input = 'rounded-lg border border-line px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brass';

/** Edit a saved collection: rename, edit cell values, add/remove rows, delete. */
export function CollectionEditor({
  collection,
  onClose,
}: {
  collection: Collection;
  onClose: () => void;
}) {
  const { updateCollection, deleteCollection } = useCollections();
  const [draft, setDraft] = useState<Collection>(collection);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const set = (patch: Partial<Collection>) => setDraft((d) => ({ ...d, ...patch }));

  function setCell(itemIndex: number, col: string, value: string) {
    set({
      items: draft.items.map((it, i) =>
        i === itemIndex ? { ...it, values: { ...it.values, [col]: value } } : it,
      ),
    });
  }
  function removeItem(itemIndex: number) {
    set({ items: draft.items.filter((_, i) => i !== itemIndex) });
  }
  function addRow() {
    const taken = new Set(draft.items.map((it) => it.id));
    let n = draft.items.length + 1;
    let id = `item-${n}`;
    while (taken.has(id)) id = `item-${++n}`;
    const values: Record<string, string> = {};
    draft.columns.forEach((c) => { values[c] = ''; });
    const item: CollectionItem = { id, values };
    set({ items: [...draft.items, item] });
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await updateCollection(draft.id, draft);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await deleteCollection(draft.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block font-mono text-xs font-semibold uppercase tracking-wide text-muted">Name</label>
          <input value={draft.name} onChange={(e) => set({ name: e.target.value })} className={`${input} w-full`} />
        </div>
        <div>
          <label className="mb-1 block font-mono text-xs font-semibold uppercase tracking-wide text-muted">ID (fixed) · {COLLECTION_SOURCE_LABEL[draft.sourceKind]}</label>
          <input value={draft.id} disabled className={`${input} w-full font-mono text-xs disabled:bg-canvas disabled:text-muted`} />
        </div>
      </div>

      <div>
        <label className="mb-1 block font-mono text-xs font-semibold uppercase tracking-wide text-muted">Description</label>
        <input value={draft.description ?? ''} onChange={(e) => set({ description: e.target.value })} className={`${input} w-full`} />
      </div>

      <div className="overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="bg-canvas">
              {draft.columns.map((col) => (
                <th key={col} className="px-3 py-2 text-xs font-semibold text-muted">{col}</th>
              ))}
              <th className="w-10 px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {draft.items.map((item, i) => (
              <tr key={item.id} className="border-t border-line-soft">
                {draft.columns.map((col) => (
                  <td key={col} className="px-2 py-1.5">
                    <input
                      value={item.values[col] ?? ''}
                      onChange={(e) => setCell(i, col, e.target.value)}
                      className={`${input} w-full`}
                    />
                  </td>
                ))}
                <td className="px-2 py-1.5 text-right">
                  <button type="button" onClick={() => removeItem(i)} className="rounded border border-oxblood/30 px-1.5 text-xs text-oxblood hover:bg-oxblood-soft">×</button>
                </td>
              </tr>
            ))}
            {draft.items.length === 0 && (
              <tr><td colSpan={draft.columns.length + 1} className="px-3 py-3 text-sm text-muted">No items.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <button type="button" onClick={addRow} className="rounded-lg border border-line px-2.5 py-1 text-xs font-semibold text-ink hover:bg-canvas">+ Add row</button>

      {error && <p className="rounded-lg bg-oxblood-soft px-3 py-2 text-sm text-oxblood">{error}</p>}

      <div className="flex flex-wrap gap-2">
        <button onClick={save} disabled={busy} className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-ink-soft disabled:opacity-50">Save changes</button>
        <button onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-ink hover:bg-canvas">Cancel</button>
        {!confirmDelete ? (
          <button onClick={() => setConfirmDelete(true)} className="ml-auto rounded-lg border border-oxblood/30 px-4 py-2 text-sm font-semibold text-oxblood hover:bg-oxblood-soft">Delete collection</button>
        ) : (
          <span className="ml-auto flex items-center gap-2">
            <span className="text-sm text-oxblood">Delete?</span>
            <button onClick={remove} disabled={busy} className="rounded-lg bg-oxblood px-3 py-2 text-sm font-semibold text-white hover:bg-oxblood/90 disabled:opacity-50">Yes, delete</button>
            <button onClick={() => setConfirmDelete(false)} className="rounded-lg border border-line px-3 py-2 text-sm font-semibold text-ink hover:bg-canvas">No</button>
          </span>
        )}
      </div>
    </div>
  );
}
