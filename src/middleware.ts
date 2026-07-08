import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import authConfig from './auth.config';
import { AUTH_COOKIE, authEnabled, safeEqual, sessionToken } from '@/lib/auth/session';

// ── Site password gate (HTTP) ───────────────────────────────────────────────
// Covers the two HTTP surfaces — SSR pages and the REST API — in dev and prod
// alike (the production custom server runs Next via getRequestHandler, so
// middleware still executes). The /collab WebSocket is gated separately in
// server/collab-core.ts, since upgrades never reach middleware.

// Reachable without the password: the healthcheck (Railway probes it with no
// cookie) and the login/logout endpoints (needed to get in and out). Static
// assets are excluded by `config.matcher` below.
const PUBLIC_PATHS = ['/login', '/api/login', '/api/logout', '/api/health'];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function isUnderPath(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
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
  // with no gate at all (neither this nor the legacy password check below).
  if (pathname.startsWith('/api/auth/')) return NextResponse.next();

  // Personal spaces: gated by an Auth.js session, independent of the legacy
  // SITE_PASSWORD switch below — signing in here has nothing to do with the
  // owner's shared password, and vice versa.
  if (isUnderPath(pathname, '/app') || isUnderPath(pathname, '/api/app')) {
    if (pathname === '/app/login') return NextResponse.next();
    const session = await personalAuth();
    if (session?.user) return NextResponse.next();
    if (isUnderPath(pathname, '/api/app')) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    const login = req.nextUrl.clone();
    login.pathname = '/app/login';
    login.search = '';
    login.searchParams.set('next', pathname + search);
    return NextResponse.redirect(login);
  }

  // Gate is off entirely unless a shared password is configured.
  if (!authEnabled()) return NextResponse.next();

  if (pathname.startsWith('/api/') && hasValidAgentBearer(req)) return NextResponse.next();

  const authed = safeEqual(req.cookies.get(AUTH_COOKIE)?.value, await sessionToken());

  if (authed) {
    // Signed in already — no reason to sit on the login screen.
    if (pathname === '/login') {
      const home = req.nextUrl.clone();
      home.pathname = '/';
      home.search = '';
      return NextResponse.redirect(home);
    }
    return NextResponse.next();
  }

  if (isPublic(pathname)) return NextResponse.next();

  // Unauthenticated: fail API calls loudly, send page loads to the login screen
  // (remembering where they were headed).
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const login = req.nextUrl.clone();
  login.pathname = '/login';
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
