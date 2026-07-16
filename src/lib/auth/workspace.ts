import { auth } from '@/auth';
import { canAccess, type Role } from '@/lib/workspaces/access';

// Every /api/w/[workspaceId]/* route resolves access this way and 401s (no
// session) or 403s (session but insufficient role) rather than leaking whether
// a workspace id exists at all. Mirrors src/lib/auth/personal.ts's
// requireUserId, generalized with the role check Phase 2's canAccess() added.
export async function requireWorkspaceRole(
  workspaceId: string,
  minRole: Role = 'viewer',
): Promise<{ userId: string } | null> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;
  if (!(await canAccess(userId, workspaceId, minRole))) return null;
  return { userId };
}
