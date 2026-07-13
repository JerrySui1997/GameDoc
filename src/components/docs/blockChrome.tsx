// Shared visual constants + pure layout helpers for rendering a page's blocks,
// used by both the live PageEditor and the read-only StaticDocBody. Keeping
// these in one place means the two renderers can never drift apart again —
// see the first-paint-parity fix that introduced this file.

import type { ReactNode } from 'react';
import {
  isListType,
  isWidgetBlock,
  type BlockAlign,
  type BlockWidth,
  type DocBlock,
  type ProseType,
} from '@/lib/docs/blocks';
import type { LegendColor } from '@/lib/docs/legend';
import { LEGEND_STYLE } from '@/lib/docs/legend';
import type { InlineMark } from '@/lib/docs/inlineFormat';

export const PROSE_CLASS: Record<ProseType, string> = {
  paragraph: 'text-[15px] leading-relaxed text-ink',
  heading1: 'text-3xl font-bold tracking-tight text-ink',
  heading2: 'text-2xl font-bold tracking-tight text-ink',
  heading3: 'text-xl font-semibold text-ink',
  bullet: 'text-[15px] leading-relaxed text-ink',
  numbered: 'text-[15px] leading-relaxed text-ink',
  quote: 'text-lg leading-relaxed font-medium italic text-muted',
  code: 'font-mono text-sm leading-relaxed text-ink bg-canvas rounded-md px-3 py-2',
  divider: '',
  beat: 'text-xs font-semibold uppercase tracking-wide text-muted',
};

// Literal Tailwind width classes per layout fraction (Tailwind v4 only emits
// classes it sees in source, so these must be literal — never `w-[${x}]`). Each
// fraction subtracts the row gap (0.75rem) so any combination of widths fits one
// flex-wrap row beside its neighbours; below `sm` everything stacks full-width.
export const WIDTH_CLASS: Record<BlockWidth, string> = {
  full: 'w-full',
  twothirds: 'w-full sm:w-[calc(66.667%-0.75rem)]',
  half: 'w-full sm:w-[calc(50%-0.75rem)]',
  third: 'w-full sm:w-[calc(33.333%-0.75rem)]',
};
export const ALIGN_SELF: Record<BlockAlign, string> = {
  top: 'self-start',
  center: 'self-center',
  bottom: 'self-end',
};

// ── Ordinals + list-run spacing ──────────────────────────────────────────────
// Pure functions over a flat block list — no component state — so both the
// live editor (over `displayBlocks`) and the static renderer (over `parseBody`
// output) number/space blocks identically.

/** Auto-numbered markers. `numbered` list items count within a contiguous run
 *  (reset by any other block type). `beat` markers count across the whole page
 *  instead — never reset — since they number a story's full sequence of moments,
 *  not a run; the two types are mutually exclusive so one map serves both. */
export function computeOrdinals(blocks: DocBlock[]): Map<string, number> {
  const map = new Map<string, number>();
  let run = 0;
  let beatN = 0;
  for (const b of blocks) {
    if (!isWidgetBlock(b) && b.type === 'numbered') {
      run += 1;
      map.set(b.id, run);
    } else {
      run = 0;
    }
    if (!isWidgetBlock(b) && b.type === 'beat') {
      beatN += 1;
      map.set(b.id, beatN);
    }
  }
  return map;
}

export type ListRunInfo = { first: boolean; last: boolean };

/** List-run membership: for each block in a contiguous run of list items (bullet
 *  or numbered, mixed runs allowed), whether it is the first / last of its run.
 *  Drives tight inter-item spacing so a run reads as one list. A lone list item
 *  is a run of length 1 (first && last). */
export function computeListInfo(blocks: DocBlock[]): Map<string, ListRunInfo> {
  const map = new Map<string, ListRunInfo>();
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (isWidgetBlock(b) || !isListType(b.type)) continue;
    const prev = blocks[i - 1];
    const next = blocks[i + 1];
    const first = !prev || isWidgetBlock(prev) || !isListType(prev.type);
    const last = !next || isWidgetBlock(next) || !isListType(next.type);
    map.set(b.id, { first, last });
  }
  return map;
}

/** List items sit tight (no internal vertical padding); the run keeps normal
 *  padding only at its outer (first/last) edges. */
export function blockSpacing(li: ListRunInfo | undefined): string {
  return li ? `${li.first ? 'pt-0.5' : 'pt-0'} ${li.last ? 'pb-0.5' : 'pb-0'}` : 'py-0.5';
}

// ── Block chrome ──────────────────────────────────────────────────────────────
// Tiny wrapper components for the block "frames" that both ProseView (wrapping
// its textarea) and the static renderer (wrapping plain text) use identically.

export function Divider() {
  return <hr className="my-3 border-t border-line" />;
}

export function QuoteFrame({ children }: { children: ReactNode }) {
  return <div className="my-1 rounded-r-lg border-l-4 border-brass bg-canvas py-2 pl-4 pr-3">{children}</div>;
}

export function BeatFrame({ ordinal, children }: { ordinal: number; children: ReactNode }) {
  return (
    <div className="my-4 flex items-center gap-3">
      <span className="h-px flex-1 bg-line" aria-hidden />
      <span className="flex shrink-0 items-center gap-2">
        <span
          className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full border border-brass px-1 font-mono text-[11px] font-semibold tabular-nums text-brass"
          aria-hidden
        >
          {ordinal}
        </span>
        <div className="min-w-0 max-w-[16rem]">{children}</div>
      </span>
      <span className="h-px flex-1 bg-line" aria-hidden />
    </div>
  );
}

export function MarkerColumn({ marker, children }: { marker: ReactNode; children: ReactNode }) {
  return (
    <div className="flex gap-2">
      <span className="w-6 flex-shrink-0 select-none pt-0.5 text-right text-[15px] leading-relaxed tabular-nums text-brass">{marker}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

// ── Legend-colour frame (tinted rail around a tagged prose block) ────────────
// Mirrors the small-widget look (a colored left rail + faint wash) so a tagged
// paragraph reads as kin to the field widgets. No tag → children pass through.
export function ColorFrame({ color, children }: { color?: LegendColor; children: ReactNode }) {
  if (!color) return <>{children}</>;
  const st = LEGEND_STYLE[color];
  return (
    <div className={`relative rounded-lg py-1 pl-3.5 pr-2 ${st.tint}`}>
      <span className={`pointer-events-none absolute inset-y-1 left-0 w-1 rounded-r ${st.bar}`} aria-hidden />
      {children}
    </div>
  );
}

/** A mark's *resolved* (read-mode) appearance — real font-weight/style/
 *  monospace styling, safe once the block isn't a live-edited textarea
 *  anymore. Composable: a segment can carry more than one mark. Used by both
 *  the editor's idle chip overlay and the static renderer. */
export function markSpanClass(marks: InlineMark[]): string {
  if (!marks.length) return '';
  const cls: string[] = [];
  if (marks.includes('bold')) cls.push('font-semibold');
  if (marks.includes('italic')) cls.push('italic');
  if (marks.includes('code')) cls.push('rounded bg-canvas px-1 py-0.5 font-mono text-[0.9em] text-brass');
  return cls.join(' ');
}
