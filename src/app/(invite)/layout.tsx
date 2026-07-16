import type { Metadata } from 'next';
import { EB_Garamond } from 'next/font/google';
import '../globals.css';

const garamond = EB_Garamond({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-garamond',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'Invite', template: '%s · Invite' },
  description: 'Accept a workspace invite.',
};

const BODY_CLASS = 'min-h-screen bg-canvas text-ink antialiased';

// A fourth root layout, alongside (site)/(personal)/(workspaces) — /invite/*
// is the one surface a signed-out visitor is meant to reach without a
// session (see plans/06 Phase 4.4), so unlike (workspaces) this layout does
// no auth check at all; the page itself decides what a given token allows.
export default function InviteLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={garamond.variable}>
      <body suppressHydrationWarning className={BODY_CLASS}>
        {children}
      </body>
    </html>
  );
}
