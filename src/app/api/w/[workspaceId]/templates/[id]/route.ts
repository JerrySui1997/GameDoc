import { NextResponse } from 'next/server';
import { readTemplates, writeTemplates } from '@/lib/templates/store';
import { PageTemplateSchema } from '@/lib/templates/types';
import { requireWorkspaceRole } from '@/lib/auth/workspace';

type RouteContext = { params: Promise<{ workspaceId: string; id: string }> };

export async function PUT(request: Request, { params }: RouteContext) {
  const { workspaceId, id } = await params;
  if (!(await requireWorkspaceRole(workspaceId, 'editor'))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const parsed = PageTemplateSchema.safeParse({ ...(await request.json()), id });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const templates = await readTemplates({ workspaceId });
  const index = templates.findIndex((t) => t.id === id);
  if (index === -1) {
    return NextResponse.json({ error: `Template "${id}" not found` }, { status: 404 });
  }

  const next = [...templates];
  next[index] = parsed.data;
  await writeTemplates(next, { workspaceId });
  return NextResponse.json(parsed.data);
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const { workspaceId, id } = await params;
  if (!(await requireWorkspaceRole(workspaceId, 'editor'))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const templates = await readTemplates({ workspaceId });
  if (!templates.some((t) => t.id === id)) {
    return NextResponse.json({ error: `Template "${id}" not found` }, { status: 404 });
  }

  await writeTemplates(templates.filter((t) => t.id !== id), { workspaceId });
  return NextResponse.json({ ok: true });
}
