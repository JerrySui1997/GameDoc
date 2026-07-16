import { NextResponse } from 'next/server';
import { chatBus } from '@/lib/chatlink/bus';
import { ChatLinkEventSchema } from '@/lib/chatlink/types';
import { resolveDeviceToken } from '@/lib/chatlink/deviceToken';

// Ingest endpoint the local chat-bridge (scripts/chat-bridge.mjs) POSTs to as
// it watches VS Code Copilot / Claude Code chat storage on disk. Authenticated
// by a per-user device token (not the site-wide GAMEDOC_AGENT_TOKEN) so the
// resulting events land in the right user's chatBus store — see
// src/lib/chatlink/deviceToken.ts for why this differs from /api/agent/events.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  const [scheme, token] = (request.headers.get('authorization') ?? '').split(' ');
  if (scheme !== 'Bearer' || !token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = await resolveDeviceToken(token);
  if (!userId) {
    return NextResponse.json({ error: 'Unknown or revoked device token' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = ChatLinkEventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  chatBus().publish(userId, parsed.data);
  return NextResponse.json({ ok: true });
}
