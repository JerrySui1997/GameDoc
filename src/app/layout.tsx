import type { Metadata } from 'next';
import { EB_Garamond } from 'next/font/google';
import { cookies } from 'next/headers';
import './globals.css';

// The Character Studio panel's warm, journal aesthetic. Self-hosted by next/font
// (no runtime network), exposed as a CSS var the .sp-* styles consume.
const garamond = EB_Garamond({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-garamond',
  display: 'swap',
});
import { SidebarNav } from '@/components/SidebarNav';
import { DocsProvider } from '@/components/docs/DocsProvider';
import { readDocs } from '@/lib/docs/store';
import { TemplatesProvider } from '@/components/templates/TemplatesProvider';
import { readTemplates } from '@/lib/templates/store';
import { CollectionsProvider } from '@/components/collections/CollectionsProvider';
import { readCollections } from '@/lib/collections/store';
import { AUTH_COOKIE, authEnabled, safeEqual, sessionToken } from '@/lib/auth/session';

export const metadata: Metadata = {
  title: { default: 'Game Design Tool', template: '%s · Game Design Tool' },
  description: 'Game design tool and documentation workspace for structured content systems.',
};

// suppressHydrationWarning: browser extensions (Grammarly, etc.) inject
// attributes like data-gr-ext-installed onto <body> before React hydrates. This
// suppresses only this element's attribute mismatch — it does NOT hide
// hydration bugs in child components.
const BODY_CLASS = 'min-h-screen bg-canvas text-ink antialiased';

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // When the gate is on and the visitor isn't signed in, render a bare shell so
  // the login page can't leak the sidebar's doc tree — and skip the data reads
  // entirely. Middleware guarantees the only route reaching here unauthenticated
  // is /login.
  const gated = authEnabled();
  const authed = gated
    ? safeEqual((await cookies()).get(AUTH_COOKIE)?.value, await sessionToken())
    : true;

  if (!authed) {
    return (
      <html lang="en" className={garamond.variable}>
        <body suppressHydrationWarning className={BODY_CLASS}>
          {children}
        </body>
      </html>
    );
  }

  const [docs, templates, collections] = await Promise.all([
    readDocs(),
    readTemplates(),
    readCollections(),
  ]);

  // Ship the docs tree without page bodies: 40 pages of body text (~80 KB before
  // JSON escaping, embedded in both the SSR HTML and the RSC payload) dominated
  // every full page load, and the layout consumers (sidebar, tree) only need
  // metadata. The current page's own body still server-renders via
  // docs/[id]/page.tsx, and DocsProvider back-fills the rest with one
  // background fetch after first paint.
  const docsLite = docs.map((d) => ({ ...d, body: '' }));

  return (
    <html lang="en" className={garamond.variable}>
      <body suppressHydrationWarning className={BODY_CLASS}>
        <CollectionsProvider initialCollections={collections}>
          <TemplatesProvider initialTemplates={templates}>
            <DocsProvider initialDocs={docsLite}>
              <div className="min-h-screen lg:grid lg:grid-cols-[280px_1fr]">
                <SidebarNav showLogout={gated} />
                <main className="bg-surface px-4 py-6 sm:px-6 lg:px-10 lg:py-8">{children}</main>
              </div>
            </DocsProvider>
          </TemplatesProvider>
        </CollectionsProvider>
      </body>
    </html>
  );
}
