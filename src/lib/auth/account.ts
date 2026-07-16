// ── Account settings (plans/05-account-settings.md Phase 4) ────────────────
// Per-userId-scoped profile reads/writes for the /app/account page, mirroring
// the pattern in src/lib/workspaces/access.ts.

import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { users, accounts } from '@/db/schema';

export type AccountProfile = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  emailVerified: boolean;
};

export async function getAccountProfile(userId: string): Promise<AccountProfile | null> {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image,
    emailVerified: user.emailVerified != null,
  };
}

export async function updateDisplayName(userId: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) return;
  await db.update(users).set({ name: trimmed }).where(eq(users.id, userId));
}

export type LinkedProvider = {
  provider: string;
  providerAccountId: string;
};

export async function listLinkedProviders(userId: string): Promise<LinkedProvider[]> {
  const rows = await db.query.accounts.findMany({ where: eq(accounts.userId, userId) });
  return rows.map((r) => ({ provider: r.provider, providerAccountId: r.providerAccountId }));
}
