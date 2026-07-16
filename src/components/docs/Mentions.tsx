'use client';

import { useCallback, useEffect, useState } from 'react';
import { NODE_KINDS, type NodeKind } from '@/lib/docs/graph';
import type { MentionTarget } from '@/lib/docs/mentionTarget';
import type { InlineMark } from '@/lib/docs/inlineFormat';

// The presentation layer for an @page-id mention. A mention used to read as the
// raw `@slug` token sitting in the prose; here it becomes a colored chip whose
// hue encodes *what kind of thing* it points at (an automatic, self-forming color
// legend), a hover popup that previews the referenced page, and a side panel that
// slides in with the details — without leaving the page. The chip itself adds no
// vertical box (tint + inset ring, never a border) so the overlay it lives in
// stays line-aligned with the textarea underneath; see PageEditor's ProseView.

// ── Kind → color (the automatic legend) ──────────────────────────────────────
// One literal class set per kind — Tailwind v4 only emits classes it sees in
// source, so these are spelled out (never `bg-${kind}`), mirroring LEGEND_STYLE /
// the Related panel's KIND_DOT. `chip` is the inline pill; `badge` styles the
// kind tag in the tooltip + panel header; `mark` is the paint-only highlight worn
// while the block is being edited (see inlineMentionClass); `dot` is the solid
// swatch the auto reference legend shows next to the kind's name.
type KindStyle = { label: string; chip: string; badge: string; mark: string; dot: string };

const MENTION_KIND: Record<NodeKind, KindStyle> = {
  character: {
    label: 'Character',
    chip: 'bg-violet-50 text-violet-700 ring-violet-200 hover:bg-violet-100 hover:ring-violet-300',
    badge: 'border-violet-200 bg-violet-50 text-violet-700',
    mark: 'bg-violet-200/45 ring-violet-300/60',
    dot: 'bg-violet-500',
  },
  timeline: {
    label: 'Timeline',
    chip: 'bg-sky-50 text-sky-700 ring-sky-200 hover:bg-sky-100 hover:ring-sky-300',
    badge: 'border-sky-200 bg-sky-50 text-sky-700',
    mark: 'bg-sky-200/45 ring-sky-300/60',
    dot: 'bg-sky-500',
  },
  page: {
    label: 'Page',
    chip: 'bg-amber-50 text-amber-800 ring-amber-200 hover:bg-amber-100 hover:ring-amber-300',
    badge: 'border-amber-200 bg-amber-50 text-amber-800',
    mark: 'bg-amber-200/45 ring-amber-300/60',
    dot: 'bg-amber-500',
  },
  space: {
    label: 'Space',
    chip: 'bg-emerald-50 text-emerald-700 ring-emerald-200 hover:bg-emerald-100 hover:ring-emerald-300',
    badge: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    mark: 'bg-emerald-200/45 ring-emerald-300/60',
    dot: 'bg-emerald-500',
  },
};

// A mention pointing at a page id that no longer exists — a broken reference.
const MENTION_MISSING: KindStyle = {
  label: 'Missing',
  chip: 'bg-rose-50 text-rose-600 ring-rose-200 line-through decoration-rose-300 hover:bg-rose-100',
  badge: 'border-rose-200 bg-rose-50 text-rose-700',
  mark: 'bg-rose-200/45 ring-rose-300/60 line-through decoration-rose-400/70',
  dot: 'bg-rose-400',
};

/** What a page's references can resolve to: a page kind, or a broken link. */
export type ReferenceKind = NodeKind | 'missing';

// ── The automatic reference legend ───────────────────────────────────────────
// A read-only legend bar shown at the top of any page whose prose contains
// @mentions. It is *derived*, never authored or persisted: each entry is a kind
// of thing the page actually references, in the same colors the inline chips
// wear — so the legend explains the chips. Distinct from the page's manual
// color legend (LegendBar), whose colors are an author-defined vocabulary.

export function ReferenceLegend({ kinds }: { kinds: ReadonlySet<ReferenceKind> }) {
  if (kinds.size === 0) return null;
  // Stable presentation order: the controlled kind list, broken refs last.
  const ordered: ReferenceKind[] = [...NODE_KINDS.filter((k) => kinds.has(k)), ...(kinds.has('missing') ? (['missing'] as const) : [])];
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-line bg-canvas/60 px-2.5 py-2">
      <span className="font-mono text-[10px] font-semibold uppercase tracking-wide text-muted">References</span>
      {ordered.map((k) => {
        const style = k === 'missing' ? MENTION_MISSING : MENTION_KIND[k];
        return (
          <span key={k} className="inline-flex items-center gap-1.5 text-xs font-medium text-ink/80">
            <span className={`h-2 w-2 shrink-0 rounded-full ${style.dot}`} aria-hidden />
            {style.label}
          </span>
        );
      })}
    </div>
  );
}

