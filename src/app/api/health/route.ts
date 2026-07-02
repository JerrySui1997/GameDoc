// Lightweight liveness probe for Railway's healthcheck (see railway.json).
// force-dynamic so it's never statically cached — every hit executes and returns
// 200 the moment the server is accepting traffic, which is exactly what the
// platform's healthcheck (and zero-downtime deploy gating) needs.
export const dynamic = 'force-dynamic';

export function GET(): Response {
  return Response.json({ status: 'ok' });
}
