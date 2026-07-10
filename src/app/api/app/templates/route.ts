import { NextResponse } from 'next/server';
import { readTemplates, writeTemplates } from '@/lib/templates/store';
import { PageTemplateSchema } from '@/lib/templates/types';
import { requireUserId } from '@/lib/auth/personal';

export async function GET() {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const templates = await readTemplates({ userId });
  return NextResponse.json(templates);
}

export async function POST(request: Request) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const parsed = PageTemplateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const templates = await readTemplates({ userId });
  if (templates.some((t) => t.id === parsed.data.id)) {
    return NextResponse.json({ error: `Template id "${parsed.data.id}" already exists` }, { status: 409 });
  }

  const next = [...templates, parsed.data];
  await writeTemplates(next, { userId });
  return NextResponse.json(parsed.data, { status: 201 });
}
