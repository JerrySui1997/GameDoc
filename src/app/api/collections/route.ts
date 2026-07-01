import { NextResponse } from 'next/server';
import { readCollections, writeCollections } from '@/lib/collections/store';
import { CollectionSchema } from '@/lib/collections/types';

export async function GET() {
  const collections = await readCollections();
  return NextResponse.json(collections);
}

export async function POST(request: Request) {
  const parsed = CollectionSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const collections = await readCollections();
  if (collections.some((c) => c.id === parsed.data.id)) {
    return NextResponse.json({ error: `Collection id "${parsed.data.id}" already exists` }, { status: 409 });
  }

  const next = [...collections, parsed.data];
  await writeCollections(next);
  return NextResponse.json(parsed.data, { status: 201 });
}
