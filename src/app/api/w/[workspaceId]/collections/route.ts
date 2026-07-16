import { NextResponse } from 'next/server';
import { readCollections, writeCollections } from '@/lib/collections/store';
import { CollectionSchema } from '@/lib/collections/types';
import { requireWorkspaceRole } from '@/lib/auth/workspace';

type RouteContext = { params: Promise<{ workspaceId: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const { workspaceId } = await params;
  if (!(await requireWorkspaceRole(workspaceId, 'viewer'))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const collections = await readCollections({ workspaceId });
  return NextResponse.json(collections);
}

export async function POST(request: Request, { params }: RouteContext) {
  const { workspaceId } = await params;
  if (!(await requireWorkspaceRole(workspaceId, 'editor'))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const parsed = CollectionSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const collections = await readCollections({ workspaceId });
  if (collections.some((c) => c.id === parsed.data.id)) {
    return NextResponse.json({ error: `Collection id "${parsed.data.id}" already exists` }, { status: 409 });
  }

  const next = [...collections, parsed.data];
  await writeCollections(next, { workspaceId });
  return NextResponse.json(parsed.data, { status: 201 });
}
