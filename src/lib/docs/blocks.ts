// Block model for the homegrown page editor (v2).
//
// A doc body is stored as a string (DocNode.body). We serialize blocks to JSON
// inside that string as { v: 2, blocks }. A block is either a *prose* block
// (plain text + a block type) or a *widget* block (a structured widget keyed by
// type, carrying primitive/JSON props). This module is pure and server-safe —
// it never imports React or any 'use client' code — so it can run in the store,
// in scripts, and in the editor alike.
//
// parseBody() is the single migration funnel: it accepts our v2 format, the old
// v1 prose-only format, raw BlockNote documents (the previous editor's on-disk
// shape), and plain text / markdown, and always yields >= 1 block.

import type { FlatBlock } from '@/lib/collections/detect';
import { coerceLegend, type PageLegend } from './legend';
import { summarizeScene } from '@/lib/hexel/scene';

export const PROSE_TYPES = [
  'paragraph',
  'heading1',
  'heading2',
  'heading3',
  'bullet',
  'numbered',
  'quote',
  'code',
  'divider',
] as const;
export type ProseType = (typeof PROSE_TYPES)[number];

export const WIDGET_TYPES = [
  'labeled',
  'statusBadge',
  'badges',
  'tags',
  'refs',
  'collection',
  'studioPanel',
  'environmentStudio',
  'characterCard',
  'narrativeTimeline',
  'hero',
  'cards',
  'swatch',
  'hexelMap',
<<<<<<< HEAD
=======
  'imageBoard',
>>>>>>> 76bff3943e699ef52a571a3570c25714b3db95b8
  'childPages',
] as const;
export type WidgetType = (typeof WIDGET_TYPES)[number];

// ── Block layout ──────────────────────────────────────────────────────────
// Every block carries an optional layout describing how wide it is and how it
// aligns vertically when it sits in a row beside its neighbours. `width` is the
// fraction of the row it occupies; consecutive non-full blocks flow side by side
// (the editor wraps them with flex-wrap). `align` is the block's cross-axis
// position within that row. Both are controlled vocabularies — never inline
// literals — and the whole field is optional so a block with no layout reads as
// a full-width, top-aligned block (the historical default).
export const BLOCK_WIDTHS = ['full', 'twothirds', 'half', 'third'] as const;
export type BlockWidth = (typeof BLOCK_WIDTHS)[number];
export const BLOCK_ALIGNS = ['top', 'center', 'bottom'] as const;
export type BlockAlign = (typeof BLOCK_ALIGNS)[number];
export type BlockLayout = { width: BlockWidth; align: BlockAlign };

export const DEFAULT_LAYOUT: BlockLayout = { width: 'full', align: 'top' };
const WIDTH_SET: ReadonlySet<string> = new Set(BLOCK_WIDTHS);
const ALIGN_SET: ReadonlySet<string> = new Set(BLOCK_ALIGNS);

/** Coerce a loosely-stored layout value, or undefined when absent/default. A
 *  full-width, top-aligned layout is the implicit default and is never stored. */
export function coerceLayout(raw: unknown): BlockLayout | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const width = typeof r.width === 'string' && WIDTH_SET.has(r.width) ? (r.width as BlockWidth) : 'full';
  const align = typeof r.align === 'string' && ALIGN_SET.has(r.align) ? (r.align as BlockAlign) : 'top';
  if (width === 'full' && align === 'top') return undefined;
  return { width, align };
}

// A prose block may carry `color`: the id of a page-legend entry it's tagged
// with (see ./legend). It's a reference, not a color — the entry holds the actual
// color and its meaning — and is optional so an untagged block stores nothing.
export type ProseBlock = { id: string; type: ProseType; text: string; layout?: BlockLayout; color?: string };
export type WidgetBlock = { id: string; type: WidgetType; props: Record<string, unknown>; layout?: BlockLayout };
export type DocBlock = ProseBlock | WidgetBlock;

const PROSE_SET: ReadonlySet<string> = new Set(PROSE_TYPES);
const WIDGET_SET: ReadonlySet<string> = new Set(WIDGET_TYPES);

