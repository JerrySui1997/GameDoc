'use client';

import type { ReactNode } from 'react';
import type { ProseType, WidgetType } from '@/lib/docs/blocks';

// ── Block & widget catalogue ─────────────────────────────────────────────────
// One place that answers, for every insertable thing in the editor, the three
// questions a new user has: what does it look like (icon), what is it for
// (blurb), and what will I get (preview). The slash menu and the widget shelf
// both read from here so the two stay in sync and a user only learns each block
// once. Previews are tiny, static, non-interactive mock-ups — never the live
// widget — so they're cheap to render in a popover or menu row.

export type CatalogEntry = {
  /** ~16px line icon, inherits `currentColor`. */
  icon: ReactNode;
  /** One-line "what is this for". */
  blurb: string;
  /** A miniature static mock-up of the rendered result. */
  preview: ReactNode;
};

// A consistent 16px icon frame so every glyph aligns in menus and buttons.
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
}

// Shorthand letter-mark icon for the headings (H1/H2/H3).
function LetterIcon({ label }: { label: string }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
      <text x="12" y="16" textAnchor="middle" fontSize="11" fontWeight="700" fill="currentColor">{label}</text>
    </svg>
  );
}

// ── Prose blocks ──────────────────────────────────────────────────────────────

export const PROSE_CATALOG: Record<ProseType, CatalogEntry> = {
  paragraph: {
    icon: <Icon><line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="14" y2="17" /></Icon>,
    blurb: 'Plain body text.',
    preview: (
      <div className="space-y-1">
        <div className="h-1.5 w-full rounded bg-line" />
        <div className="h-1.5 w-full rounded bg-line" />
        <div className="h-1.5 w-2/3 rounded bg-line" />
      </div>
    ),
  },
  heading1: {
    icon: <LetterIcon label="H1" />,
    blurb: 'Large section title.',
    preview: <div className="h-3 w-3/4 rounded bg-ink" />,
  },
  heading2: {
    icon: <LetterIcon label="H2" />,
    blurb: 'Medium sub-section title.',
    preview: <div className="h-2.5 w-2/3 rounded bg-ink" />,
  },
  heading3: {
    icon: <LetterIcon label="H3" />,
    blurb: 'Small sub-heading.',
    preview: <div className="h-2 w-1/2 rounded bg-muted" />,
  },
  bullet: {
    icon: <Icon><circle cx="5" cy="7" r="1" /><circle cx="5" cy="12" r="1" /><circle cx="5" cy="17" r="1" /><line x1="9" y1="7" x2="20" y2="7" /><line x1="9" y1="12" x2="20" y2="12" /><line x1="9" y1="17" x2="20" y2="17" /></Icon>,
    blurb: 'Unordered bulleted list.',
    preview: (
      <div className="space-y-1">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-1.5">
            <span className="h-1 w-1 rounded-full bg-muted" />
            <div className="h-1.5 flex-1 rounded bg-line" />
          </div>
        ))}
      </div>
    ),
  },
  numbered: {
    icon: <Icon><line x1="9" y1="7" x2="20" y2="7" /><line x1="9" y1="12" x2="20" y2="12" /><line x1="9" y1="17" x2="20" y2="17" /><path d="M4 5v4M4 9h1M4 14h1.2L4 17h1.2" /></Icon>,
    blurb: 'Ordered numbered list.',
    preview: (
      <div className="space-y-1">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-1.5">
            <span className="text-[7px] font-semibold text-muted">{i}.</span>
            <div className="h-1.5 flex-1 rounded bg-line" />
          </div>
        ))}
      </div>
    ),
  },
  quote: {
    icon: <Icon><path d="M7 7v6M7 13c0 0 4 0 4-4M17 7v6M17 13c0 0 4 0 4-4" /></Icon>,
    blurb: 'Set-apart callout quote.',
    preview: (
      <div className="rounded-r border-l-2 border-brass bg-canvas py-1 pl-2">
        <div className="h-1.5 w-5/6 rounded bg-muted" />
        <div className="mt-1 h-1.5 w-2/3 rounded bg-muted" />
      </div>
    ),
  },
  code: {
    icon: <Icon><polyline points="9 8 5 12 9 16" /><polyline points="15 8 19 12 15 16" /></Icon>,
    blurb: 'Monospaced code block.',
    preview: (
      <div className="rounded bg-canvas px-2 py-1.5 font-mono text-[7px] leading-relaxed text-muted">
        const x = 42;<br />return x * 2;
      </div>
    ),
  },
  divider: {
    icon: <Icon><line x1="4" y1="12" x2="20" y2="12" /></Icon>,
    blurb: 'Horizontal rule between sections.',
    preview: (
      <div className="py-2">
        <div className="h-px w-full bg-line" />
      </div>
    ),
  },
};

