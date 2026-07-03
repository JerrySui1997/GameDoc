import { NextResponse } from 'next/server';
import { z } from 'zod';
import { agentBus } from '@/lib/agent/bus';
import { DocNodeSchema } from '@/lib/schema/doc';
import { checkAgentToken } from '@/lib/auth/agentToken';

// Ingest endpoint the MCP server POSTs to around each doc write. We validate the
// shape here (not just trust the caller) and fan it out to subscribed tabs via
// the in-process bus. Local-only by design — same machine as the dev server.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const EventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('edit.start'), docId: z.string(), agent: z.string().default('AI Agent') }),
  z.object({
    type: z.literal('edit.commit'),
    action: z.enum(['created', 'updated', 'deleted']),
    docId: z.string(),
    doc: DocNodeSchema.optional(),
    agent: z.string().default('AI Agent'),
  }),
  z.object({ type: z.literal('edit.stop'), docId: z.string(), agent: z.string().default('AI Agent') }),
]);

export async function POST(request: Request) {
  const authError = checkAgentToken(request);
  if (authError) return authError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = EventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  agentBus().publish(parsed.data);
  return NextResponse.json({ ok: true });
}
