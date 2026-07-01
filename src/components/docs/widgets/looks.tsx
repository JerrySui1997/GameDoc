'use client';

import type { ReactNode } from 'react';
import { clsx } from 'clsx';
import type { WidgetType } from '@/lib/docs/blocks';
import { WIDGET_CATALOG } from '../catalog';

// ── Small-widget visual identity ─────────────────────────────────────────────
// The structured field widgets (labeled / status / badges / tags / refs /
// collection) used to share one plain label-over-input chrome, so on a busy page
// they were hard to tell apart. Each now gets a distinct accent identity — a
// colored left rail, a faint matching tint, a border, and the widget's own
// catalog icon in the corner — so an author spots each one's niche at a glance.
//
// Controlled vocabulary in one place, literal Tailwind classes only (v4 is
// build-time static, so dynamic `bg-${x}-50` would never be emitted).

type WidgetLook = { bar: string; tint: string; icon: string; border: string };

export const WIDGET_LOOK: Partial<Record<WidgetType, WidgetLook>> = {
  labeled: { bar: 'bg-indigo-400', tint: 'bg-indigo-50/40', icon: 'text-indigo-400', border: 'border-indigo-100' },
  statusBadge: { bar: 'bg-amber-400', tint: 'bg-amber-50/40', icon: 'text-amber-500', border: 'border-amber-100' },
  badges: { bar: 'bg-violet-400', tint: 'bg-violet-50/40', icon: 'text-violet-400', border: 'border-violet-100' },
  tags: { bar: 'bg-teal-400', tint: 'bg-teal-50/40', icon: 'text-teal-500', border: 'border-teal-100' },
  refs: { bar: 'bg-sky-400', tint: 'bg-sky-50/40', icon: 'text-sky-500', border: 'border-sky-100' },
  collection: { bar: 'bg-emerald-400', tint: 'bg-emerald-50/40', icon: 'text-emerald-500', border: 'border-emerald-100' },
};

/** Frame a small field widget with its accent identity. Widgets without a look
 *  (the deck-level rich widgets, which are already visually distinct) pass
 *  through unwrapped. */
export function WidgetShell({ type, children }: { type: WidgetType; children: ReactNode }) {
  const look = WIDGET_LOOK[type];
  if (!look) return <>{children}</>;
  return (
    <div className={clsx('relative w-full rounded-lg border py-2.5 pl-4 pr-8', look.tint, look.border)}>
      <span className={clsx('absolute inset-y-2 left-0 w-1 rounded-r', look.bar)} aria-hidden />
      <span className={clsx('pointer-events-none absolute right-2.5 top-2.5 opacity-50', look.icon)} aria-hidden>
        {WIDGET_CATALOG[type].icon}
      </span>
      {children}
    </div>
  );
}
