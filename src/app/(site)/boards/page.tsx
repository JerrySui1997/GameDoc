'use client';

import { useState } from 'react';
import { useBoards } from '@/components/boards/BoardsProvider';
import { BoardCreator } from '@/components/boards/BoardCreator';
import { BoardEditor } from '@/components/boards/BoardEditor';
import type { Board } from '@/lib/boards/types';

export default function BoardsPage() {
  const { boards } = useBoards();
  const [editing, setEditing] = useState<Board | null>(null);
  const [creating, setCreating] = useState(false);

  // Re-read the live record while editing so saves elsewhere stay consistent.
  const editTarget = editing ? boards.find((b) => b.id === editing.id) ?? editing : null;

  if (editTarget) {
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        <h1 className="text-2xl font-bold text-ink">Edit “{editTarget.name}”</h1>
        <BoardEditor board={editTarget} onClose={() => setEditing(null)} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">Reference Boards</h1>
          <p className="mt-1 text-sm text-muted">
            Shared galleries of reference art. Create a board once, then embed it into any page with an{' '}
            <span className="font-mono">Image Board</span> widget — editing the board updates every embed.
          </p>
        </div>
        {!creating && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="shrink-0 rounded-lg bg-ink px-3 py-1.5 text-sm font-semibold text-white hover:bg-ink-soft"
          >
            + New board
          </button>
        )}
      </div>

      {creating && (
        <BoardCreator
          onDone={(board) => { setCreating(false); setEditing(board); }}
          onCancel={() => setCreating(false)}
        />
      )}

      {boards.length === 0 ? (
        <p className="rounded-xl border border-line bg-surface p-6 text-sm text-muted">
          No reference boards yet. Create one to start collecting moodboard / reference images.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {boards.map((b) => (
            <li key={b.id}>
              <button
                onClick={() => setEditing(b)}
                className="block w-full rounded-xl border border-line bg-surface p-4 text-left hover:border-brass hover:bg-brass-soft"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-ink">{b.name}</span>
                  <span className="font-mono text-xs text-muted">{b.id}</span>
                </div>
                {b.description && <p className="mt-1 text-sm text-muted">{b.description}</p>}
                <p className="mt-2 text-xs text-muted">{b.images.length} image{b.images.length === 1 ? '' : 's'}</p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
