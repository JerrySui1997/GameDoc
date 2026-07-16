import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getValidInviteLink, getWorkspace, getRole, addMemberByEmail, redeemInviteForUser } from '@/lib/workspaces/access';
import { setViewCookie } from '@/lib/workspaces/inviteCookie';

const CARD_CLASS = 'w-full max-w-sm rounded-xl border border-line bg-surface p-6';

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const link = await getValidInviteLink(token);

  if (!link) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className={CARD_CLASS}>
          <h1 className="text-lg font-semibold text-ink">Invite link invalid</h1>
          <p className="mt-2 text-sm text-muted">This link has expired, been revoked, or never existed.</p>
        </div>
      </div>
    );
  }

  const ws = await getWorkspace(link.workspaceId);
  if (!ws) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className={CARD_CLASS}>
          <h1 className="text-lg font-semibold text-ink">Workspace no longer exists</h1>
        </div>
      </div>
    );
  }

  // Already signed in: redeem directly at the link's role rather than asking
  // for an email we already know, then land them straight in the workspace.
  const session = await auth();
  if (session?.user) {
    const existingRole = await getRole(session.user.id, link.workspaceId);
    if (!existingRole) {
      await redeemInviteForUser(link.workspaceId, session.user.id, link.role);
    }
    redirect(`/w/${link.workspaceId}`);
  }

  const { workspaceId, role: linkRole } = link;

  async function acceptWithEmail(formData: FormData) {
    'use server';
    const email = String(formData.get('email') ?? '').trim();
    if (!email) return;
    // Same resolved-or-pending shape the owner's direct add-by-email uses —
    // if this email already has an account, access resolves immediately;
    // otherwise it's a pending grant that src/auth.ts's createUser event
    // upgrades the moment that email actually signs up.
    await addMemberByEmail(workspaceId, email, linkRole);
    await setViewCookie(workspaceId, email);
    redirect(`/w/${workspaceId}`);
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className={CARD_CLASS}>
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-brass">Invite</p>
        <h1 className="mt-1 text-lg font-semibold text-ink">
          You&rsquo;ve been invited to <span className="font-semibold">{ws.name}</span>
        </h1>
        <p className="mt-2 text-sm text-muted">
          Enter your email to continue as a {link.role}. No password needed yet — you can make a full account later.
        </p>
        <form action={acceptWithEmail} className="mt-4 space-y-3">
          <input
            type="email"
            name="email"
            required
            placeholder="you@example.com"
            className="w-full rounded-lg border border-line bg-canvas px-2.5 py-1.5 text-sm text-ink placeholder:text-muted focus:border-brass focus:outline-none"
          />
          <button
            type="submit"
            className="w-full rounded-lg bg-ink px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Continue
          </button>
        </form>
        <p className="mt-3 text-xs text-muted">
          Already have an account? <a href="/app/login" className="underline">Sign in</a> instead for full, cross-device access.
        </p>
      </div>
    </div>
  );
}
