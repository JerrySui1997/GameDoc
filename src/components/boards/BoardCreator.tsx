'use client';

import { useState } from 'react';
import { useBoards } from './BoardsProvider';
import { slugify } from '@/components/docs/inline';
import type { Board } from '@/lib/boards/types';

const input = 'rounded-lg border border-line px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brass';

/** Minimal standalone create form — a board starts empty (no extraction-from-selection story like Collections). */
export function BoardCreator({
  onDone,
  onCancel,
}: {
  onDone: (board: Board) => void;
  onCancel: () => void;
}) {
  const { boards, createBoard } = useBoards();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const id = slugify(name);

  async function submit() {
    const trimmed = name.trim();
    if (!id) {
      setError('Enter a name with at least one letter or number');
      return;
    }
    if (boards.some((b) => b.id === id)) {
      setError(`A board with id "${id}" already exists`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await createBoard({
        id,
        name: trimmed,
        description: description.trim(),
        images: [],
        createdAt: new Date().toISOString(),
      });
      onDone(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create board');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-line bg-surface p-4">
      <div>
        <label className="mb-1 block font-mono text-xs font-semibold uppercase tracking-wide text-muted">Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
          placeholder="Forest Ruins"
          className={`${input} w-full`}
          autoFocus
        />
        {id && <p className="mt-1 font-mono text-xs text-muted">id: {id}</p>}
      </div>
      <div>
        <label className="mb-1 block font-mono text-xs font-semibold uppercase tracking-wide text-muted">Description (optional)</label>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Moodboard for the overgrown ruins area"
          className={`${input} w-full`}
        />
      </div>
      {error && <p className="rounded-lg bg-oxblood-soft px-3 py-2 text-sm text-oxblood">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={submit} disabled={busy} className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-ink-soft disabled:opacity-50">
          Create board
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-ink hover:bg-canvas">
          Cancel
        </button>
      </div>
    </div>
  );
}
