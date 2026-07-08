import { NextResponse } from 'next/server';
import { readDocs, writeDocs } from '@/lib/docs/store';
import { DocNodeSchema } from '@/lib/schema/doc';
import { requireUserId } from '@/lib/auth/personal';

type RouteContext = { params: Promise<{ id: string }> };

// See src/app/api/docs/[id]/route.ts for why PATCH is separate from PUT: a
// structural, body-preserving partial update, used for sidebar metadata like
// `hue` that must stay editable without clobbering a live-edited body.
const DocPatchSchema = DocNodeSchema.partial().omit({ id: true });

export async function PUT(request: Request, { params }: RouteContext) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id } = await params;
  const parsed = DocNodeSchema.safeParse({ ...(await request.json()), id });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const docs = await readDocs({ userId });
  const index = docs.findIndex((d) => d.id === id);
  if (index === -1) {
    return NextResponse.json({ error: `Doc "${id}" not found` }, { status: 404 });
  }
  if (parsed.data.parentId === id) {
    return NextResponse.json({ error: 'A doc cannot be its own parent' }, { status: 400 });
  }
  if (parsed.data.parentId && !docs.some((d) => d.id === parsed.data.parentId)) {
    return NextResponse.json({ error: `Parent "${parsed.data.parentId}" not found` }, { status: 400 });
  }

  const next = [...docs];
  next[index] = parsed.data;
  await writeDocs(next, { userId });
  return NextResponse.json(parsed.data);
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id } = await params;
  const parsed = DocPatchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const docs = await readDocs({ userId });
  const index = docs.findIndex((d) => d.id === id);
  if (index === -1) {
    return NextResponse.json({ error: `Doc "${id}" not found` }, { status: 404 });
  }

  const merged = { ...docs[index], ...parsed.data, id };
  if (merged.parentId === id) {
    return NextResponse.json({ error: 'A doc cannot be its own parent' }, { status: 400 });
  }
  if (merged.parentId && !docs.some((d) => d.id === merged.parentId)) {
    return NextResponse.json({ error: `Parent "${merged.parentId}" not found` }, { status: 400 });
  }

  const full = DocNodeSchema.parse(merged);
  const next = [...docs];
  next[index] = full;
  await writeDocs(next, { userId });
  return NextResponse.json(full);
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id } = await params;
  const docs = await readDocs({ userId });
  const target = docs.find((d) => d.id === id);
  if (!target) {
    return NextResponse.json({ error: `Doc "${id}" not found` }, { status: 404 });
  }

  const next = docs
    .filter((d) => d.id !== id)
    .map((d) => (d.parentId === id ? { ...d, parentId: target.parentId } : d));

  await writeDocs(next, { userId });
  return NextResponse.json({ ok: true });
}
