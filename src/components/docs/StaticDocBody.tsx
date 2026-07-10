'use client';

import { useEffect, useState } from 'react';
import {
  DEFAULT_LAYOUT,
  isWidgetBlock,
  parseBody,
  parseLegend,
  type ProseBlock,
  type WidgetBlock,
} from '@/lib/docs/blocks';
import { LEGEND_STYLE, type PageLegend } from '@/lib/docs/legend';
import { splitInline } from '@/lib/docs/inlineFormat';
import { buildMentionIndex, type MentionTarget } from '@/lib/docs/mentionTarget';
import { MentionChip } from './Mentions';
import { useDocs } from './DocsProvider';
import { WidgetHost } from './widgets/registry';
import {
  ALIGN_SELF,
  BeatFrame,
  blockSpacing,
  ColorFrame,
  computeListInfo,
  computeOrdinals,
  Divider,
  markSpanClass,
  MarkerColumn,
  PROSE_CLASS,
  QuoteFrame,
  WIDTH_CLASS,
} from './blockChrome';

// ── Instant read-only page paint ────────────────────────────────────────────
// A pixel-faithful, non-interactive mirror of the live collaborative editor
// (LiveEditor + PageEditor), shown the instant a page loads (server-rendered —
// no Yjs, no WebSocket, no client data fetch). DocView swaps it for the real
// editor once the Yjs room has content to show. Because this reproduces the
// editor's chrome, spacing, layout, inline formatting and legend tinting
// exactly (via the shared helpers in ./blockChrome), the swap is invisible —
// the reader never sees a repaint.
//
// Widgets are the one exception: their SSR/pre-mount appearance is a calm
// placeholder (they're interactive React islands, not safe to render inert on
// the server), upgraded to the real widget the moment the client mounts —
// still fully inert, since the parallel hidden LiveEditor is what actually
// warms the live instance.

