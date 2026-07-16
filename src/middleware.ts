import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import authConfig from './auth.config';
import { safeEqual } from '@/lib/auth/session';

// ── Session gate (HTTP) ──────────────────────────────────────────────────────
// Covers the two HTTP surfaces — SSR pages and the REST API — in dev and prod
// alike (the production custom server runs Next via getRequestHandler, so
// middleware still executes). The /collab WebSocket is gated separately in
// server/collab-core.ts, since upgrades never reach middleware.
//
// A single NextAuth session check covers every path (both the flagship site
// and /app/*). Per-workspace membership/role enforcement is a Plan 06 Phase 2+
// concern — this phase only needs "is anyone signed in."

// Reachable without a session: the shared login page and the healthcheck
// (Railway probes it with no cookie). Static assets are excluded by
// `config.matcher` below.
const PUBLIC_PATHS = ['/app/login', '/api/health'];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

// Page routes (never /api/) reachable without a session — the per-workspace
// access check still happens, just deeper in, at the page/layout level
// (Phase 4.4): `/invite/[token]` is the entire point of the link-invite flow
// (a visitor with no account yet has to be able to load it), and
// `/w/[workspaceId]/*` additionally accepts a signed pre-account view cookie
// (src/lib/workspaces/inviteCookie.ts) as an alternative to a real session —
// its layout redirects to /app/login if neither is present.
const SOFT_PUBLIC_PREFIXES = ['/invite/', '/w/'];

function isSoftPublicPage(pathname: string): boolean {
  return !pathname.startsWith('/api/') && SOFT_PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

// Edge-safe: built from auth.config.ts alone (providers + callbacks, no
// Drizzle adapter), so this is safe to run in Edge middleware — src/auth.ts's
// full instance pulls in the native-addon-backed adapter and must stay
// Node-only.
const { auth: personalAuth } = NextAuth(authConfig);

// Lets the "gamedoc-live" MCP call the REST API without a browser session —
// it has no login flow, only the shared secret from GAMEDOC_AGENT_TOKEN (see
// agentToken.ts, which gates individual mutation routes the same way). Scoped
// to /api/ so a stolen or logged token still can't reach page routes, and a
// no-op whenever GAMEDOC_AGENT_TOKEN isn't set.
function hasValidAgentBearer(req: NextRequest): boolean {
  const expected = process.env.GAMEDOC_AGENT_TOKEN;
  if (!expected) return false;
  const [scheme, token] = (req.headers.get('authorization') ?? '').split(' ');
  return scheme === 'Bearer' && safeEqual(token, expected);
}

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // OAuth callback + magic-link verification endpoint — must stay reachable
  // with no gate at all.
  if (pathname.startsWith('/api/auth/')) return NextResponse.next();

  if (isPublic(pathname)) return NextResponse.next();

  if (isSoftPublicPage(pathname)) return NextResponse.next();

  if (pathname.startsWith('/api/') && hasValidAgentBearer(req)) return NextResponse.next();

  const session = await personalAuth();
  if (session?.user) return NextResponse.next();

  // Unauthenticated: fail API calls loudly, send page loads to the shared
  // login screen (remembering where they were headed).
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const login = req.nextUrl.clone();
  login.pathname = '/app/login';
  login.search = '';
  login.searchParams.set('next', pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  // Run on everything except Next internals and static asset files — those carry
  // no doc content, so there's nothing to protect and no reason to pay the check
  // on every framework chunk or image.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|avif|woff|woff2|ttf|otf|map)$).*)',
  ],
};
