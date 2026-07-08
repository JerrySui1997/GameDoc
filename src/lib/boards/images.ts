import { promises as fs } from 'fs';
import path from 'path';
import { DATA_DIR } from '@/lib/store/paths';

// ── Board image files ────────────────────────────────────────────────────────
// Board images are real on-disk files under DATA_DIR (the Railway persistent
// volume in production), not inlined base64 like Character Studio's single art
// slot — a board can hold many full-size reference images, so inlining them
// into content.json would bloat every read/write of the boards collection.
// (The resize cap for uploads, BOARD_IMAGE_MAX_DIM, lives in BoardEditor.tsx
// next to the client-side canvas conversion that enforces it — this module
// only ever writes the bytes it's given, already sized.)

function boardImagesDir(boardId: string): string {
  return path.join(DATA_DIR, 'boards', 'images', boardId);
}

export function boardImagePath(boardId: string, filename: string): string {
  return path.join(boardImagesDir(boardId), filename);
}

export async function writeBoardImage(boardId: string, filename: string, bytes: Buffer): Promise<void> {
  await fs.mkdir(boardImagesDir(boardId), { recursive: true });
  await fs.writeFile(boardImagePath(boardId, filename), bytes);
}

export async function deleteBoardImage(boardId: string, filename: string): Promise<void> {
  await fs.rm(boardImagePath(boardId, filename), { force: true });
}

export async function deleteBoardImagesDir(boardId: string): Promise<void> {
  await fs.rm(boardImagesDir(boardId), { recursive: true, force: true });
}
