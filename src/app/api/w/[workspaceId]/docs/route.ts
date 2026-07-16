import { NextResponse } from 'next/server';
import { readDocs, writeDocs } from '@/lib/docs/store';
import { DocNodeSchema } from '@/lib/schema/doc';
import { requireWorkspaceRole } from '@/lib/auth/workspace';

type RouteContext = { params: Promise<{ workspaceId: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const { workspaceId } = await params;
  if (!(await requireWorkspaceRole(workspaceId, 'viewer'))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const docs = await readDocs({ workspaceId });
  return NextResponse.json(docs);
}

export async function POST(request: Request, { params }: RouteContext) {
  const { workspaceId } = await params;
  if (!(await requireWorkspaceRole(workspaceId, 'editor'))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const parsed = DocNodeSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const docs = await readDocs({ workspaceId });
  if (docs.some((d) => d.id === parsed.data.id)) {
    return NextResponse.json({ error: `Doc id "${parsed.data.id}" already exists` }, { status: 409 });
  }
  if (parsed.data.parentId && !docs.some((d) => d.id === parsed.data.parentId)) {
    return NextResponse.json({ error: `Parent "${parsed.data.parentId}" not found` }, { status: 400 });
  }

  const next = [...docs, parsed.data];
  await writeDocs(next, { workspaceId });
  return NextResponse.json(parsed.data, { status: 201 });
}
