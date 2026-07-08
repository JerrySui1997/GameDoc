import { NextResponse } from 'next/server';
import { deleteBoardImagesDir } from '@/lib/boards/images';
import { readBoards, writeBoards } from '@/lib/boards/store';
import { BoardSchema } from '@/lib/boards/types';

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: RouteContext) {
  const { id } = await params;
  const parsed = BoardSchema.safeParse({ ...(await request.json()), id });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const boards = await readBoards();
  const index = boards.findIndex((b) => b.id === id);
  if (index === -1) {
    return NextResponse.json({ error: `Board "${id}" not found` }, { status: 404 });
  }

  const next = [...boards];
  next[index] = parsed.data;
  await writeBoards(next);
  return NextResponse.json(parsed.data);
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  const boards = await readBoards();
  if (!boards.some((b) => b.id === id)) {
    return NextResponse.json({ error: `Board "${id}" not found` }, { status: 404 });
  }

  await writeBoards(boards.filter((b) => b.id !== id));
  await deleteBoardImagesDir(id);
  return NextResponse.json({ ok: true });
}
