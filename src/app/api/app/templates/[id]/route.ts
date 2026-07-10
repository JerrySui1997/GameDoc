import { NextResponse } from 'next/server';
import { readTemplates, writeTemplates } from '@/lib/templates/store';
import { PageTemplateSchema } from '@/lib/templates/types';
import { requireUserId } from '@/lib/auth/personal';

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: RouteContext) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id } = await params;
  const parsed = PageTemplateSchema.safeParse({ ...(await request.json()), id });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const templates = await readTemplates({ userId });
  const index = templates.findIndex((t) => t.id === id);
  if (index === -1) {
    return NextResponse.json({ error: `Template "${id}" not found` }, { status: 404 });
  }

  const next = [...templates];
  next[index] = parsed.data;
  await writeTemplates(next, { userId });
  return NextResponse.json(parsed.data);
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id } = await params;
  const templates = await readTemplates({ userId });
  if (!templates.some((t) => t.id === id)) {
    return NextResponse.json({ error: `Template "${id}" not found` }, { status: 404 });
  }

  await writeTemplates(templates.filter((t) => t.id !== id), { userId });
  return NextResponse.json({ ok: true });
}
