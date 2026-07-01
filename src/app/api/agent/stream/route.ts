import { agentBus, type ServerMessage } from '@/lib/agent/bus';

// SSE endpoint each browser tab subscribes to. Streams agent edit + presence
// events pushed by the MCP (via /api/agent/events) so open pages update live.
// Must never be cached or statically rendered — it's a long-lived stream.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (message: ServerMessage) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(message)}\n\n`));
      };

      const unsubscribe = agentBus().subscribe(send);

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
