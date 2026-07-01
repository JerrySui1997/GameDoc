import { NextResponse } from 'next/server';
import { readDocs, writeDocs } from '@/lib/docs/store';
import { DocNodeSchema } from '@/lib/schema/doc';
import { agentBus } from '@/lib/agent/bus';

type RouteContext = { params: Promise<{ id: string }> };

// A structural, body-preserving partial update. PUT replaces the whole node
// (and so demands the body — which may be a stale snapshot while the page is
// live-edited via Yjs); PATCH merges only the keys it is given onto the stored
// node, never resurrecting an old body. Used for sidebar metadata like `hue`
// that has to be editable without owning the live document text.
const DocPatchSchema = DocNodeSchema.partial().omit({ id: true });

export async function PUT(request: Request, { params }: RouteContext) {
  const { id } = await params;
  const parsed = DocNodeSchema.safeParse({ ...(await request.json()), id });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const docs = await readDocs();
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
  await writeDocs(next);
  agentBus().notifyTreeChanged();
  return NextResponse.json(parsed.data);
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const { id } = await params;
  const parsed = DocPatchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const docs = await readDocs();
  const index = docs.findIndex((d) => d.id === id);
  if (index === -1) {
    return NextResponse.json({ error: `Doc "${id}" not found` }, { status: 404 });
  }

  // Merge the partial onto the stored node — body and any untouched fields are
  // carried over verbatim, so a metadata edit can never clobber live page text.
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
  await writeDocs(next);
  agentBus().notifyTreeChanged();
  return NextResponse.json(full);
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  const docs = await readDocs();
  const target = docs.find((d) => d.id === id);
  if (!target) {
    return NextResponse.json({ error: `Doc "${id}" not found` }, { status: 404 });
  }

  // Reparent any children to the deleted node's parent so none are orphaned.
  const next = docs
    .filter((d) => d.id !== id)
    .map((d) => (d.parentId === id ? { ...d, parentId: target.parentId } : d));

  await writeDocs(next);
  agentBus().notifyTreeChanged();
  return NextResponse.json({ ok: true });
}
