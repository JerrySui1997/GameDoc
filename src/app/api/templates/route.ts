import { NextResponse } from 'next/server';
import { readTemplates, writeTemplates } from '@/lib/templates/store';
import { PageTemplateSchema } from '@/lib/templates/types';

export async function GET() {
  const templates = await readTemplates();
  return NextResponse.json(templates);
}

export async function POST(request: Request) {
  const parsed = PageTemplateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const templates = await readTemplates();
  if (templates.some((t) => t.id === parsed.data.id)) {
    return NextResponse.json({ error: `Template id "${parsed.data.id}" already exists` }, { status: 409 });
  }

  const next = [...templates, parsed.data];
  await writeTemplates(next);
  return NextResponse.json(parsed.data, { status: 201 });
}
