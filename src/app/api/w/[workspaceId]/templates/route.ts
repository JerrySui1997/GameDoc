import { NextResponse } from 'next/server';
import { readTemplates, writeTemplates } from '@/lib/templates/store';
import { PageTemplateSchema } from '@/lib/templates/types';
import { requireWorkspaceRole } from '@/lib/auth/workspace';

type RouteContext = { params: Promise<{ workspaceId: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const { workspaceId } = await params;
  if (!(await requireWorkspaceRole(workspaceId, 'viewer'))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const templates = await readTemplates({ workspaceId });
  return NextResponse.json(templates);
}

export async function POST(request: Request, { params }: RouteContext) {
  const { workspaceId } = await params;
  if (!(await requireWorkspaceRole(workspaceId, 'editor'))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const parsed = PageTemplateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const templates = await readTemplates({ workspaceId });
  if (templates.some((t) => t.id === parsed.data.id)) {
    return NextResponse.json({ error: `Template id "${parsed.data.id}" already exists` }, { status: 409 });
  }

  const next = [...templates, parsed.data];
  await writeTemplates(next, { workspaceId });
  return NextResponse.json(parsed.data, { status: 201 });
}
