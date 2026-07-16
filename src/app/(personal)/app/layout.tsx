import type { Metadata } from 'next';
import { EB_Garamond } from 'next/font/google';
import '../../globals.css';
import { auth, signOut } from '@/auth';
import { PersonalSidebarNav } from '@/components/PersonalSidebarNav';
import { DocsProvider } from '@/components/docs/DocsProvider';
import { readDocs } from '@/lib/docs/store';
import { TemplatesProvider } from '@/components/templates/TemplatesProvider';
import { readTemplates } from '@/lib/templates/store';
import { CollectionsProvider } from '@/components/collections/CollectionsProvider';
import { readCollections } from '@/lib/collections/store';

// Same font as the owner's (site) layout — the Character Studio panel's .sp-*
// styles expect --font-garamond wherever PageEditor can render, and personal
// spaces share the same block/widget system.
const garamond = EB_Garamond({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-garamond',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'My Workspace', template: '%s · My Workspace' },
  description: 'Your personal game design workspace.',
};

const BODY_CLASS = 'min-h-screen bg-canvas text-ink antialiased';

// This is a separate root layout from src/app/(site)/layout.tsx — Next.js
// treats /app as a literal URL segment (not a route group), so it needed its
// own (personal) route group to get an independent <html>/<body> shell
// instead of nesting inside the owner's site.
export default async function PersonalLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  // Middleware (src/middleware.ts) redirects any unauthenticated /app/* request
  // to /app/login except for /app/login itself — so the only way to land here
  // with no session is /app/login, which renders its own form and needs no
  // sidebar/data. Skipping the reads here also means a signed-out visitor never
  // triggers per-user disk reads for a space that may not exist yet.
  if (!session?.user) {
    return (
      <html lang="en" className={garamond.variable}>
        <body suppressHydrationWarning className={BODY_CLASS}>
          {children}
        </body>
      </html>
    );
  }

  const userId = session.user.id;

  async function logout() {
    'use server';
    await signOut({ redirectTo: '/app/login' });
  }

  const [docs, templates, collections] = await Promise.all([
    readDocs({ userId }),
    readTemplates({ userId }),
    readCollections({ userId }),
  ]);

  // Same payload-size trick as the owner's layout: ship the tree body-less,
  // let docs/[id]/page.tsx SSR the one body the first paint needs, and let
  // DocsProvider's background fetch fill in the rest.
  const docsLite = docs.map((d) => ({ ...d, body: '' }));

  return (
    <html lang="en" className={garamond.variable}>
      <body suppressHydrationWarning className={BODY_CLASS}>
        <CollectionsProvider initialCollections={collections} apiBase="/api/app/collections">
          <TemplatesProvider initialTemplates={templates} apiBase="/api/app/templates">
            <DocsProvider initialDocs={docsLite} apiBase="/api/app/docs" enableAgentStream={false}>
              <div className="min-h-screen lg:grid lg:grid-cols-[280px_1fr]">
                <PersonalSidebarNav
                  name={session.user.name}
                  email={session.user.email}
                  image={session.user.image}
                  onLogout={logout}
                />
                <main className="bg-surface px-4 py-6 sm:px-6 lg:px-10 lg:py-8">{children}</main>
              </div>
            </DocsProvider>
          </TemplatesProvider>
        </CollectionsProvider>
      </body>
    </html>
  );
}
