import type { Metadata } from 'next';
import { EB_Garamond } from 'next/font/google';
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

export const metadata: Metadata = {
  title: { default: 'Game Design Tool', template: '%s · Game Design Tool' },
  description: 'Game design tool and documentation workspace for structured content systems.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
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
      {/* suppressHydrationWarning: browser extensions (Grammarly, etc.) inject
          attributes like data-gr-ext-installed onto <body> before React
          hydrates. This suppresses only this element's attribute mismatch — it
          does NOT hide hydration bugs in child components. */}
      <body suppressHydrationWarning className="min-h-screen bg-canvas text-ink antialiased">
        <CollectionsProvider initialCollections={collections}>
          <TemplatesProvider initialTemplates={templates}>
            <DocsProvider initialDocs={docsLite}>
              <div className="min-h-screen lg:grid lg:grid-cols-[280px_1fr]">
                <SidebarNav />
                <main className="bg-surface px-4 py-6 sm:px-6 lg:px-10 lg:py-8">{children}</main>
              </div>
            </DocsProvider>
          </TemplatesProvider>
        </CollectionsProvider>
      </body>
    </html>
  );
}
