import { NextResponse } from 'next/server';
import { readCollections, writeCollections } from '@/lib/collections/store';
import { CollectionSchema } from '@/lib/collections/types';

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: RouteContext) {
  const { id } = await params;
  const parsed = CollectionSchema.safeParse({ ...(await request.json()), id });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const collections = await readCollections();
  const index = collections.findIndex((c) => c.id === id);
  if (index === -1) {
    return NextResponse.json({ error: `Collection "${id}" not found` }, { status: 404 });
  }

  const next = [...collections];
  next[index] = parsed.data;
  await writeCollections(next);
  return NextResponse.json(parsed.data);
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  const collections = await readCollections();
  if (!collections.some((c) => c.id === id)) {
    return NextResponse.json({ error: `Collection "${id}" not found` }, { status: 404 });
  }

  await writeCollections(collections.filter((c) => c.id !== id));
  return NextResponse.json({ ok: true });
}
