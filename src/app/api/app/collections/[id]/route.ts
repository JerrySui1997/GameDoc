import { NextResponse } from 'next/server';
import { readCollections, writeCollections } from '@/lib/collections/store';
import { CollectionSchema } from '@/lib/collections/types';
import { requireUserId } from '@/lib/auth/personal';

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: RouteContext) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id } = await params;
  const parsed = CollectionSchema.safeParse({ ...(await request.json()), id });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const collections = await readCollections({ userId });
  const index = collections.findIndex((c) => c.id === id);
  if (index === -1) {
    return NextResponse.json({ error: `Collection "${id}" not found` }, { status: 404 });
  }

  const next = [...collections];
  next[index] = parsed.data;
  await writeCollections(next, { userId });
  return NextResponse.json(parsed.data);
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id } = await params;
  const collections = await readCollections({ userId });
  if (!collections.some((c) => c.id === id)) {
    return NextResponse.json({ error: `Collection "${id}" not found` }, { status: 404 });
  }

  await writeCollections(collections.filter((c) => c.id !== id), { userId });
  return NextResponse.json({ ok: true });
}
