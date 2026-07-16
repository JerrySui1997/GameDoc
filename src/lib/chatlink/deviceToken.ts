import { randomBytes } from 'crypto';
import { eq, and } from 'drizzle-orm';
import { db } from '@/db/client';
import { chatlinkDeviceTokens } from '@/db/schema';

// Pairing tokens the local chat-bridge authenticates with. Unlike
// GAMEDOC_AGENT_TOKEN (one shared secret for the whole site's MCP writes),
// each of these belongs to exactly one user, so /api/chatlink/events can
// resolve "which user's bridge posted this" without a browser session cookie.
// `id` is a non-secret handle for listing/revoking; the raw `token` is
// returned only once, at creation.

export async function createDeviceToken(userId: string, label: string): Promise<{ id: string; token: string }> {
  const token = randomBytes(24).toString('base64url');
  const [row] = await db.insert(chatlinkDeviceTokens).values({ token, userId, label }).returning({ id: chatlinkDeviceTokens.id });
  return { id: row.id, token };
}

/** Returns the owning userId, or null if the token is unknown/revoked. */
export async function resolveDeviceToken(token: string): Promise<string | null> {
  const row = await db.query.chatlinkDeviceTokens.findFirst({
    where: eq(chatlinkDeviceTokens.token, token),
  });
  return row?.userId ?? null;
}

export async function listDeviceTokens(
  userId: string
): Promise<{ id: string; label: string; createdAt: Date }[]> {
  const rows = await db.query.chatlinkDeviceTokens.findMany({
    where: eq(chatlinkDeviceTokens.userId, userId),
  });
  return rows.map((r) => ({ id: r.id, label: r.label, createdAt: r.createdAt }));
}

export async function revokeDeviceToken(userId: string, id: string): Promise<void> {
  await db
    .delete(chatlinkDeviceTokens)
    .where(and(eq(chatlinkDeviceTokens.id, id), eq(chatlinkDeviceTokens.userId, userId)));
}
