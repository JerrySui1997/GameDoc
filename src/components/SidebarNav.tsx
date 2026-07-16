'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { DocsTree } from '@/components/docs/DocsTree';
import { ProfileMenu } from '@/components/ProfileMenu';

// Background utilities — not primary content, so they live in a quiet footer
// rather than the main tree. Collections feeds the "Collection" field on
// specialized pages; Nightmare is the legacy hardcoded tool.
const UTILITY_LINKS = [
  { href: '/dashboard', label: 'All projects' },
  { href: '/collections', label: 'Collections' },
  { href: '/boards', label: 'Reference Boards' },
  { href: '/nightmare', label: 'Nightmare (legacy)' },
];

export function SidebarNav({
  name,
  email,
  image,
  onLogout,
}: {
  name?: string | null;
  email?: string | null;
  image?: string | null;
  /** Server action (from src/app/(site)/layout.tsx) bound to signOut() —
   *  passed in rather than imported here since this is a Client Component and
   *  next-auth's signOut() must run server-side. */
  onLogout: () => void;
}) {
  const pathname = usePathname();

  return (
    <aside className="docs-scroll border-b border-line bg-surface lg:border-b-0 lg:border-r lg:border-line lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto">
      <div className="flex min-h-full flex-col px-4 py-5 sm:px-6 lg:px-5">
        <Link href="/" className="block">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-brass">Game Design</p>
          <p className="mt-1 text-lg font-semibold text-ink">Tool + Codex</p>
        </Link>

        <div className="mt-6">
          <DocsTree />
        </div>

        <div className="mt-auto pt-6">
          <p className="mb-2 px-1 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">Utilities</p>
          <nav className="space-y-0.5" aria-label="Utility navigation">
            {UTILITY_LINKS.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={[
                    'block rounded-lg px-2 py-1.5 text-sm transition-colors',
                    isActive ? 'bg-brass-soft font-medium text-ink' : 'text-muted hover:bg-canvas hover:text-ink',
                  ].join(' ')}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-4 border-t border-line-soft pt-3">
            <ProfileMenu name={name} email={email} image={image} onLogout={onLogout} />
          </div>
        </div>
      </div>
    </aside>
  );
}
