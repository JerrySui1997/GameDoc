import { NextResponse } from 'next/server';
import { readDocs, writeDocs } from '@/lib/docs/store';
import { DocNodeSchema } from '@/lib/schema/doc';
import { agentBus } from '@/lib/agent/bus';
import { checkAgentToken } from '@/lib/auth/agentToken';

export async function GET() {
  const docs = await readDocs();
  return NextResponse.json(docs);
}

export async function POST(request: Request) {
  const authError = checkAgentToken(request);
  if (authError) return authError;

  const parsed = DocNodeSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const docs = await readDocs();
  if (docs.some((d) => d.id === parsed.data.id)) {
    return NextResponse.json({ error: `Doc id "${parsed.data.id}" already exists` }, { status: 409 });
  }
  if (parsed.data.parentId && !docs.some((d) => d.id === parsed.data.parentId)) {
    return NextResponse.json({ error: `Parent "${parsed.data.parentId}" not found` }, { status: 400 });
  }

  const next = [...docs, parsed.data];
  await writeDocs(next);
  agentBus().notifyTreeChanged();
  return NextResponse.json(parsed.data, { status: 201 });
}