function kindStyle(target: MentionTarget | null): KindStyle {
  return target ? MENTION_KIND[target.kind] : MENTION_MISSING;
}

/**
 * The mention's appearance *while its block is being edited*. A chip can't ride
 * over a live textarea — it shows the page title (not the raw `@slug`) and has its
 * own padding/weight, so the caret would drift out from under the text. This is
 * the chip's editing cousin: a paint-only tint + inset ring (both box-shadow /
 * background, never layout) laid exactly over the raw `@slug`, so every glyph metric
 * stays identical and the caret, selection and spellcheck keep working on the real
 * text underneath — while the mention still reads as a colored, kind-coded token
 * instead of collapsing to flat plain text the instant you click in.
 */
export function inlineMentionClass(target: MentionTarget | null): string {
  return `rounded-[3px] ring-1 ring-inset ${kindStyle(target).mark}`;
}

// ── Formatting marks (bold/italic/code) — same paint-only technique ──────────
// One literal tint per mark, deliberately drawn from the app's own chrome
// palette (ink/teal/coffee) rather than the mention kind ramps above (violet/
// sky/amber/emerald/rose) or brass/oxblood (already meaningful elsewhere as
// brand-action / canon-locked) — marks carry no "kind" of their own to encode.
const MARK_TINT: Record<InlineMark, string> = {
  bold: 'bg-ink/10 ring-ink/15',
  italic: 'bg-teal/10 ring-teal/20',
  code: 'bg-coffee/15 ring-coffee/25',
};

/**
 * A mark's appearance *while its block is being edited* — the same paint-only
 * technique as inlineMentionClass above (tint + inset ring, never a font-weight/
 * size/padding change): real bold/italic/monospace styling only becomes
 * possible once the block blurs into chip/read mode (see PageEditor's
 * MentionReadLayer), since a live textarea can't render per-character weight.
 */
export function inlineMarkClass(marks: InlineMark[]): string {
  if (!marks.length) return '';
  return `rounded-[3px] ring-1 ring-inset ${marks.map((m) => MARK_TINT[m]).join(' ')}`;
}

// ── @mention menu ─────────────────────────────────────────────────────────────
// A compact page picker shown while typing `@query`. Mirrors the slash menu's
// block-anchored dropdown; each row shows the page title and the slug that will
// be inserted (so the writer learns the id). Picking inserts `@<id> `. Shared
// between prose (PageEditor) and widget text (MentionField) — every `@`
// typeahead in the app is this same menu.

/** Rank a candidate against the query: prefix match beats a mere substring. */
export function mentionRank(item: { id: string; title: string }, q: string): number {
  if (!q) return 0;
  return item.id.toLowerCase().startsWith(q) || item.title.toLowerCase().startsWith(q) ? 2 : 1;
}

