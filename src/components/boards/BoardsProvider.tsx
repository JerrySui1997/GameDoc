'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { Board, BoardImage } from '@/lib/boards/types';

type BoardsContextValue = {
  boards: Board[];
  getById: (id: string) => Board | undefined;
  createBoard: (board: Board) => Promise<Board>;
  updateBoard: (id: string, board: Board) => Promise<Board>;
  deleteBoard: (id: string) => Promise<void>;
  addImageToBoard: (boardId: string, image: BoardImage) => void;
  removeImageFromBoard: (boardId: string, imageId: string) => void;
};

const BoardsContext = createContext<BoardsContextValue | null>(null);

async function parseError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    return typeof data?.error === 'string' ? data.error : JSON.stringify(data?.error ?? data);
  } catch {
    return `Request failed (${res.status})`;
  }
}

export function BoardsProvider({
  initialBoards,
  children,
}: {
  initialBoards: Board[];
  children: React.ReactNode;
}) {
  const [boards, setBoards] = useState<Board[]>(initialBoards);

  const getById = useCallback((id: string) => boards.find((b) => b.id === id), [boards]);

  const createBoard = useCallback<BoardsContextValue['createBoard']>(async (board) => {
    const res = await fetch('/api/boards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(board),
    });
    if (!res.ok) throw new Error(await parseError(res));
    const created: Board = await res.json();
    setBoards((prev) => [...prev, created]);
    return created;
  }, []);

  const updateBoard = useCallback<BoardsContextValue['updateBoard']>(async (id, board) => {
    const res = await fetch(`/api/boards/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(board),
    });
    if (!res.ok) throw new Error(await parseError(res));
    const updated: Board = await res.json();
    setBoards((prev) => prev.map((b) => (b.id === id ? updated : b)));
    return updated;
  }, []);

  const deleteBoard = useCallback<BoardsContextValue['deleteBoard']>(async (id) => {
    const res = await fetch(`/api/boards/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(await parseError(res));
    setBoards((prev) => prev.filter((b) => b.id !== id));
  }, []);

  /** Local-only patch after a successful upload — no fetch, the API call already persisted it. */
  const addImageToBoard = useCallback<BoardsContextValue['addImageToBoard']>((boardId, image) => {
    setBoards((prev) => prev.map((b) => (b.id === boardId ? { ...b, images: [...b.images, image] } : b)));
  }, []);

  /** Local-only patch after a successful delete — no fetch, the API call already persisted it. */
  const removeImageFromBoard = useCallback<BoardsContextValue['removeImageFromBoard']>((boardId, imageId) => {
    setBoards((prev) =>
      prev.map((b) => (b.id === boardId ? { ...b, images: b.images.filter((img) => img.id !== imageId) } : b)),
    );
  }, []);

  const value = useMemo<BoardsContextValue>(
    () => ({ boards, getById, createBoard, updateBoard, deleteBoard, addImageToBoard, removeImageFromBoard }),
    [boards, getById, createBoard, updateBoard, deleteBoard, addImageToBoard, removeImageFromBoard],
  );

  return <BoardsContext.Provider value={value}>{children}</BoardsContext.Provider>;
}

export function useBoards(): BoardsContextValue {
  const ctx = useContext(BoardsContext);
  if (!ctx) throw new Error('useBoards must be used within a BoardsProvider');
  return ctx;
}