export function isProseType(type: string): type is ProseType {
  return PROSE_SET.has(type);
}
export function isWidgetType(type: string): type is WidgetType {
  return WIDGET_SET.has(type);
}
export function isWidgetBlock(block: DocBlock): block is WidgetBlock {
  return WIDGET_SET.has(block.type);
}

/** Whether a block is an inline child-pages widget (see `bodyHasChildPages`). */
export function isChildPagesWidget(block: DocBlock): block is WidgetBlock {
  return isWidgetBlock(block) && block.type === 'childPages';
}

/** Whether a stored body already carries an inline child-pages widget. DocView
 *  uses this to suppress its automatic bottom child-page list so the same
 *  children aren't listed twice on a page that has moved them into the body. */
export function bodyHasChildPages(body: string): boolean {
  return parseBody(body).some(isChildPagesWidget);
}

export type ListType = 'bullet' | 'numbered';
/** Whether a prose type is one of the two list kinds (bullet / numbered). */
export function isListType(type: string): type is ListType {
  return type === 'bullet' || type === 'numbered';
}

const SERIAL_VERSION = 2;
// The page legend (./legend) rides alongside the blocks in the same body string,
// so it persists with the page and round-trips through the one body funnel — no
// schema change to DocNode (body stays an opaque string). It's optional: a page
// with no legend serializes none.
type SerializedBody = { v: number; blocks: unknown[]; legend?: unknown };

