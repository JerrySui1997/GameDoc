import { NextResponse } from 'next/server';
import { readBoards, writeBoards } from '@/lib/boards/store';
import { BoardSchema } from '@/lib/boards/types';

export async function GET() {
  const boards = await readBoards();
  return NextResponse.json(boards);
}

export async function POST(request: Request) {
  const parsed = BoardSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const boards = await readBoards();
  if (boards.some((b) => b.id === parsed.data.id)) {
    return NextResponse.json({ error: `Board id "${parsed.data.id}" already exists` }, { status: 409 });
  }

  const next = [...boards, parsed.data];
  await writeBoards(next);
  return NextResponse.json(parsed.data, { status: 201 });
}
