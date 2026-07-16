import crypto from 'crypto';
import { cookies } from 'next/headers';

// Pre-account view access (Phase 4.4): a visitor who redeems an invite link
// without signing in gets a signed cookie recording {workspaceId, email}
// instead of a NextAuth session. Signed with GAMEDOC_ACCOUNTS_SECRET (the same
// server secret NextAuth itself uses, src/auth.config.ts) so a visitor can't
// forge or edit the email to squat on someone else's pending grant — only the
// invite *token* (the real secret, checked separately) can produce a valid
// signed cookie for a given email.
function cookieName(workspaceId: string): string {
  return `gamedoc_view_${workspaceId}`;
}

function sign(workspaceId: string, email: string): string {
  const secret = process.env.GAMEDOC_ACCOUNTS_SECRET;
  if (!secret) throw new Error('GAMEDOC_ACCOUNTS_SECRET is not set');
  return crypto.createHmac('sha256', secret).update(`${workspaceId}:${email}`).digest('base64url');
}

export async function setViewCookie(workspaceId: string, email: string): Promise<void> {
  const normalized = email.trim().toLowerCase();
  const signature = sign(workspaceId, normalized);
  const jar = await cookies();
  jar.set(cookieName(workspaceId), `${normalized}.${signature}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  });
}

/** Returns the verified email for this workspace's view cookie, or null if absent/invalid. */
export async function getViewCookieEmail(workspaceId: string): Promise<string | null> {
  const jar = await cookies();
  const raw = jar.get(cookieName(workspaceId))?.value;
  if (!raw) return null;
  const dotIndex = raw.lastIndexOf('.');
  if (dotIndex === -1) return null;
  const email = raw.slice(0, dotIndex);
  const signature = raw.slice(dotIndex + 1);
  const expected = sign(workspaceId, email);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return email;
}
