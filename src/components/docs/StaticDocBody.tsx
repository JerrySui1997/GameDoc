import { parseBody, isWidgetBlock, type ProseType } from '@/lib/docs/blocks';

// ── Instant read-only page paint ────────────────────────────────────────────
// A static, non-interactive render of a page's stored body string, shown the
// instant the page loads (server-rendered — no Yjs, no WebSocket, no client
// data fetch). DocView swaps it for the live collaborative editor once the Yjs
// room has content to show. Its whole job is to kill the "blank gray box, then
// content pops in late" waterfall: the reader sees the real page immediately and
// the editor takes over seamlessly a beat later.
//
// It mirrors the editor's prose typography (PROSE_CLASS in PageEditor) so the
// handoff doesn't jump. Widget blocks are inherently interactive, so we don't
// reproduce them here — they render as a calm placeholder that the live widget
// fills in.

// Kept in sync with PageEditor's PROSE_CLASS so the static → live swap is seamless.
const PROSE_CLASS: Record<ProseType, string> = {
  paragraph: 'text-[15px] leading-relaxed text-ink',
  heading1: 'text-3xl font-bold tracking-tight text-ink',
  heading2: 'text-2xl font-bold tracking-tight text-ink',
  heading3: 'text-xl font-semibold text-ink',
  bullet: 'text-[15px] leading-relaxed text-ink',
  numbered: 'text-[15px] leading-relaxed text-ink',
  quote: 'text-lg leading-relaxed font-medium italic text-muted border-l-2 border-line pl-4',
  code: 'font-mono text-sm leading-relaxed text-ink bg-canvas rounded-md px-3 py-2 whitespace-pre-wrap',
  divider: '',
  beat: 'text-xs font-semibold uppercase tracking-wide text-muted',
};

export function StaticDocBody({ title, body }: { title: string; body: string }) {
  const blocks = parseBody(body);
  let numbered = 0; // running index across a consecutive run of numbered items
  let beatN = 0; // running index across every beat marker in the whole page

  return (
    <div className="w-full space-y-3" aria-hidden>
      <h1 className="text-4xl font-bold tracking-tight text-ink">{title}</h1>
      {blocks.map((block) => {
        if (isWidgetBlock(block)) {
          numbered = 0;
          return (
            <div
              key={block.id}
              className="flex min-h-[6rem] items-center justify-center rounded-lg border border-line bg-canvas/40"
            >
              <span className="animate-pulse font-mono text-[11px] uppercase tracking-wide text-muted/70">
                {block.type}
              </span>
            </div>
          );
        }

        const cls = PROSE_CLASS[block.type];
        if (block.type === 'divider') {
          numbered = 0;
          return <hr key={block.id} className="border-line" />;
        }
        if (block.type === 'beat') {
          numbered = 0;
          beatN += 1;
          return (
            <div key={block.id} className="my-4 flex items-center gap-3">
              <span className="h-px flex-1 bg-line" />
              <span className="flex shrink-0 items-center gap-2">
                <span className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full border border-brass px-1 font-mono text-[11px] font-semibold tabular-nums text-brass">
                  {beatN}
                </span>
                {block.text && <span className={cls}>{block.text}</span>}
              </span>
              <span className="h-px flex-1 bg-line" />
            </div>
          );
        }
        if (block.type === 'bullet') {
          numbered = 0;
          return (
            <div key={block.id} className="flex gap-2">
              <span className="select-none pt-0.5 text-brass" aria-hidden>•</span>
              <p className={`${cls} whitespace-pre-wrap`}>{block.text}</p>
            </div>
          );
        }
        if (block.type === 'numbered') {
          numbered += 1;
          return (
            <div key={block.id} className="flex gap-2">
              <span className="select-none pt-0.5 tabular-nums text-brass" aria-hidden>{numbered}.</span>
              <p className={`${cls} whitespace-pre-wrap`}>{block.text}</p>
            </div>
          );
        }

        numbered = 0;
        if (block.type === 'heading1') return <h1 key={block.id} className={cls}>{block.text}</h1>;
        if (block.type === 'heading2') return <h2 key={block.id} className={cls}>{block.text}</h2>;
        if (block.type === 'heading3') return <h3 key={block.id} className={cls}>{block.text}</h3>;
        if (block.type === 'quote') return <blockquote key={block.id} className={cls}>{block.text}</blockquote>;
        if (block.type === 'code') return <pre key={block.id} className={cls}>{block.text}</pre>;
        return <p key={block.id} className={`${cls} whitespace-pre-wrap`}>{block.text}</p>;
      })}
    </div>
  );
}
