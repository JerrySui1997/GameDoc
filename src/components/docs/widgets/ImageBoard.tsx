'use client';

import { useBoards } from '@/components/boards/BoardsProvider';
import type { WidgetProps } from './types';

// ── Image Board embed ───────────────────────────────────────────────────────
// A bound-pointer widget, same shape as Character Card: it stores only
// `{ boardId }`, never a copy of the board's images, and resolves the live
// board from BoardsProvider at render time. Editing the board from /boards
// (or from any other page embedding it) updates every embed instantly.

export function ImageBoard({ props, onChange }: WidgetProps) {
  const { boards } = useBoards();
  const boardId = String(props.boardId ?? '');
  const board = boards.find((b) => b.id === boardId) ?? null;

  return (
    <div className="ib-root">
      <header className="ib-chrome">
        <span className="ib-chrome-tag">Image board</span>
        <select className="ib-source" value={boardId} onChange={(e) => onChange({ boardId: e.target.value })}>
          <option value="">— pick a board —</option>
          {boards.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
        <a className="ib-open" href="/boards">edit board ↗</a>
      </header>

      {!board ? (
        <div className="ib-placeholder">
          Bind this widget to a reference image board. Create one at <b>/boards</b>.
        </div>
      ) : board.images.length === 0 ? (
        <div className="ib-placeholder">
          <b>{board.name}</b> has no images yet. Add some at <b>/boards</b>.
        </div>
      ) : (
        <div className="ib-gallery">
          {board.images.map((img) => (
            <figure key={img.id} className="ib-tile">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/boards/${board.id}/images/${img.id}`} alt={img.caption || 'reference image'} loading="lazy" />
              {img.caption && <figcaption className="ib-caption">{img.caption}</figcaption>}
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}
