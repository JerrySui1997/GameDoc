import type { Metadata } from 'next';
import { EB_Garamond } from 'next/font/google';
import '../globals.css';

// Same font as the (site)/(personal) layouts — the Character Studio panel's
// .sp-* styles expect --font-garamond wherever PageEditor can render.
const garamond = EB_Garamond({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-garamond',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'Dashboard', template: '%s · Dashboard' },
  description: 'Your workspaces.',
};

const BODY_CLASS = 'min-h-screen bg-canvas text-ink antialiased';

// A third root layout alongside (site) and (personal) — /dashboard and /w/*
// are account-level surfaces, not scoped to either the flagship site or the
// personal space, so they get their own <html>/<body> shell. This layout only
// provides that shell — it does NOT gate on session, because /w/[workspaceId]
// also accepts a signed pre-account view cookie in place of a real session
// (Phase 4.4); each child (dashboard/page.tsx, w/[workspaceId]/layout.tsx)
// enforces its own access rule instead of sharing one gate here.
export default function WorkspacesLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={garamond.variable}>
      <body suppressHydrationWarning className={BODY_CLASS}>
        {children}
      </body>
    </html>
  );
}
