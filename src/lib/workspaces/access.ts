// ── Workspace access control (plans/06-multi-workspace-dashboard.md Phase 2) ─
// A user's relationship to a workspace is exactly one of: owner (ownerId
// match, no members row needed), a resolved member (workspace_member row with
// userId set), or no access. `canViewByEmail` is a separate, weaker check for
// the pre-account link-invite path (Phase 4.4) — it never returns anything
// above 'viewer', regardless of the role stored on the pending row.

import crypto from 'crypto';
import { and, eq, isNull, isNotNull, ne } from 'drizzle-orm';
import { db } from '@/db/client';
import { workspaces, workspaceMembers, workspaceInviteLinks, users } from '@/db/schema';

/** Creates a new custom workspace owned by `ownerId` (Phase 4's "New workspace" flow). */
export async function createWorkspace(ownerId: string, name: string): Promise<Workspace> {
  const [ws] = await db
    .insert(workspaces)
    .values({ name, ownerId, kind: 'custom' })
    .returning();
  return ws;
}

export type Role = 'owner' | 'editor' | 'viewer';
export type Workspace = typeof workspaces.$inferSelect;

const ROLE_RANK: Record<Role, number> = { viewer: 0, editor: 1, owner: 2 };

export async function getWorkspace(workspaceId: string): Promise<Workspace | null> {
  return (await db.query.workspaces.findFirst({ where: eq(workspaces.id, workspaceId) })) ?? null;
}

export async function getRole(userId: string, workspaceId: string): Promise<Role | null> {
  const ws = await db.query.workspaces.findFirst({ where: eq(workspaces.id, workspaceId) });
  if (!ws) return null;
  if (ws.ownerId === userId) return 'owner';
  const member = await db.query.workspaceMembers.findFirst({
    where: and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)),
  });
  return member?.role ?? null;
}

export async function canAccess(
  userId: string,
  workspaceId: string,
  minRole: Role = 'viewer',
): Promise<boolean> {
  const role = await getRole(userId, workspaceId);
  return role !== null && ROLE_RANK[role] >= ROLE_RANK[minRole];
}

/** Workspaces this user owns (flagship, personal, or any custom ones). */
export async function listMyWorkspaces(userId: string): Promise<Workspace[]> {
  return db.query.workspaces.findMany({ where: eq(workspaces.ownerId, userId) });
}

/** Workspaces this user is a resolved member of, excluding ones they own. */
export async function listSharedWithMe(
  userId: string,
): Promise<{ workspace: Workspace; role: 'editor' | 'viewer' }[]> {
  return db
    .select({ workspace: workspaces, role: workspaceMembers.role })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
    .where(and(eq(workspaceMembers.userId, userId), ne(workspaces.ownerId, userId)));
}

export type MemberRow = {
  id: string;
  role: 'editor' | 'viewer';
  userId: string | null;
  email: string | null;
  name: string | null;
  /** True for a pending link/email invite that hasn't resolved to an account yet. */
  pending: boolean;
};

/** Resolved + pending members of a workspace (excludes the owner, who has no row). */
export async function listMembers(workspaceId: string): Promise<MemberRow[]> {
  const rows = await db
    .select({
      id: workspaceMembers.id,
      role: workspaceMembers.role,
      userId: workspaceMembers.userId,
      inviteEmail: workspaceMembers.inviteEmail,
      userEmail: users.email,
      userName: users.name,
    })
    .from(workspaceMembers)
    .leftJoin(users, eq(workspaceMembers.userId, users.id))
    .where(eq(workspaceMembers.workspaceId, workspaceId));

  return rows.map((r) => ({
    id: r.id,
    role: r.role,
    userId: r.userId,
    email: r.userEmail ?? r.inviteEmail,
    name: r.userName,
    pending: r.userId === null,
  }));
}

/**
 * Direct member-add by email (Phase 4.4, owner-only UI). If `email` already
 * belongs to a real account, grants access immediately; otherwise falls
 * through to the same pending-grant shape the link-invite flow writes
 * (`inviteEmail` set, `userId` null), which `src/auth.ts`'s `createUser`
 * event resolves the next time that email actually signs up.
 */
