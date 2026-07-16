'use client';

import Link from 'next/link';
import { DocsTree } from '@/components/docs/DocsTree';
import { ProfileMenu } from '@/components/ProfileMenu';

export function WorkspaceSidebarNav({
  workspaceId,
  workspaceName,
  isOwner,
  name,
  email,
  image,
  onLogout,
}: {
  workspaceId: string;
  workspaceName: string;
  isOwner: boolean;
  /** All null for a cookie-only pre-account visitor (Phase 4.4) — there's no
   *  real session to show a profile menu for, so the sidebar falls back to a
   *  plain "Guest (view-only)" label with no account link or logout form. */
  name?: string | null;
  email?: string | null;
  image?: string | null;
  /** Server action (from the (workspaces)/w/[workspaceId] layout) bound to
   *  signOut() — passed in rather than imported here since this is a Client
   *  Component and next-auth's signOut() must run server-side. */
  onLogout: () => void;
}) {
  return (
    <aside className="docs-scroll border-b border-line bg-surface lg:border-b-0 lg:border-r lg:border-line lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto">
      <div className="flex min-h-full flex-col px-4 py-5 sm:px-6 lg:px-5">
        <Link href="/dashboard" className="block font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-brass">
          ← Dashboard
        </Link>
        <Link href={`/w/${workspaceId}`} className="mt-1 block truncate text-lg font-semibold text-ink">
          {workspaceName}
        </Link>

        <div className="mt-6">
          <DocsTree basePath={`/w/${workspaceId}/docs`} />
        </div>

        <div className="mt-auto border-t border-line-soft pt-3">
          {isOwner && (
            <Link
              href={`/w/${workspaceId}/share`}
              className="block rounded-lg px-2 py-1.5 text-sm text-muted transition-colors hover:bg-canvas hover:text-ink"
            >
              Share
            </Link>
          )}
          {name || email ? (
            <ProfileMenu name={name} email={email} image={image} onLogout={onLogout} />
          ) : (
            <p className="truncate px-2 py-1.5 text-xs text-muted">Guest (view-only)</p>
          )}
        </div>
      </div>
    </aside>
  );
}