// ── Widgets ───────────────────────────────────────────────────────────────────

const chip = (cls: string, w = 'w-8') => <span className={`inline-block h-2 rounded ${w} ${cls}`} />;

export const WIDGET_CATALOG: Record<WidgetType, CatalogEntry> = {
  hero: {
    icon: <Icon><rect x="3" y="6" width="18" height="12" rx="2" /><line x1="7" y1="11" x2="13" y2="11" /><line x1="7" y1="14" x2="17" y2="14" /></Icon>,
    blurb: 'Big lead banner with eyebrow, title & subtitle.',
    preview: (
      <div className="rounded-lg bg-ink px-3 py-2.5 text-white">
        <div className="text-[6px] font-semibold uppercase tracking-widest text-white/60">Eyebrow</div>
        <div className="mt-0.5 text-[11px] font-bold leading-tight">Title goes here</div>
        <div className="text-[7px] text-white/70">A short supporting subtitle.</div>
      </div>
    ),
  },
  cards: {
    icon: <Icon><rect x="3" y="4" width="7" height="7" rx="1" /><rect x="14" y="4" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="6" rx="1" /><rect x="14" y="14" width="7" height="6" rx="1" /></Icon>,
    blurb: 'Responsive grid of titled cards — crew, steps, zones.',
    preview: (
      <div className="grid grid-cols-3 gap-1">
        {[0, 1, 2].map((i) => (
          <div key={i} className="overflow-hidden rounded border border-line bg-white">
            <div className={`h-1 w-full ${['bg-sky-500', 'bg-amber-500', 'bg-rose-500'][i]}`} />
            <div className="space-y-1 p-1">
              <div className="h-1 w-3/4 rounded bg-muted" />
              <div className="h-1 w-full rounded bg-line-soft" />
              <div className="h-1 w-2/3 rounded bg-line-soft" />
            </div>
          </div>
        ))}
      </div>
    ),
  },
  swatch: {
    icon: <Icon><circle cx="7" cy="8" r="3" /><circle cx="15" cy="8" r="3" /><circle cx="11" cy="15" r="3" /></Icon>,
    blurb: 'True-color hex palette swatches, auto-named from each color.',
    preview: (
      <div className="flex gap-1.5">
        {['#6366f1', '#10b981', '#f59e0b', '#ef4444'].map((hex) => (
          <div key={hex} className="flex flex-col items-center gap-0.5">
            <div className="h-6 w-6 rounded" style={{ backgroundColor: hex }} />
            <span className="font-mono text-[6px] uppercase text-muted">{hex}</span>
          </div>
        ))}
      </div>
    ),
  },
  statusBadge: {
    icon: <Icon><rect x="3" y="9" width="18" height="6" rx="3" /><circle cx="7" cy="12" r="1" /></Icon>,
    blurb: 'Labeled colored status chip — tier, state, threat.',
    preview: (
      <div className="flex items-center gap-2">
        <span className="text-[8px] font-semibold uppercase tracking-wide text-muted">Threat</span>
        <span className="rounded border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[8px] font-semibold text-rose-700">Lethal</span>
      </div>
    ),
  },
  labeled: {
    icon: <Icon><line x1="4" y1="8" x2="9" y2="8" /><rect x="4" y="12" width="16" height="5" rx="1" /></Icon>,
    blurb: 'A labeled single- or multi-line value field.',
    preview: (
      <div className="space-y-1">
        <div className="text-[8px] font-semibold uppercase tracking-wide text-muted">Origin</div>
        <div className="rounded border border-line px-1.5 py-1 text-[8px] text-muted">A short written value…</div>
      </div>
    ),
  },
  badges: {
    icon: <Icon><path d="M12 3l2 4 4 .5-3 3 .8 4L12 12l-3.8 2.5.8-4-3-3 4-.5z" /></Icon>,
    blurb: 'List of evidence-style badges.',
    preview: (
      <div className="flex flex-wrap gap-1">
        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[7px] font-semibold text-emerald-700">✓ Tracks</span>
        <span className="rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[7px] font-semibold text-amber-700">? Sound</span>
        <span className="rounded-full border border-line bg-canvas px-1.5 py-0.5 text-[7px] font-semibold text-ink">Scent</span>
      </div>
    ),
  },
  tags: {
    icon: <Icon><path d="M4 8a2 2 0 0 1 2-2h6l8 8-6 6-8-8z" /><circle cx="8.5" cy="10.5" r="1" /></Icon>,
    blurb: 'Row of colored tag chips.',
    preview: (
      <div className="flex flex-wrap gap-1">
        {['stealth', 'night', 'pack'].map((t) => (
          <span key={t} className="rounded bg-indigo-100 px-1.5 py-0.5 text-[7px] font-medium text-indigo-700">{t}</span>
        ))}
      </div>
    ),
  },
  refs: {
    icon: <Icon><path d="M9 12a3 3 0 0 1 3-3h2a3 3 0 0 1 0 6h-1" /><path d="M15 12a3 3 0 0 1-3 3h-2a3 3 0 0 1 0-6h1" /></Icon>,
    blurb: 'List of links to related pages.',
    preview: (
      <div className="space-y-1">
        {['The Stalker', 'Slow Burn'].map((r) => (
          <div key={r} className="flex items-center gap-1 text-[8px] text-teal">
            <span>↗</span><span className="underline">{r}</span>
          </div>
        ))}
      </div>
    ),
  },
  collection: {
    icon: <Icon><rect x="3" y="5" width="18" height="14" rx="1.5" /><line x1="3" y1="10" x2="21" y2="10" /><line x1="9" y1="10" x2="9" y2="19" /></Icon>,
    blurb: 'Embed a saved collection as a table.',
    preview: (
      <div className="overflow-hidden rounded border border-line">
        <div className="grid grid-cols-3 bg-canvas text-[7px] font-semibold text-muted">
          <div className="px-1 py-0.5">Name</div><div className="px-1 py-0.5">Tier</div><div className="px-1 py-0.5">Role</div>
        </div>
        {[0, 1].map((i) => (
          <div key={i} className="grid grid-cols-3 border-t border-line-soft text-[7px] text-muted">
            <div className="px-1 py-0.5">Row {i + 1}</div><div className="px-1 py-0.5">II</div><div className="px-1 py-0.5">DPS</div>
          </div>
        ))}
      </div>
    ),
  },
  studioPanel: {
    icon: <Icon><circle cx="12" cy="8" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></Icon>,
    blurb: 'Interactive character design sheet.',
    preview: (
      <div className="flex gap-2 rounded-lg border border-line bg-canvas p-1.5">
        <div className="flex h-10 w-10 items-center justify-center rounded bg-line-soft text-[10px] text-muted">◑</div>
        <div className="flex-1 space-y-1 pt-0.5">
          <div className="h-1.5 w-3/4 rounded bg-line" />
          <div className="flex gap-1">{chip('bg-indigo-300', 'w-4')}{chip('bg-rose-300', 'w-4')}{chip('bg-emerald-300', 'w-4')}</div>
        </div>
      </div>
    ),
  },
  environmentStudio: {
    icon: <Icon><path d="M3 17l4-6 3 4 4-7 7 9" /><circle cx="18" cy="6" r="1.5" /></Icon>,
    blurb: 'Interactive environment/location design sheet.',
    preview: (
      <div className="flex gap-2 rounded-lg border border-line bg-canvas p-1.5">
        <div className="flex h-10 w-10 items-center justify-center rounded bg-line-soft text-[10px] text-muted">▲</div>
        <div className="flex-1 space-y-1 pt-0.5">
          <div className="h-1.5 w-3/4 rounded bg-line" />
          <div className="flex gap-1">{chip('bg-teal-300', 'w-4')}{chip('bg-amber-300', 'w-4')}{chip('bg-rose-300', 'w-4')}</div>
        </div>
      </div>
    ),
  },
  characterCard: {
    icon: <Icon><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="8.5" cy="11" r="2" /><line x1="13" y1="9" x2="18" y2="9" /><line x1="13" y1="13" x2="18" y2="13" /></Icon>,
    blurb: 'Mirror a character page’s Studio — pick the page, choose which fields to show.',
    preview: (
      <div className="flex gap-2 rounded-lg border border-brass/30 bg-brass-soft p-1.5">
        <div className="flex h-10 w-8 items-center justify-center rounded bg-brass-soft text-[10px] text-brass">◑</div>
        <div className="flex-1 space-y-1 pt-0.5">
          <div className="h-2 w-2/3 rounded bg-ink" />
          <div className="flex gap-1">{chip('bg-sky-400', 'w-5')}{chip('bg-rose-400', 'w-4')}</div>
          <div className="flex gap-0.5">{[1, 2, 3, 4].map((i) => <span key={i} className={`h-1.5 w-1.5 rounded-full ${i < 3 ? 'bg-rose-400' : 'bg-line'}`} />)}</div>
        </div>
      </div>
    ),
  },
  narrativeTimeline: {
    icon: (
      <Icon>
        <path d="M3 8c3 0 3-3 6-3s3 3 6 3 3-3 6-3" />
        <path d="M3 16c3 0 3 3 6 3s3-3 6-3 3 3 6 3" />
        <circle cx="6" cy="6.2" r="1" /><circle cx="12" cy="8" r="1" /><circle cx="18" cy="17.8" r="1" />
      </Icon>
    ),
    blurb: 'A flowing acts-and-moments story spine — drag character portraits onto beats, hover for live page detail.',
    preview: (
      <div className="rounded-lg border border-line bg-canvas p-2">
        <svg viewBox="0 0 120 54" className="w-full" fill="none" strokeWidth="5" strokeLinecap="round">
          <path d="M6 14C26 14 26 40 46 40S66 14 86 14s20 26 28 26" stroke="#d4c8b2" />
          <path d="M6 14C26 14 26 40 46 40" stroke="#3d8fb8" />
          <path d="M46 40S66 14 86 14" stroke="#8c2e2e" />
          <path d="M86 14s20 26 28 26" stroke="#c9a24b" />
          {[['6', '14', '#3d8fb8'], ['46', '40', '#8c2e2e'], ['86', '14', '#c9a24b'], ['114', '40', '#c9a24b']].map(([cx, cy, c], i) => (
            <circle key={i} cx={cx} cy={cy} r="5" fill="#fff" stroke={c} strokeWidth="3" />
          ))}
        </svg>
        <div className="mt-1 flex justify-between text-[6px] font-semibold uppercase tracking-wide text-muted">
          <span>Awakening</span><span>Uprising</span><span>Reckoning</span>
        </div>
      </div>
    ),
  },
  hexelMap: {
    icon: (
      <Icon>
        <path d="M12 3l8 4-8 4-8-4 8-4z" />
        <path d="M4 7v6l8 4v-6" />
        <path d="M20 7v6l-8 4" />
      </Icon>
    ),
    blurb: 'Paint a 3D space in isometric — rotate it, and an engine reads back the rooms, areas, and links as you go.',
    preview: (
      <div className="rounded-lg border border-line bg-canvas p-2">
        <svg viewBox="0 0 120 56" className="w-full">
          {/* grass tiles */}
          {[[60, 18], [70, 23], [50, 23], [60, 28]].map(([cx, cy], i) => (
            <polygon key={`g${i}`} points={`${cx},${cy - 5} ${cx + 10},${cy} ${cx},${cy + 5} ${cx - 10},${cy}`} fill="#7d9b5a" stroke="#5e7444" strokeWidth="0.5" />
          ))}
          {/* a raised stone cube (a wall / room corner) */}
          <polygon points="80,23 90,28 90,38 80,33" fill="#7d6a45" />
          <polygon points="100,23 90,28 90,38 100,33" fill="#94814f" />
          <polygon points="90,18 100,23 90,28 80,23" fill="#b9a06b" stroke="#8a7647" strokeWidth="0.5" />
          {/* a marker on the grass */}
          <circle cx="60" cy="16" r="3" fill="#c9a24b" stroke="#8a6f33" strokeWidth="0.7" />
        </svg>
        <div className="mt-1 flex justify-between text-[6px] font-semibold uppercase tracking-wide text-muted">
          <span>Garden</span><span>Room</span><span>Door</span>
        </div>
      </div>
    ),
  },
  imageBoard: {
    icon: <Icon><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="8.5" cy="10" r="1.5" /><path d="M4 16l5-5 4 4 3-3 4 4" /></Icon>,
    blurb: 'Embed a shared reference image board — pick a board, every page embedding it stays in sync.',
    preview: (
      <div className="grid grid-cols-2 gap-1">
        {['bg-teal-200', 'bg-amber-200', 'bg-rose-200', 'bg-sky-200'].map((cls, i) => (
          <div key={i} className={`h-4 rounded ${cls}`} />
        ))}
      </div>
    ),
  },
};
