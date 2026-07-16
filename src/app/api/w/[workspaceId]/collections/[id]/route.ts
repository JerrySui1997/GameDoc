import { NextResponse } from 'next/server';
import { readCollections, writeCollections } from '@/lib/collections/store';
import { CollectionSchema } from '@/lib/collections/types';
import { requireWorkspaceRole } from '@/lib/auth/workspace';

type RouteContext = { params: Promise<{ workspaceId: string; id: string }> };

export async function PUT(request: Request, { params }: RouteContext) {
  const { workspaceId, id } = await params;
  if (!(await requireWorkspaceRole(workspaceId, 'editor'))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const parsed = CollectionSchema.safeParse({ ...(await request.json()), id });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const collections = await readCollections({ workspaceId });
  const index = collections.findIndex((c) => c.id === id);
  if (index === -1) {
    return NextResponse.json({ error: `Collection "${id}" not found` }, { status: 404 });
  }

  const next = [...collections];
  next[index] = parsed.data;
  await writeCollections(next, { workspaceId });
  return NextResponse.json(parsed.data);
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const { workspaceId, id } = await params;
  if (!(await requireWorkspaceRole(workspaceId, 'editor'))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const collections = await readCollections({ workspaceId });
  if (!collections.some((c) => c.id === id)) {
    return NextResponse.json({ error: `Collection "${id}" not found` }, { status: 404 });
  }

  await writeCollections(collections.filter((c) => c.id !== id), { workspaceId });
  return NextResponse.json({ ok: true });
}
