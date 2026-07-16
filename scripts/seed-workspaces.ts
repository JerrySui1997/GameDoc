/**
 * seed-workspaces.ts
 * Run: npx tsx scripts/seed-workspaces.ts
 *
 * One-off backfill for plans/06-multi-workspace-dashboard.md Phase 2, for
 * `users` rows that existed before workspaces did (src/auth.ts's createUser
 * event now handles both of these for every account created from here on):
 *   1. Personal workspace row for every user missing one.
 *   2. The flagship workspace row, owned by FLAGSHIP_OWNER_EMAIL — skipped
 *      with a warning if that email hasn't signed in on this database yet
 *      (no user row to own it). Safe to re-run: every insert is guarded by
 *      onConflictDoNothing.
 */
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { users, workspaces } from '@/db/schema';
import { FLAGSHIP_OWNER_EMAIL, FLAGSHIP_WORKSPACE_ID, personalWorkspaceId } from '@/lib/workspaces/constants';

async function main() {
  const allUsers = await db.select({ id: users.id, email: users.email }).from(users);

  let personalCreated = 0;
  for (const user of allUsers) {
    const result = await db
      .insert(workspaces)
      .values({ id: personalWorkspaceId(user.id), name: 'Personal', ownerId: user.id, kind: 'personal' })
      .onConflictDoNothing();
    if (result.changes > 0) personalCreated++;
  }
  console.log(`Personal workspaces: ${personalCreated} created, ${allUsers.length - personalCreated} already present.`);

  const owner = allUsers.find((u) => u.email === FLAGSHIP_OWNER_EMAIL);
  if (!owner) {
    console.warn(
      `No user row for ${FLAGSHIP_OWNER_EMAIL} yet — flagship workspace not seeded. Sign in once on this ` +
        `database, then re-run this script (or let src/auth.ts's createUser event seed it automatically on that sign-in).`,
    );
  } else {
    const result = await db
      .insert(workspaces)
      .values({ id: FLAGSHIP_WORKSPACE_ID, name: 'GameDoc', ownerId: owner.id, kind: 'flagship' })
      .onConflictDoNothing();
    console.log(
      result.changes > 0
        ? `Flagship workspace created, owned by ${owner.email} (${owner.id}).`
        : `Flagship workspace already present.`,
    );
  }

  const flagship = await db.query.workspaces.findFirst({ where: eq(workspaces.id, FLAGSHIP_WORKSPACE_ID) });
  console.log('Flagship row:', flagship ?? '(none)');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
