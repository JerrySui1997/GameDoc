import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { AUTH_COOKIE, authEnabled, sessionToken } from '@/lib/auth/session';

// Node runtime: uses node:crypto for a constant-time password compare and sets
// the HttpOnly session cookie that the middleware + collab server trust.
export const runtime = 'nodejs';

const THIRTY_DAYS = 60 * 60 * 24 * 30;

function passwordMatches(input: string): boolean {
  const expected = process.env.SITE_PASSWORD ?? '';
  const a = Buffer.from(input, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  // timingSafeEqual demands equal-length buffers; for a human-chosen password
  // the length itself isn't a useful oracle.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  // With the gate off there's nothing to log into.
  if (!authEnabled()) return NextResponse.json({ ok: true, disabled: true });

  let password = '';
  try {
    const body = await request.json();
    if (typeof body?.password === 'string') password = body.password;
  } catch {
    // fall through with an empty password → 401
  }

  if (!passwordMatches(password)) {
    // Fixed delay blunts online guessing without needing any store/rate-limiter.
    await new Promise((r) => setTimeout(r, 400));
    return NextResponse.json({ error: 'Incorrect password' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: AUTH_COOKIE,
    value: await sessionToken(),
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: THIRTY_DAYS,
  });
  return res;
}
