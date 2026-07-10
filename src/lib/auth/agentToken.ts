import { NextResponse } from 'next/server';

// Shared-secret gate for the doc-mutation REST routes the MCP's "live" mode
// writes through (see mcp/src/data.ts). No-ops when GAMEDOC_AGENT_TOKEN isn't
// set, so local dev — and every GET route, which never calls this — is
// unaffected. The same secret also lets cross-origin clients through the
// /collab websocket gate (server/collab-core.ts), which cookie-bearing
// same-origin browsers pass without it.
export function checkAgentToken(request: Request): NextResponse | null {
  const expected = process.env.GAMEDOC_AGENT_TOKEN;
  if (!expected) return null;
  const [scheme, token] = (request.headers.get('authorization') ?? '').split(' ');
  if (scheme !== 'Bearer' || token !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}
