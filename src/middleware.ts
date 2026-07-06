import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
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

export async function middleware(req: NextRequest) {
  // Gate is off entirely unless a shared password is configured.
  if (!authEnabled()) return NextResponse.next();

  const { pathname, search } = req.nextUrl;
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
