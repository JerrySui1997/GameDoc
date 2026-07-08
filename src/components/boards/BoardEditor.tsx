'use client';

import { useEffect, useRef, useState } from 'react';
import { useBoards } from './BoardsProvider';
import type { Board, BoardImage } from '@/lib/boards/types';

const input = 'rounded-lg border border-line px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brass';

const BOARD_IMAGE_ACCEPT = ['image/png', 'image/jpeg', 'image/webp', 'image/avif', 'image/gif'];
const BOARD_IMAGE_MAX_DIM = 1800; // fuller reference viewing than Studio's 720px single art slot

async function toWebpUpload(file: File): Promise<{ dataUrl: string; width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, BOARD_IMAGE_MAX_DIM / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, w, h);
    return { dataUrl: canvas.toDataURL('image/webp', 0.82), width: w, height: h };
  } finally {
    bitmap.close?.();
  }
}

async function parseError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    return typeof data?.error === 'string' ? data.error : JSON.stringify(data?.error ?? data);
  } catch {
    return `Request failed (${res.status})`;
  }
}

/** Edit a saved reference board: rename, caption/delete/upload images, delete the board.
 *  Every mutation (name/description/caption commit, upload, image delete) is funneled
 *  through one serialized queue keyed off `latestRef` — which always holds the most
 *  recently known board state — rather than each handler closing over the render's
 *  `board` prop directly. Without this, two edits firing close together (tabbing
 *  between two captions, or editing a caption while an upload is still in flight) would
 *  each build their PUT body from the same stale snapshot, and whichever request's
 *  write lands last would silently overwrite the other. */
