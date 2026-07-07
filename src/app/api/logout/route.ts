import { NextResponse } from 'next/server';
import { AUTH_COOKIE } from '@/lib/auth/session';

// Node runtime for parity with the login route. Clears the session cookie and
// bounces back to the login screen. 303 so a POST (the sidebar form) becomes a
// GET of /login rather than re-posting.
export const runtime = 'nodejs';

function logout(request: Request) {
  const res = NextResponse.redirect(new URL('/login', request.url), 303);
  res.cookies.set({
    name: AUTH_COOKIE,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
  return res;
}

export const GET = logout;
export const POST = logout;
