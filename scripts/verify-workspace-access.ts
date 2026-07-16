/**
 * verify-workspace-access.ts
 * Run: npx tsx scripts/verify-workspace-access.ts
 *
 * Phase 2 verify step from plans/06-multi-workspace-dashboard.md: exercises
 * listMyWorkspaces/listSharedWithMe/getRole/canAccess/canViewByEmail against
 * two throwaway users and a throwaway custom workspace, asserting the
 * expected owner/member/no-access split. Creates and tears down its own rows
 * — safe to re-run, and doesn't touch real users or the flagship/personal
 * rows seeded by scripts/seed-workspaces.ts.
 */
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { users, workspaces, workspaceMembers } from '@/db/schema';
import { canAccess, canViewByEmail, getRole, listMyWorkspaces, listSharedWithMe } from '@/lib/workspaces/access';

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${message}`);
}

async function main() {
  const [owner] = await db
    .insert(users)
    .values({ email: `verify-owner-${Date.now()}@example.com`, name: 'Verify Owner' })
    .returning();
  const [member] = await db
    .insert(users)
    .values({ email: `verify-member-${Date.now()}@example.com`, name: 'Verify Member' })
    .returning();
  const [stranger] = await db
    .insert(users)
    .values({ email: `verify-stranger-${Date.now()}@example.com`, name: 'Verify Stranger' })
    .returning();

  const [ws] = await db
    .insert(workspaces)
    .values({ name: 'Verify Custom Workspace', ownerId: owner.id, kind: 'custom' })
    .returning();

  await db.insert(workspaceMembers).values({ workspaceId: ws.id, userId: member.id, role: 'viewer' });
  await db.insert(workspaceMembers).values({
    workspaceId: ws.id,
    inviteEmail: 'pending-invite@example.com',
    role: 'editor',
  });

  try {
    assert((await getRole(owner.id, ws.id)) === 'owner', 'owner should have role owner');
    assert((await getRole(member.id, ws.id)) === 'viewer', 'member should have role viewer');
    assert((await getRole(stranger.id, ws.id)) === null, 'stranger should have no role');

    assert(await canAccess(owner.id, ws.id, 'editor'), 'owner should pass editor-level canAccess');
    assert(!(await canAccess(member.id, ws.id, 'editor')), 'viewer should fail editor-level canAccess');
    assert(await canAccess(member.id, ws.id, 'viewer'), 'viewer should pass viewer-level canAccess');
    assert(!(await canAccess(stranger.id, ws.id)), 'stranger should fail canAccess entirely');

    const owned = await listMyWorkspaces(owner.id);
    assert(
      owned.some((w) => w.id === ws.id),
      'listMyWorkspaces(owner) should include the custom workspace',
    );

    const sharedWithMember = await listSharedWithMe(member.id);
    assert(
      sharedWithMember.some((row) => row.workspace.id === ws.id && row.role === 'viewer'),
      'listSharedWithMe(member) should include the workspace as viewer',
    );
    const sharedWithOwner = await listSharedWithMe(owner.id);
    assert(
      !sharedWithOwner.some((row) => row.workspace.id === ws.id),
      "listSharedWithMe(owner) should NOT include a workspace they own",
    );

    assert(
      await canViewByEmail('pending-invite@example.com', ws.id),
      'canViewByEmail should find the pending grant',
    );
    assert(
      !(await canViewByEmail('nobody@example.com', ws.id)),
      'canViewByEmail should reject an email with no pending grant',
    );

    console.log('All workspace-access checks passed.');
  } finally {
    await db.delete(workspaceMembers).where(eq(workspaceMembers.workspaceId, ws.id));
    await db.delete(workspaces).where(eq(workspaces.id, ws.id));
    for (const u of [owner, member, stranger]) {
      await db.delete(users).where(eq(users.id, u.id));
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
