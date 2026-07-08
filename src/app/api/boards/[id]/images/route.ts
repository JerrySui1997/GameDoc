import { NextResponse } from 'next/server';
import { writeBoardImage } from '@/lib/boards/images';
import { readBoards, writeBoards } from '@/lib/boards/store';
import { BoardImageSchema, makeImageId } from '@/lib/boards/types';

type RouteContext = { params: Promise<{ id: string }> };

const DATA_URL = /^data:image\/webp;base64,([a-zA-Z0-9+/]+=*)$/;

export async function POST(request: Request, { params }: RouteContext) {
  const { id } = await params;
  const boards = await readBoards();
  const index = boards.findIndex((b) => b.id === id);
  if (index === -1) {
    return NextResponse.json({ error: `Board "${id}" not found` }, { status: 404 });
  }

  const body = (await request.json()) as { dataUrl?: unknown; caption?: unknown; width?: unknown; height?: unknown };
  const match = typeof body.dataUrl === 'string' ? DATA_URL.exec(body.dataUrl) : null;
  if (!match) {
    return NextResponse.json({ error: 'dataUrl must be a base64 image/webp data URL' }, { status: 400 });
  }

  const imageId = makeImageId();
  const filename = `${imageId}.webp`;
  const bytes = Buffer.from(match[1], 'base64');
  await writeBoardImage(id, filename, bytes);

  const image = BoardImageSchema.parse({
    id: imageId,
    filename,
    caption: body.caption,
    width: body.width,
    height: body.height,
    createdAt: new Date().toISOString(),
  });

  const board = boards[index];
  const next = [...boards];
  next[index] = { ...board, images: [...board.images, image] };
  await writeBoards(next);

  return NextResponse.json(image, { status: 201 });
}