export function makeBlockId(): string {
  return `b-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function emptyProse(type: ProseType = 'paragraph', text = ''): ProseBlock {
  return { id: makeBlockId(), type, text };
}

// ── Inline-content flattening (for migrating BlockNote documents) ───────────

/** BlockNote stores inline content as an array of text/link nodes; flatten it. */
function inlineText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((node) => {
      if (typeof node === 'string') return node;
      if (node && typeof node === 'object') {
        const n = node as Record<string, unknown>;
        if (n.type === 'link') return inlineText(n.content);
        return typeof n.text === 'string' ? n.text : '';
      }
      return '';
    })
    .join('');
}

/** BlockNote table content → rows of cell text. */
function tableRows(content: unknown): string[][] {
  if (!content || typeof content !== 'object') return [];
  const rows = (content as { rows?: unknown }).rows;
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => {
    const cells = (row as { cells?: unknown }).cells;
    if (!Array.isArray(cells)) return [];
    return cells.map((cell) => {
      if (Array.isArray(cell)) return inlineText(cell);
      if (cell && typeof cell === 'object' && 'content' in cell) {
        return inlineText((cell as { content: unknown }).content);
      }
      return inlineText(cell);
    });
  });
}

// ── Block coercion ──────────────────────────────────────────────────────────

/** Coerce one of *our own* serialized blocks (v1 or v2). Unknown types drop. */
function coerceOwnBlock(raw: unknown): DocBlock | null {
  if (!raw || typeof raw !== 'object') return null;
  const b = raw as Record<string, unknown>;
  const type = typeof b.type === 'string' ? b.type : '';
  const id = typeof b.id === 'string' && b.id ? b.id : makeBlockId();
  const layout = coerceLayout(b.layout);
  if (isWidgetType(type)) {
    const props = b.props && typeof b.props === 'object' ? (b.props as Record<string, unknown>) : {};
    return layout ? { id, type, props, layout } : { id, type, props };
  }
  if (isProseType(type)) {
    const text = typeof b.text === 'string' ? b.text : '';
    const block: ProseBlock = { id, type, text };
    if (layout) block.layout = layout;
    if (typeof b.color === 'string' && b.color) block.color = b.color;
    return block;
  }
  return null;
}

/** Migrate one BlockNote document block to a DocBlock. Unknown types drop. */
function migrateBlockNoteBlock(raw: unknown): DocBlock | null {
  if (!raw || typeof raw !== 'object') return null;
  const b = raw as Record<string, unknown>;
  const type = typeof b.type === 'string' ? b.type : '';
  const id = typeof b.id === 'string' && b.id ? b.id : makeBlockId();

  // Widget blocks: carry props straight across (drop BlockNote's `children`).
  if (isWidgetType(type)) {
    const props = b.props && typeof b.props === 'object' ? { ...(b.props as Record<string, unknown>) } : {};
    const layout = coerceLayout(b.layout);
    return layout ? { id, type, props, layout } : { id, type, props };
  }

  // Prose blocks: map BlockNote's type to ours and flatten inline content.
  const text = inlineText(b.content);
  switch (type) {
    case 'heading': {
      const level = Number((b.props as Record<string, unknown> | undefined)?.level) || 1;
      const h: ProseType = level >= 3 ? 'heading3' : level === 2 ? 'heading2' : 'heading1';
      return { id, type: h, text };
    }
    case 'bulletListItem':
    case 'checkListItem':
      return { id, type: 'bullet', text };
    case 'numberedListItem':
      return { id, type: 'numbered', text };
    case 'quote':
      return { id, type: 'quote', text };
    case 'codeBlock':
      return { id, type: 'code', text };
    case 'paragraph':
      return { id, type: 'paragraph', text };
    case 'table': {
      // No table block in our model — flatten to a tab-separated code block so
      // the data survives and stays editable.
      const rows = tableRows(b.content);
      return { id, type: 'code', text: rows.map((r) => r.join('\t')).join('\n') };
    }
    default:
      return null;
  }
}

function isSerializedBody(value: unknown): value is SerializedBody {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as Record<string, unknown>).v === 'number' &&
    Array.isArray((value as Record<string, unknown>).blocks)
  );
}

// Leading list markers (`- `, `* `, `1. `) — stripped when a line becomes a list
// item so the stored text never carries its own marker (the editor renders it).
const BULLET_MARKER = /^[-*]\s+/;
const NUMBERED_MARKER = /^\d+\.\s+/;

/** Turn a plain-text/markdown line into a prose block. */
function lineToBlock(line: string): ProseBlock {
  const rules: Array<[RegExp, ProseType]> = [
    [/^###\s+/, 'heading3'],
    [/^##\s+/, 'heading2'],
    [/^#\s+/, 'heading1'],
    [BULLET_MARKER, 'bullet'],
    [NUMBERED_MARKER, 'numbered'],
    [/^>\s+/, 'quote'],
  ];
  for (const [re, type] of rules) {
    if (re.test(line)) return emptyProse(type, line.replace(re, ''));
  }
  return emptyProse('paragraph', line);
}

/**
 * Split a pasted/typed blob into one list-item text per line: trims trailing
 * whitespace, drops blank lines, and strips any leading list marker (`- `, `* `,
 * `1. `) so the stored item text is marker-free (the editor draws the marker).
 * Always returns >= 1 entry (a single empty string for an all-blank blob) so the
 * caller can map it to >= 1 block.
 */
export function splitTextToListItems(text: string): string[] {
  const items = text
    .split('\n')
    .map((line) => line.replace(/\s+$/, '').replace(BULLET_MARKER, '').replace(NUMBERED_MARKER, ''))
    .filter((line) => line.length > 0);
  return items.length ? items : [''];
}

/**
 * Serialize a contiguous run of list blocks to markdown for the clipboard.
 * Numbered items are re-counted from 1; non-list blocks (should not appear in a
 * list selection) fall back to their raw text.
 */
export function listRangeToMarkdown(blocks: ProseBlock[]): string {
  let n = 0;
  return blocks
    .map((b) => {
      if (b.type === 'numbered') {
        n += 1;
        return `${n}. ${b.text}`;
      }
      n = 0;
      if (b.type === 'bullet') return `- ${b.text}`;
      return b.text;
    })
    .join('\n');
}

/** Parse a stored body string into editable blocks. Always returns >= 1 block. */
export function parseBody(body: string): DocBlock[] {
  const trimmed = body.trim();
  if (!trimmed) return [emptyProse()];

  try {
    const parsed: unknown = JSON.parse(trimmed);
    // Our own serialized body (v1 prose-only, or v2 prose + widgets).
    if (isSerializedBody(parsed)) {
      const blocks = parsed.blocks.map(coerceOwnBlock).filter((b): b is DocBlock => b !== null);
      return blocks.length ? blocks : [emptyProse()];
    }
    // A raw array → a BlockNote document, or a preset's widget-block array.
    if (Array.isArray(parsed)) {
      const blocks = parsed.map(migrateBlockNoteBlock).filter((b): b is DocBlock => b !== null);
      return blocks.length ? blocks : [emptyProse()];
    }
  } catch {
    // Not JSON — fall through to plain-text/markdown import.
  }

  const blocks = body
    .split('\n')
    .map((line) => line.replace(/\s+$/, ''))
    .filter((line) => line.length > 0)
    .map(lineToBlock);
  return blocks.length ? blocks : [emptyProse()];
}

/** Serialize blocks (and the optional page legend) back to the body string (v2). */
export function serializeBlocks(blocks: DocBlock[], legend: PageLegend = []): string {
  const out: SerializedBody = { v: SERIAL_VERSION, blocks };
  if (legend.length) out.legend = legend;
  return JSON.stringify(out);
}

/** Extract the page legend from a stored body string ([] when absent/legacy). */
export function parseLegend(body: string): PageLegend {
  const trimmed = body.trim();
  if (!trimmed) return [];
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (isSerializedBody(parsed)) return coerceLegend((parsed as SerializedBody).legend);
  } catch {
    // Not JSON (plain text / markdown body) — no legend.
  }
  return [];
}

/** Pull searchable text out of the rich widgets (hero/cards/swatch), whose
 *  human-readable content lives in props rather than `text`. Other widgets carry
 *  no prose worth indexing here. Best-effort: bad JSON simply contributes nothing. */
function widgetPlainText(block: WidgetBlock): string {
  const parts: string[] = [];
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const parseArr = (raw: unknown): Record<string, unknown>[] => {
    if (typeof raw !== 'string') return [];
    try {
      const v: unknown = JSON.parse(raw);
      return Array.isArray(v) ? (v.filter((x) => x && typeof x === 'object') as Record<string, unknown>[]) : [];
    } catch {
      return [];
    }
  };
  if (block.type === 'hero') {
    parts.push(str(block.props.eyebrow), str(block.props.title), str(block.props.subtitle));
  } else if (block.type === 'cards') {
    for (const c of parseArr(block.props.cardsJson)) parts.push(str(c.eyebrow), str(c.title), str(c.body));
  } else if (block.type === 'swatch') {
    for (const s of parseArr(block.props.swatchesJson)) parts.push(str(s.name), str(s.hex));
  } else if (block.type === 'hexelMap') {
    // The map's meaning is inferred from its paint — surface the readable digest
    // (spaces, features, relations) so search and the agent's `format:'text'` see
    // a place, not an opaque blob.
    parts.push(summarizeScene(block.props.dataJson));
  } else if (block.type === 'childPages') {
    parts.push(str(block.props.label));
    if (typeof block.props.titlesJson === 'string') {
      try {
        const overrides: unknown = JSON.parse(block.props.titlesJson);
        if (overrides && typeof overrides === 'object') {
          for (const v of Object.values(overrides as Record<string, unknown>)) parts.push(str(v));
        }
      } catch {
        // ignore malformed overrides
      }
    }
  }
  return parts.filter(Boolean).join(' ');
}

/** Render blocks to plain text (used for previews / search). */
export function blocksToPlainText(blocks: DocBlock[]): string {
  const out: string[] = [];
  for (const block of blocks) {
    if (isWidgetBlock(block)) {
      const text = widgetPlainText(block);
      if (text) out.push(text);
      continue;
    }
    if (block.type === 'divider') continue;
    out.push(block.text);
  }
  return out.join('\n');
}

/**
 * Flatten blocks into the BlockNote-agnostic FlatBlock[] that the pure
 * collection detector consumes. List types are re-expanded to the names
 * detect.ts expects (`bulletListItem`/`numberedListItem`); widget blocks become
 * empty text so they never read as collection candidates.
 */
export function flattenToFlatBlocks(blocks: DocBlock[]): FlatBlock[] {
  return blocks.map((block) => {
    if (isWidgetBlock(block)) return { id: block.id, type: block.type, text: '' };
    const type =
      block.type === 'bullet'
        ? 'bulletListItem'
        : block.type === 'numbered'
          ? 'numberedListItem'
          : block.type;
    return { id: block.id, type, text: block.text };
  });
}
