import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth, signOut } from '@/auth';
import { listMyWorkspaces, listSharedWithMe, type Workspace } from '@/lib/workspaces/access';
import { createWorkspaceAction } from './actions';

// Each workspace kind already has a richer, purpose-built home than the
// generic /w/[workspaceId] shell (the flagship's glossary/ladder/nightmare/
// boards suite, the personal space's own sidebar) — so the dashboard links
// straight to those rather than funneling everyone through /w/. Only
// `kind: 'custom'` workspaces actually live at /w/{id}.
function hrefFor(ws: Workspace): string {
  if (ws.kind === 'flagship') return '/';
  if (ws.kind === 'personal') return '/app';
  return `/w/${ws.id}`;
}

const CARD_CLASS =
  'block rounded-xl border border-line bg-surface p-4 transition-colors hover:border-brass';

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect('/app/login');
  const userId = session.user.id;
  const [mine, shared] = await Promise.all([listMyWorkspaces(userId), listSharedWithMe(userId)]);

  async function logout() {
    'use server';
    await signOut({ redirectTo: '/app/login' });
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-brass">Game Design</p>
          <h1 className="mt-1 text-2xl font-semibold text-ink">Your dashboard</h1>
        </div>
        <form action={logout}>
          <button
            type="submit"
            className="rounded-lg px-3 py-1.5 text-sm text-muted transition-colors hover:bg-canvas hover:text-oxblood"
          >
            Log out
          </button>
        </form>
      </header>

      <section className="mb-10">
        <h2 className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
          Your workspaces
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {mine.map((ws) => (
            <Link key={ws.id} href={hrefFor(ws)} className={CARD_CLASS}>
              <p className="font-medium text-ink">{ws.name}</p>
              <p className="mt-1 text-xs uppercase tracking-wide text-muted">{ws.kind}</p>
            </Link>
          ))}

          <form
            action={createWorkspaceAction}
            className="flex flex-col justify-between gap-2 rounded-xl border border-dashed border-line p-4"
          >
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted">New workspace</span>
              <input
                type="text"
                name="name"
                required
                placeholder="Workspace name"
                className="w-full rounded-lg border border-line bg-canvas px-2.5 py-1.5 text-sm text-ink placeholder:text-muted focus:border-brass focus:outline-none"
              />
            </label>
            <button
              type="submit"
              className="self-start rounded-lg bg-ink px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              Create
            </button>
          </form>
        </div>
      </section>

      {shared.length > 0 && (
        <section>
          <h2 className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
            Shared with you
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {shared.map(({ workspace, role }) => (
              <Link key={workspace.id} href={hrefFor(workspace)} className={CARD_CLASS}>
                <p className="font-medium text-ink">{workspace.name}</p>
                <p className="mt-1 text-xs uppercase tracking-wide text-muted">{role}</p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