export function BoardEditor({ board, onClose }: { board: Board; onClose: () => void }) {
  const { updateBoard, deleteBoard, addImageToBoard, removeImageFromBoard } = useBoards();
  const [name, setName] = useState(board.name);
  const [description, setDescription] = useState(board.description);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [over, setOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const latestRef = useRef(board);
  useEffect(() => { latestRef.current = board; }, [board]);
  const queueRef = useRef(Promise.resolve());

  /** Run `task` after every earlier-queued mutation for this board has settled, so
   *  edits/uploads/deletes from this editor never interleave. A failed task is
   *  reported but doesn't wedge the queue for whatever's next. */
  function enqueue(task: () => Promise<void>) {
    queueRef.current = queueRef.current.then(task, task).catch((err) => {
      setError(err instanceof Error ? err.message : 'Failed to save');
    });
  }

  function commitName() {
    const nextName = name;
    if (nextName === latestRef.current.name) return;
    enqueue(async () => {
      const base = latestRef.current;
      if (nextName === base.name) return;
      latestRef.current = await updateBoard(base.id, { ...base, name: nextName });
    });
  }

  function commitDescription() {
    const nextDescription = description;
    if (nextDescription === latestRef.current.description) return;
    enqueue(async () => {
      const base = latestRef.current;
      if (nextDescription === base.description) return;
      latestRef.current = await updateBoard(base.id, { ...base, description: nextDescription });
    });
  }

  function commitCaption(imageId: string, caption: string) {
    enqueue(async () => {
      const base = latestRef.current;
      const current = base.images.find((img) => img.id === imageId);
      if (!current || current.caption === caption) return;
      latestRef.current = await updateBoard(base.id, {
        ...base,
        images: base.images.map((img) => (img.id === imageId ? { ...img, caption } : img)),
      });
    });
  }

  function ingest(files: FileList | null) {
    if (!files) return;
    const list = Array.from(files).filter((f) => BOARD_IMAGE_ACCEPT.includes(f.type));
    if (list.length === 0) return;
    setUploading(true);
    setError(null);
    enqueue(async () => {
      try {
        for (const file of list) {
          const { dataUrl, width, height } = await toWebpUpload(file);
          const boardId = latestRef.current.id;
          const res = await fetch(`/api/boards/${boardId}/images`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dataUrl, width, height, caption: '' }),
          });
          if (!res.ok) throw new Error(await parseError(res));
          const image: BoardImage = await res.json();
          addImageToBoard(boardId, image);
          latestRef.current = { ...latestRef.current, images: [...latestRef.current.images, image] };
        }
      } finally {
        setUploading(false);
      }
    });
  }

  function removeImage(imageId: string) {
    enqueue(async () => {
      const boardId = latestRef.current.id;
      const res = await fetch(`/api/boards/${boardId}/images/${imageId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await parseError(res));
      removeImageFromBoard(boardId, imageId);
      latestRef.current = { ...latestRef.current, images: latestRef.current.images.filter((img) => img.id !== imageId) };
    });
  }

  async function removeBoard() {
    setBusy(true);
    try {
      await deleteBoard(board.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete board');
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block font-mono text-xs font-semibold uppercase tracking-wide text-muted">Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} onBlur={commitName} className={`${input} w-full`} />
        </div>
        <div>
          <label className="mb-1 block font-mono text-xs font-semibold uppercase tracking-wide text-muted">ID (fixed)</label>
          <input value={board.id} disabled className={`${input} w-full font-mono text-xs disabled:bg-canvas disabled:text-muted`} />
        </div>
      </div>

      <div>
        <label className="mb-1 block font-mono text-xs font-semibold uppercase tracking-wide text-muted">Description</label>
        <input value={description} onChange={(e) => setDescription(e.target.value)} onBlur={commitDescription} className={`${input} w-full`} />
      </div>

      <div
        className={over ? 'rounded-xl border-2 border-dashed border-brass bg-brass-soft p-4' : 'rounded-xl border-2 border-dashed border-line p-4'}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); ingest(e.dataTransfer.files); }}
      >
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-muted">{uploading ? 'Uploading…' : 'Drop images here, or'}</p>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="shrink-0 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink hover:bg-canvas disabled:opacity-50"
          >
            + Add images
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept={BOARD_IMAGE_ACCEPT.join(',')}
          multiple
          hidden
          onChange={(e) => { ingest(e.target.files); e.target.value = ''; }}
        />
      </div>

      {board.images.length === 0 ? (
        <p className="rounded-xl border border-line bg-surface p-6 text-sm text-muted">No images yet.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {board.images.map((img) => (
            <div key={img.id} className="overflow-hidden rounded-xl border border-line bg-canvas">
              <div className="relative aspect-[4/3] bg-surface">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/boards/${board.id}/images/${img.id}`}
                  alt={img.caption || 'reference image'}
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => removeImage(img.id)}
                  title="Delete image"
                  className="absolute right-1.5 top-1.5 rounded-full bg-ink/70 px-2 py-0.5 text-xs font-semibold text-white hover:bg-oxblood"
                >
                  ×
                </button>
              </div>
              <input
                defaultValue={img.caption}
                onBlur={(e) => commitCaption(img.id, e.target.value)}
                placeholder="Caption…"
                className="w-full border-0 border-t border-line-soft bg-transparent px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-brass"
              />
            </div>
          ))}
        </div>
      )}

      {error && <p className="rounded-lg bg-oxblood-soft px-3 py-2 text-sm text-oxblood">{error}</p>}

      <div className="flex flex-wrap gap-2">
        <button onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-ink hover:bg-canvas">Done</button>
        {!confirmDelete ? (
          <button onClick={() => setConfirmDelete(true)} className="ml-auto rounded-lg border border-oxblood/30 px-4 py-2 text-sm font-semibold text-oxblood hover:bg-oxblood-soft">Delete board</button>
        ) : (
          <span className="ml-auto flex items-center gap-2">
            <span className="text-sm text-oxblood">Delete?</span>
            <button onClick={removeBoard} disabled={busy} className="rounded-lg bg-oxblood px-3 py-2 text-sm font-semibold text-white hover:bg-oxblood/90 disabled:opacity-50">Yes, delete</button>
            <button onClick={() => setConfirmDelete(false)} className="rounded-lg border border-line px-3 py-2 text-sm font-semibold text-ink hover:bg-canvas">No</button>
          </span>
        )}
      </div>
    </div>
  );
}