export function StaticDocBody({ docId, title, body }: { docId: string; title: string; body: string }) {
  const { docs } = useDocs();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const blocks = parseBody(body);
  const legend = parseLegend(body);
  const legendById = new Map(legend.map((e) => [e.id, e]));
  const ordinals = computeOrdinals(blocks);
  const listInfo = computeListInfo(blocks);
  const mentionIndex = buildMentionIndex(docs);

  const histBtn = 'rounded-lg border border-line px-2 py-1 text-xs font-semibold text-muted opacity-40';

  return (
    <div aria-hidden>
      {/* Connection-status row twin — mirrors LiveEditor's pre-sync state so
          nothing shifts when the real one takes over. */}
      <div className="flex items-center justify-between gap-4">
        <span className="flex items-center gap-1.5 font-mono text-[11px] font-medium text-muted">
          <span className="inline-block h-2 w-2 rounded-full bg-line" />
          Connecting…
        </span>
      </div>

      <h1 className="text-4xl font-bold tracking-tight text-ink">{title || ' '}</h1>

      <div className="flex gap-4">
        <div className="min-w-0 flex-1">
          <StaticLegendBar legend={legend} />
          <div className="mb-1 flex justify-end gap-1">
            <span className={histBtn}>↶ Undo</span>
            <span className={histBtn}>↷ Redo</span>
          </div>
          <div className="relative">
            <div className="flex flex-wrap items-start gap-x-3">
              {blocks.map((block) => {
                const layout = block.layout ?? DEFAULT_LAYOUT;
                const spacing = blockSpacing(listInfo.get(block.id));
                const colorId = !isWidgetBlock(block) ? block.color : undefined;
                const tag = colorId ? legendById.get(colorId) : undefined;
                return (
                  <div key={block.id} className={`${spacing} ${WIDTH_CLASS[layout.width]} ${ALIGN_SELF[layout.align]}`}>
                    <div className="relative min-w-0">
                      {isWidgetBlock(block) ? (
                        <StaticWidget block={block} docId={docId} mounted={mounted} />
                      ) : (
                        <ColorFrame color={tag?.color}>
                          <StaticProse block={block} ordinal={ordinals.get(block.id)} mentionIndex={mentionIndex} />
                        </ColorFrame>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        {/* Reserves the WidgetShelf's width so column widths (%) compute against
            the same available row width as the live editor — otherwise a
            columned page's blocks would be visibly wider pre-sync. */}
        <aside className="w-56 shrink-0" />
      </div>
    </div>
  );
}

// ── Prose block (read-only) ──────────────────────────────────────────────────

function StaticProse({ block, ordinal, mentionIndex }: {
  block: ProseBlock;
  ordinal?: number;
  mentionIndex: Map<string, MentionTarget>;
}) {
  if (block.type === 'divider') return <Divider />;

  const typography = PROSE_CLASS[block.type];
  const segments = splitInline(block.text);
  const content = (
    <div className={`whitespace-pre-wrap break-words ${typography}`}>
      {segments.length === 0
        ? ' ' // an empty block still reserves one line of height, like the editor's rows={1} textarea
        : segments.map((seg, i) =>
            seg.kind === 'mention' ? (
              <MentionChip key={i} id={seg.id} raw={seg.raw} target={mentionIndex.get(seg.id) ?? null} onOpen={() => {}} />
            ) : (
              <span key={i} className={markSpanClass(seg.marks)}>{seg.text}</span>
            ),
          )}
    </div>
  );

  const marker = block.type === 'bullet' ? '•' : block.type === 'numbered' ? `${ordinal ?? 1}.` : null;

  if (block.type === 'quote') return <QuoteFrame>{content}</QuoteFrame>;
  if (block.type === 'beat') return <BeatFrame ordinal={ordinal ?? 1}>{content}</BeatFrame>;
  if (marker) return <MarkerColumn marker={marker}>{content}</MarkerColumn>;
  return content;
}

// ── Widget block (calm placeholder → real, inert widget once mounted) ───────

function StaticWidget({ block, docId, mounted }: { block: WidgetBlock; docId: string; mounted: boolean }) {
  if (!mounted) {
    return (
      <div className="flex min-h-[6rem] items-center justify-center rounded-lg border border-line bg-canvas/40">
        <span className="animate-pulse font-mono text-[11px] uppercase tracking-wide text-muted/70">{block.type}</span>
      </div>
    );
  }
  return (
    <div className="pointer-events-none" inert>
      <WidgetHost block={block} onChange={() => {}} docId={docId} />
    </div>
  );
}

// ── Page color legend bar (read-only twin of PageEditor's LegendBar) ────────

function StaticLegendBar({ legend }: { legend: PageLegend }) {
  if (legend.length === 0) {
    return (
      <span className="mb-3 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-line px-2.5 py-1 text-xs font-medium text-muted">
        <span className="text-sm leading-none">＋</span> Add color legend
      </span>
    );
  }
  return (
    <div className="mb-4 rounded-xl border border-line bg-canvas/60 p-2.5">
      <div className="mb-1.5 px-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-muted">Color legend</div>
      <div className="flex flex-wrap items-center gap-2">
        {legend.map((e) => {
          const st = LEGEND_STYLE[e.color];
          return (
            <span key={e.id} className={`relative inline-flex items-center gap-1.5 rounded-lg border py-1 pl-1.5 pr-1 ${st.border} ${st.tint}`}>
              <span className={`h-4 w-4 flex-shrink-0 rounded-full ring-1 ring-inset ring-black/10 ${st.swatch}`} />
              <span className={`inline-block w-28 truncate text-xs font-medium ${e.label ? st.text : 'text-muted'}`}>
                {e.label || 'Meaning…'}
              </span>
              <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center text-[11px] text-muted">✕</span>
            </span>
          );
        })}
        <span className="inline-flex items-center gap-1 rounded-lg border border-dashed border-line px-2 py-1 text-xs font-medium text-muted">
          ＋ Color
        </span>
      </div>
    </div>
  );
}
