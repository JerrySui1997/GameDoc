import { NextResponse } from 'next/server';
import { chatBus } from '@/lib/chatlink/bus';
import { requireUserId } from '@/lib/auth/personal';
import type { ChatLinkEvent } from '@/lib/chatlink/types';

// SSE endpoint each /app/sessions tab subscribes to for live chat-link deltas
// (new sessions, appended turns), scoped to the signed-in user. Must never be
// cached or statically rendered — it's a long-lived stream. Modeled on
// /api/agent/stream, minus that route's site-wide (unscoped) presence model.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (message: ChatLinkEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(message)}\n\n`));
      };

      const unsubscribe = chatBus().subscribe(userId, send);

      // Heartbeat keeps proxies/browsers from idling the connection shut.
      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(': ping\n\n'));
      }, 25_000);

      const close = () => {
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // Already closed — fine.
        }
      };

      request.signal.addEventListener('abort', close);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
