import { redirect, notFound } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { auth } from '@/auth';
import {
  getWorkspace,
  getRole,
  listMembers,
  addMemberByEmail,
  removeMember,
  listInviteLinks,
  createInviteLink,
  revokeInviteLink,
} from '@/lib/workspaces/access';

const CARD_CLASS = 'rounded-xl border border-line bg-surface p-4';

export default async function SharePage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const session = await auth();
  if (!session?.user) redirect('/app/login');

  const ws = await getWorkspace(workspaceId);
  if (!ws) notFound();

  // Owner-only — sharing controls aren't visible to editors/viewers, mirroring
  // how getRole/canAccess already gate everything else per-workspace.
  const role = await getRole(session.user.id, workspaceId);
  if (role !== 'owner') redirect(`/w/${workspaceId}`);

  const members = await listMembers(workspaceId);
  const inviteLinks = await listInviteLinks(workspaceId);
  const host = (await headers()).get('host');
  const origin = host?.startsWith('localhost') || host?.startsWith('127.0.0.1') ? `http://${host}` : `https://${host}`;

  async function addMember(formData: FormData) {
    'use server';
    const session = await auth();
    if (!session?.user || (await getRole(session.user.id, workspaceId)) !== 'owner') redirect('/app/login');
    const email = String(formData.get('email') ?? '').trim();
    const role = formData.get('role') === 'editor' ? 'editor' : 'viewer';
    if (!email) return;
    await addMemberByEmail(workspaceId, email, role);
    revalidatePath(`/w/${workspaceId}/share`);
  }

  async function removeMemberAction(formData: FormData) {
    'use server';
    const session = await auth();
    if (!session?.user || (await getRole(session.user.id, workspaceId)) !== 'owner') redirect('/app/login');
    const memberId = String(formData.get('memberId') ?? '');
    if (!memberId) return;
    await removeMember(workspaceId, memberId);
    revalidatePath(`/w/${workspaceId}/share`);
  }

  async function generateLink(formData: FormData) {
    'use server';
    const session = await auth();
    if (!session?.user || (await getRole(session.user.id, workspaceId)) !== 'owner') redirect('/app/login');
    const role = formData.get('role') === 'editor' ? 'editor' : 'viewer';
    await createInviteLink(workspaceId, session.user.id, role);
    revalidatePath(`/w/${workspaceId}/share`);
  }

  async function revokeLinkAction(formData: FormData) {
    'use server';
    const session = await auth();
    if (!session?.user || (await getRole(session.user.id, workspaceId)) !== 'owner') redirect('/app/login');
    const token = String(formData.get('token') ?? '');
    if (!token) return;
    await revokeInviteLink(workspaceId, token);
    revalidatePath(`/w/${workspaceId}/share`);
  }

  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-8">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-brass">Share</p>
        <h1 className="mt-1 text-2xl font-semibold text-ink">{ws.name}</h1>
      </header>

      <section className={`${CARD_CLASS} mb-6`}>
        <h2 className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">Add by email</h2>
        <form action={addMember} className="flex flex-wrap items-end gap-2">
          <label className="min-w-[12rem] flex-1">
            <span className="mb-1 block text-xs font-medium text-muted">Email</span>
            <input
              type="email"
              name="email"
              required
              placeholder="teammate@example.com"
              className="w-full rounded-lg border border-line bg-canvas px-2.5 py-1.5 text-sm text-ink placeholder:text-muted focus:border-brass focus:outline-none"
            />
          </label>
          <label>
            <span className="mb-1 block text-xs font-medium text-muted">Role</span>
            <select
              name="role"
              defaultValue="viewer"
              className="rounded-lg border border-line bg-canvas px-2.5 py-1.5 text-sm text-ink focus:border-brass focus:outline-none"
            >
              <option value="viewer">Viewer</option>
              <option value="editor">Editor</option>
            </select>
          </label>
          <button
            type="submit"
            className="rounded-lg bg-ink px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Add
          </button>
        </form>
        <p className="mt-2 text-xs text-muted">
          If they don&rsquo;t have an account yet, access grants automatically the first time they sign in with this email.
        </p>
      </section>

      <section className={`${CARD_CLASS} mb-6`}>
        <h2 className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">Shareable link</h2>
        <form action={generateLink} className="flex flex-wrap items-end gap-2">
          <label>
            <span className="mb-1 block text-xs font-medium text-muted">Role</span>
            <select
              name="role"
              defaultValue="viewer"
              className="rounded-lg border border-line bg-canvas px-2.5 py-1.5 text-sm text-ink focus:border-brass focus:outline-none"
            >
              <option value="viewer">Viewer</option>
              <option value="editor">Editor</option>
            </select>
          </label>
          <button
            type="submit"
            className="rounded-lg bg-ink px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Generate link
          </button>
        </form>
        <p className="mt-2 text-xs text-muted">
          Anyone with a link can view it and enter their email to get access — no password required until they make a full account.
        </p>

        {inviteLinks.length > 0 && (
          <ul className="mt-4 space-y-2">
            {inviteLinks.map((link) => (
              <li key={link.token} className="rounded-lg border border-line-soft px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs uppercase tracking-wide text-muted">{link.role}</p>
                  <form action={revokeLinkAction}>
                    <input type="hidden" name="token" value={link.token} />
                    <button type="submit" className="text-xs text-muted transition-colors hover:text-oxblood">
                      Revoke
                    </button>
                  </form>
                </div>
                <input
                  type="text"
                  readOnly
                  value={`${origin}/invite/${link.token}`}
                  className="mt-1 w-full rounded-lg border border-line bg-canvas px-2.5 py-1.5 text-xs text-ink focus:border-brass focus:outline-none"
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={CARD_CLASS}>
        <h2 className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">People with access</h2>
        {members.length === 0 ? (
          <p className="text-sm text-muted">Only you have access so far.</p>
        ) : (
          <ul className="space-y-2">
            {members.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 rounded-lg border border-line-soft px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm text-ink">{m.name ?? m.email ?? 'Unknown'}</p>
                  <p className="text-xs uppercase tracking-wide text-muted">
                    {m.role}
                    {m.pending ? ' · pending' : ''}
                  </p>
                </div>
                <form action={removeMemberAction}>
                  <input type="hidden" name="memberId" value={m.id} />
                  <button type="submit" className="text-xs text-muted transition-colors hover:text-oxblood">
                    Remove
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
