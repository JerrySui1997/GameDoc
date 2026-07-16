import { redirect } from 'next/navigation';
import { auth, signOut } from '@/auth';
import { getWorkspace, getRole, canViewByEmail } from '@/lib/workspaces/access';
import { getViewCookieEmail } from '@/lib/workspaces/inviteCookie';
import { docsScopeFor } from '@/lib/workspaces/constants';
import { WorkspaceSidebarNav } from '@/components/WorkspaceSidebarNav';
import { DocsProvider } from '@/components/docs/DocsProvider';
import { readDocs } from '@/lib/docs/store';
import { TemplatesProvider } from '@/components/templates/TemplatesProvider';
import { readTemplates } from '@/lib/templates/store';
import { CollectionsProvider } from '@/components/collections/CollectionsProvider';
import { readCollections } from '@/lib/collections/store';

// Generalized workspace shell (Phase 4) — resolves storage scope by `kind` so
// it technically works for all three workspace kinds, but in practice only
// custom workspaces live here day-to-day: flagship and personal each have
// their own richer, purpose-built layout (glossary/ladder/nightmare/boards for
// the former, its own sidebar for the latter) that this generic shell doesn't
// replicate — see dashboard/page.tsx's hrefFor for why their cards skip /w/.
export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const session = await auth();

  const ws = await getWorkspace(workspaceId);
  let role = session?.user ? await getRole(session.user.id, workspaceId) : null;

  // Pre-account view access (Phase 4.4): a visitor who redeemed an invite
  // link without signing in has no NextAuth session, only a signed cookie
  // recording the email their pending grant is under. Never upgrades past
  // 'viewer' here regardless of the role stored on that pending row — this
  // is read access only, same ceiling as canViewByEmail's own doc comment.
  // Note: this only gates the SSR page render below, not the live collab
  // WS connection (which still requires a real session) or the /api/w/*
  // routes (session-only) — a cookie-only visitor sees the page's current
  // content but won't get live updates or be able to save edits.
  if (!role && ws) {
    const cookieEmail = await getViewCookieEmail(workspaceId);
    if (cookieEmail && (await canViewByEmail(cookieEmail, workspaceId))) {
      role = 'viewer';
    }
  }

  if (!ws || !role) {
    redirect(session?.user ? '/dashboard' : '/app/login');
  }

  const scope = docsScopeFor(ws);
  const apiBase = `/api/w/${workspaceId}`;

  async function logout() {
    'use server';
    await signOut({ redirectTo: '/app/login' });
  }

  const [docs, templates, collections] = await Promise.all([
    readDocs(scope),
    readTemplates(scope),
    readCollections(scope),
  ]);

  const docsLite = docs.map((d) => ({ ...d, body: '' }));

  return (
    <CollectionsProvider initialCollections={collections} apiBase={`${apiBase}/collections`}>
      <TemplatesProvider initialTemplates={templates} apiBase={`${apiBase}/templates`}>
        <DocsProvider initialDocs={docsLite} apiBase={`${apiBase}/docs`} enableAgentStream={false}>
          <div className="min-h-screen lg:grid lg:grid-cols-[280px_1fr]">
            <WorkspaceSidebarNav
              workspaceId={workspaceId}
              workspaceName={ws.name}
              isOwner={role === 'owner'}
              name={session?.user?.name}
              email={session?.user?.email}
              image={session?.user?.image}
              onLogout={logout}
            />
            <main className="bg-surface px-4 py-6 sm:px-6 lg:px-10 lg:py-8">{children}</main>
          </div>
        </DocsProvider>
      </TemplatesProvider>
    </CollectionsProvider>
  );
}