export async function addMemberByEmail(
  workspaceId: string,
  email: string,
  role: 'editor' | 'viewer',
): Promise<void> {
  const normalized = email.trim().toLowerCase();
  const existingUser = await db.query.users.findFirst({ where: eq(users.email, normalized) });

  if (existingUser) {
    await db
      .insert(workspaceMembers)
      .values({ workspaceId, userId: existingUser.id, role })
      .onConflictDoUpdate({
        target: [workspaceMembers.workspaceId, workspaceMembers.userId],
        targetWhere: isNotNull(workspaceMembers.userId),
        set: { role },
      });
    return;
  }

  await db
    .insert(workspaceMembers)
    .values({ workspaceId, inviteEmail: normalized, role })
    .onConflictDoUpdate({
      target: [workspaceMembers.workspaceId, workspaceMembers.inviteEmail],
      targetWhere: isNotNull(workspaceMembers.inviteEmail),
      set: { role },
    });
}

/** Removes a member row (owner-only UI action) — revokes resolved or pending access alike. */
export async function removeMember(workspaceId: string, memberId: string): Promise<void> {
  await db
    .delete(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.id, memberId)));
}

export type InviteLink = typeof workspaceInviteLinks.$inferSelect;

/** Generates a new shareable `/invite/{token}` link (owner-only UI). */
export async function createInviteLink(
  workspaceId: string,
  createdBy: string,
  role: 'editor' | 'viewer',
): Promise<InviteLink> {
  const token = crypto.randomBytes(24).toString('base64url');
  const [link] = await db.insert(workspaceInviteLinks).values({ token, workspaceId, role, createdBy }).returning();
  return link;
}

/** Active (non-revoked) invite links for a workspace, newest first. */
export async function listInviteLinks(workspaceId: string): Promise<InviteLink[]> {
  const links = await db.query.workspaceInviteLinks.findMany({
    where: and(eq(workspaceInviteLinks.workspaceId, workspaceId), eq(workspaceInviteLinks.revoked, false)),
  });
  return links.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function revokeInviteLink(workspaceId: string, token: string): Promise<void> {
  await db
    .update(workspaceInviteLinks)
    .set({ revoked: true })
    .where(and(eq(workspaceInviteLinks.workspaceId, workspaceId), eq(workspaceInviteLinks.token, token)));
}

/** Looks up a token for the `/invite/{token}` landing page — null if unknown or revoked. */
export async function getValidInviteLink(token: string): Promise<InviteLink | null> {
  const link = await db.query.workspaceInviteLinks.findFirst({ where: eq(workspaceInviteLinks.token, token) });
  if (!link || link.revoked) return null;
  return link;
}

/**
 * Redeems an invite link for a visitor who is already signed in (real
 * `userId` in hand) — grants access directly at the link's role rather than
 * going through the pending-email-then-resolve path, since there's nothing
 * left to resolve.
 */
export async function redeemInviteForUser(
  workspaceId: string,
  userId: string,
  role: 'editor' | 'viewer',
): Promise<void> {
  await db
    .insert(workspaceMembers)
    .values({ workspaceId, userId, role })
    .onConflictDoUpdate({
      target: [workspaceMembers.workspaceId, workspaceMembers.userId],
      targetWhere: isNotNull(workspaceMembers.userId),
      set: { role },
    });
}

/**
 * Pre-account access via a link invite's signed cookie (Phase 4.4) — checks
 * for a pending grant (inviteEmail set, userId still null) and, if found,
 * always grants view-only. The role stored on the row is what it upgrades to
 * once the visitor completes real sign-in, not what this pre-account check
 * hands out.
 */
export async function canViewByEmail(claimedEmail: string, workspaceId: string): Promise<boolean> {
  const member = await db.query.workspaceMembers.findFirst({
    where: and(
      eq(workspaceMembers.workspaceId, workspaceId),
      eq(workspaceMembers.inviteEmail, claimedEmail.toLowerCase()),
      isNull(workspaceMembers.userId),
    ),
  });
  return !!member;
}
