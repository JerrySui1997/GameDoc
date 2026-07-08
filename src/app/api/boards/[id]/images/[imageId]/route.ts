import { promises as fs } from 'fs';
import { NextResponse } from 'next/server';
import { boardImagePath, deleteBoardImage } from '@/lib/boards/images';
import { readBoards, writeBoards } from '@/lib/boards/store';

type RouteContext = { params: Promise<{ id: string; imageId: string }> };

// Both handlers resolve the image's filename from validated board metadata
// first, never from the URL segments directly — so only filenames that were
// actually recorded by an upload are ever read from or deleted off disk.

export async function GET(_request: Request, { params }: RouteContext) {
  const { id, imageId } = await params;
  const boards = await readBoards();
  const board = boards.find((b) => b.id === id);
  const image = board?.images.find((img) => img.id === imageId);
  if (!board || !image) {
    return NextResponse.json({ error: 'Image not found' }, { status: 404 });
  }

  const bytes = await fs.readFile(boardImagePath(board.id, image.filename)).catch(() => null);
  if (!bytes) {
    return NextResponse.json({ error: 'Image file missing on disk' }, { status: 404 });
  }

  return new NextResponse(bytes, {
    headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'private, max-age=31536000, immutable' },
  });
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const { id, imageId } = await params;
  const boards = await readBoards();
  const index = boards.findIndex((b) => b.id === id);
  const board = boards[index];
  const image = board?.images.find((img) => img.id === imageId);
  if (index === -1 || !image) {
    return NextResponse.json({ error: 'Image not found' }, { status: 404 });
  }

  const next = [...boards];
  next[index] = { ...board, images: board.images.filter((img) => img.id !== imageId) };
  await writeBoards(next);
  await deleteBoardImage(id, image.filename);

  return NextResponse.json({ ok: true });
}
