// ── Shared auth (Edge-safe) ─────────────────────────────────────────────────
// One shared-password gate for the whole site. These helpers run in three
// runtimes, so they must stay dependency-free and use only Web Crypto +
// process.env (no `node:` imports):
//   • src/middleware.ts       — Edge runtime (the HTTP gate)
//   • src/app/api/*/route.ts  — Node runtime (login / logout)
//   • server/collab-core.ts   — plain Node (the /collab WebSocket gate)
//
// Auth is enforced ONLY when SITE_PASSWORD is set, so local dev stays open by
// default and production is gated purely by the Railway env var.

/** Cookie that carries the session token once a visitor has authenticated. */
export const AUTH_COOKIE = 'gd_session';

/** True when a shared password is configured — i.e. the gate is on. */
export function authEnabled(): boolean {
  return !!process.env.SITE_PASSWORD;
}

/**
 * The opaque session token handed to a browser after a correct password.
 * Derived from a server-only secret (AUTH_SECRET, falling back to the password
 * itself), so holding the cookie proves the visitor authenticated, and rotating
 * the password or AUTH_SECRET invalidates every outstanding session. Web Crypto
 * so the one implementation works in Edge and Node alike.
 */
export async function sessionToken(): Promise<string> {
  const secret = process.env.AUTH_SECRET || process.env.SITE_PASSWORD || '';
  const bytes = new TextEncoder().encode(`gamedoc-session-v1:${secret}`);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Constant-time compare of a candidate cookie against the expected token. The
 * loop's running time depends only on the expected length, never on where a
 * mismatch falls, so it can't be used as a timing oracle. Both operands here are
 * fixed-length SHA-256 hex, so the length check leaks nothing meaningful.
 */
export function safeEqual(candidate: string | undefined | null, expected: string): boolean {
  if (!candidate || candidate.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= candidate.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

/** Parse a raw Cookie header into a name→value map (for the raw-Node WS gate). */
export function parseCookies(header: string | undefined | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    if (!key) continue;
    out[key] = decodeURIComponent(part.slice(eq + 1).trim());
  }
  return out;
}