export function MentionMenu({
  items,
  activeIndex,
  onHover,
  onPick,
}: {
  items: { id: string; title: string }[];
  activeIndex: number;
  onHover: (i: number) => void;
  onPick: (i: number) => void;
}) {
  return (
    <div className="absolute left-0 top-full z-20 mt-1 max-h-64 w-64 overflow-auto rounded-xl border border-line bg-surface p-1 shadow-lg">
      <div className="px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-wide text-muted">Link a page</div>
      {items.map((it, i) => (
        <button
          key={it.id}
          type="button"
          onMouseEnter={() => onHover(i)}
          onMouseDown={(e) => { e.preventDefault(); onPick(i); }}
          className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left ${
            i === activeIndex ? 'bg-canvas text-ink' : 'text-muted'
          }`}
        >
          <span className="flex-shrink-0 font-semibold text-teal">@</span>
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{it.title}</span>
          <span className="flex-shrink-0 font-mono text-[10px] text-muted">{it.id}</span>
        </button>
      ))}
    </div>
  );
}

// ── The inline chip ──────────────────────────────────────────────────────────

export function MentionChip({ id, raw, target, onOpen }: {
  id: string;
  /** The literal `@slug` token, shown when the target page can't be resolved. */
  raw: string;
  target: MentionTarget | null;
  onOpen: (id: string) => void;
}) {
  const [hover, setHover] = useState(false);
  const style = kindStyle(target);
  const label = target?.title || raw.replace(/^@/, '');

  return (
    <span
      className="relative inline"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <button
        type="button"
        // Swallow the mousedown so the read-overlay's "click to edit" handler
        // (which would focus the textarea) never fires for a chip; the chip's
        // job is to open the panel, not to place a caret.
        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onOpen(id); }}
        onFocus={() => setHover(true)}
        onBlur={() => setHover(false)}
        title={target ? `${style.label}: ${target.title}` : `Missing page: ${id}`}
        className={`cursor-pointer rounded px-1 align-baseline text-[0.95em] font-semibold ring-1 ring-inset transition-colors ${style.chip}`}
      >
        {label}
      </button>
      {hover && <MentionTooltip id={id} target={target} style={style} />}
    </span>
  );
}

// ── Hover tooltip — a quick preview of the referenced page ────────────────────

function MentionTooltip({ id, target, style }: { id: string; target: MentionTarget | null; style: KindStyle }) {
  return (
    <span className="pointer-events-none absolute left-0 top-full z-30 mt-1.5 block w-72 max-w-[80vw] rounded-xl border border-line bg-raised p-3 text-left shadow-xl">
      <span className={`mb-1.5 inline-block rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide ${style.badge}`}>
        {style.label}
      </span>
      {target ? (
        <>
          <span className="block text-sm font-semibold leading-snug text-ink">{target.title}</span>
          {target.excerpt ? (
            <span className="mt-1 block text-[12px] leading-snug text-muted line-clamp-3">{target.excerpt}</span>
          ) : (
            <span className="mt-1 block text-[12px] italic leading-snug text-muted">No description yet.</span>
          )}
          <span className="mt-2 block font-mono text-[10px] uppercase tracking-wide text-brass">Click to open →</span>
        </>
      ) : (
        <>
          <span className="block font-mono text-sm font-semibold text-ink">{id}</span>
          <span className="mt-1 block text-[12px] leading-snug text-muted">No page has this id — the link is broken.</span>
        </>
      )}
    </span>
  );
}

// ── Slide-in detail panel ─────────────────────────────────────────────────────
// A right-anchored panel that slides in when a chip is clicked. It previews the
// referenced page in place (kind, title, excerpt) and offers a jump to the full
// page, so the writer can check a reference without losing their spot.

export function MentionPanel({ id, target, onClose }: {
  id: string;
  target: MentionTarget | null;
  onClose: () => void;
}) {
  // `visible` drives the enter/exit transforms; we delay the unmount on close so
  // the panel slides back out rather than snapping away.
  const [visible, setVisible] = useState(false);
  useEffect(() => { setVisible(true); }, []);

  const requestClose = useCallback(() => {
    setVisible(false);
    setTimeout(onClose, 250);
  }, [onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') requestClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [requestClose]);

  const style = kindStyle(target);

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Reference preview">
      <button
        type="button"
        aria-label="Close panel"
        onClick={requestClose}
        className={`absolute inset-0 cursor-default bg-ink/25 transition-opacity duration-200 ${visible ? 'opacity-100' : 'opacity-0'}`}
      />
      <aside
        className={`absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-line bg-surface shadow-2xl transition-transform duration-300 ease-out ${visible ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <span className={`inline-block rounded-md border px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-wide ${style.badge}`}>
            {style.label}
          </span>
          <button
            type="button"
            onClick={requestClose}
            title="Close (Esc)"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-canvas hover:text-ink"
          >
            ✕
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {target ? (
            <>
              <h2 className="text-2xl font-bold leading-tight tracking-tight text-ink">{target.title}</h2>
              <p className="mt-1 font-mono text-[11px] text-muted">@{target.id}</p>
              {target.excerpt ? (
                <p className="mt-4 text-[15px] leading-relaxed text-ink/90">{target.excerpt}</p>
              ) : (
                <p className="mt-4 text-sm italic text-muted">This page has no prose yet.</p>
              )}
            </>
          ) : (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
              <p className="text-sm font-semibold text-rose-700">Broken reference</p>
              <p className="mt-1 text-sm leading-relaxed text-rose-600">
                No page exists with the id <code className="font-mono">{id}</code>. It may have been renamed or deleted.
              </p>
            </div>
          )}
        </div>

        {target && (
          <footer className="border-t border-line px-5 py-4">
            <a
              href={`/docs/${target.id}`}
              className="flex items-center justify-center gap-2 rounded-lg bg-ink px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-ink-soft"
            >
              Open full page →
            </a>
          </footer>
        )}
      </aside>
    </div>
  );
}
