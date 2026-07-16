import { NextResponse } from 'next/server';
import { safeEqual } from './session';

// Shared-secret gate for the doc-mutation REST routes the MCP's "live" mode
// writes through (see mcp/src/data.ts, which sends the header only when it
// has a token configured). Only requests that present a Bearer token are
// checked here — the site's own browser frontend (DocsProvider's patchDoc /
// createDoc / deleteDoc) never sends one, and by the time a request reaches
// a route handler it has already cleared src/middleware.ts's session gate
// via this same bearer token (see hasValidAgentBearer there), so there is
// nothing left to re-authenticate for a plain same-origin request. A
// malformed or wrong Bearer value is still rejected outright rather than
// silently falling through. No-op entirely when GAMEDOC_AGENT_TOKEN isn't set.
export function checkAgentToken(request: Request): NextResponse | null {
  const expected = process.env.GAMEDOC_AGENT_TOKEN;
  if (!expected) return null;
  const [scheme, token] = (request.headers.get('authorization') ?? '').split(' ');
  if (!scheme) return null;
  if (scheme === 'Bearer' && safeEqual(token, expected)) return null;
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
