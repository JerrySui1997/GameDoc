'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
} from 'react';
import * as Y from 'yjs';
import {
  emptyProse,
  flattenToFlatBlocks,
  isChildPagesWidget,
  isListType,
  isWidgetBlock,
  listRangeToMarkdown,
  makeBlockId,
  splitTextToListItems,
  BLOCK_WIDTHS,
  BLOCK_ALIGNS,
  DEFAULT_LAYOUT,
  type BlockAlign,
  type BlockLayout,
  type BlockWidth,
  type DocBlock,
  type ProseBlock,
  type ProseType,
  type WidgetType,
} from '@/lib/docs/blocks';
import {
  getBlocks,
  getMeta,
  getOrder,
  LOCAL_ORIGIN,
  readDocBlocks,
  readLegend,
  ySetBlockText,
  ySetBlockColor,
  ySetWidgetProps,
  ySetBlockLayout,
  ySetLegend,
  yReconcileBlocks,
} from '@/lib/docs/ydoc';
import {
  LEGEND_COLORS,
  LEGEND_STYLE,
  makeLegendId,
  type LegendColor,
  type LegendEntry,
  type PageLegend,
} from '@/lib/docs/legend';
import { detectCandidates, type CollectionCandidate } from '@/lib/collections/detect';
import { findMentionQuery, splitMentions, type MentionSegment } from '@/lib/docs/mentions';
import { buildMentionIndex, type MentionTarget } from '@/lib/docs/mentionTarget';
import { CollectionTagOverlay } from '@/components/collections/CollectionTagOverlay';
import { useDocs } from './DocsProvider';
import { WidgetHost, WIDGET_LIST, makeWidgetBlock } from './widgets/registry';
import { WidgetShelf } from './WidgetShelf';
import { PROSE_CATALOG, WIDGET_CATALOG } from './catalog';
import type { Awareness } from './useYDoc';
import type { Identity } from './identity';
import { RemoteBlockBadges, RemoteBlockAccent, userField, type RemoteUser } from './Presence';
import { MentionChip, MentionPanel, inlineMentionClass } from './Mentions';
import type { ReactNode } from 'react';

// ── The page editor ──────────────────────────────────────────────────────────
// A homegrown block editor backed by a Yjs document (one room per page). A
// document is a flat list of DocBlocks derived from the shared Y structures;
// every local edit is routed back into Y so teammates' browsers converge. Prose
// blocks are plain-text <textarea>s (no contentEditable) whose text lives in a
// Y.Text — so two people typing in one paragraph merge character-by-character —
// and widget blocks are self-contained React islands keyed by per-prop Y.Map.

// A view-only trailing paragraph so a page that ends in a widget always has
// somewhere to type. It is NOT in the Y doc; it materializes into a real block
// only when the user actually types in it (which can only happen after the room
// has seeded, so it can never race the server's seed).
const TRAILER_ID = '__trailer';
// Sentinel drop target for the trailing zone that appears while dragging — drop
// here to place the block on its own full-width line at the very end.
const END_DROP_ID = '__end';

const MARKDOWN_MARKERS: Record<string, ProseType> = {
  '#': 'heading1',
  '##': 'heading2',
  '###': 'heading3',
  '-': 'bullet',
  '*': 'bullet',
  '>': 'quote',
  '```': 'code',
};

function markerType(left: string): ProseType | null {
  if (left in MARKDOWN_MARKERS) return MARKDOWN_MARKERS[left];
  if (/^\d+\.$/.test(left)) return 'numbered';
  return null;
}

// The slash-menu catalogue: block types first, then widgets.
const PROSE_MENU: { type: ProseType; title: string; terms: string[] }[] = [
  { type: 'paragraph', title: 'Text', terms: ['text', 'paragraph', 'p', 'body'] },
  { type: 'heading1', title: 'Heading 1', terms: ['heading', 'h1', 'title'] },
  { type: 'heading2', title: 'Heading 2', terms: ['heading', 'h2', 'subtitle'] },
  { type: 'heading3', title: 'Heading 3', terms: ['heading', 'h3'] },
  { type: 'bullet', title: 'Bulleted list', terms: ['bullet', 'list', 'unordered', 'ul'] },
  { type: 'numbered', title: 'Numbered list', terms: ['numbered', 'list', 'ordered', 'ol'] },
  { type: 'quote', title: 'Quote', terms: ['quote', 'blockquote', 'callout'] },
  { type: 'code', title: 'Code', terms: ['code', 'pre', 'mono'] },
  { type: 'divider', title: 'Divider', terms: ['divider', 'hr', 'rule', 'separator', 'line'] },
];

type SlashItem = { key: string; title: string; subtitle: string; blurb: string; icon: ReactNode; preview: ReactNode; run: () => void };

const PROSE_CLASS: Record<ProseType, string> = {
  paragraph: 'text-[15px] leading-relaxed text-ink',
  heading1: 'text-3xl font-bold tracking-tight text-ink',
  heading2: 'text-2xl font-bold tracking-tight text-ink',
  heading3: 'text-xl font-semibold text-ink',
  bullet: 'text-[15px] leading-relaxed text-ink',
  numbered: 'text-[15px] leading-relaxed text-ink',
  quote: 'text-lg leading-relaxed font-medium italic text-muted',
  code: 'font-mono text-sm leading-relaxed text-ink bg-canvas rounded-md px-3 py-2',
  divider: '',
};

// Literal Tailwind width classes per layout fraction (Tailwind v4 only emits
// classes it sees in source, so these must be literal — never `w-[${x}]`). Each
// fraction subtracts the row gap (0.75rem) so any combination of widths fits one
// flex-wrap row beside its neighbours; below `sm` everything stacks full-width.
const WIDTH_CLASS: Record<BlockWidth, string> = {
  full: 'w-full',
  twothirds: 'w-full sm:w-[calc(66.667%-0.75rem)]',
  half: 'w-full sm:w-[calc(50%-0.75rem)]',
  third: 'w-full sm:w-[calc(33.333%-0.75rem)]',
};
const ALIGN_SELF: Record<BlockAlign, string> = {
  top: 'self-start',
  center: 'self-center',
  bottom: 'self-end',
};
const WIDTH_GLYPH: Record<BlockWidth, string> = { full: 'Full', twothirds: '⅔', half: '½', third: '⅓' };
const ALIGN_GLYPH: Record<BlockAlign, string> = { top: '⤒', center: '≡', bottom: '⤓' };

// ── Column model ──────────────────────────────────────────────────────────────
// Columns aren't a stored structure — they emerge from width: consecutive
// non-full blocks flow side by side via flex-wrap. To make dragging *form*
// columns (drop a block beside another and they share the row, auto-balanced to
// equal fractions), we replicate that wrap here so we can reason about which
// blocks share a visual row and re-divide a row evenly when it gains/loses a member.

/** Where a dragged block lands relative to the block it's dropped on. */
type DropPos = 'left' | 'right' | 'above' | 'below';

const WIDTH_FRACTION: Record<BlockWidth, number> = { full: 1, twothirds: 2 / 3, half: 1 / 2, third: 1 / 3 };

/** The even column width for an N-wide row (capped at thirds — 3 columns max). */
function equalWidth(n: number): BlockWidth {
  return n <= 1 ? 'full' : n === 2 ? 'half' : 'third';
}

/** Group blocks into visual rows, replicating the editor's flex-wrap: a block
 *  joins the current row while its fraction still fits, else it starts a new one. */
function computeRows(blocks: DocBlock[]): DocBlock[][] {
  const rows: DocBlock[][] = [];
  let cur: DocBlock[] = [];
  let used = 0;
  for (const b of blocks) {
    const f = WIDTH_FRACTION[b.layout?.width ?? 'full'];
    if (cur.length && used + f <= 1.01) { cur.push(b); used += f; }
    else { if (cur.length) rows.push(cur); cur = [b]; used = f; }
  }
  if (cur.length) rows.push(cur);
  return rows;
}

/** Set a block's width, dropping the layout entirely when it returns to the
 *  full-width/top default so the canonical form stays clean. */
function withWidth(b: DocBlock, width: BlockWidth): DocBlock {
  const align = b.layout?.align ?? 'top';
  if (width === 'full' && align === 'top') {
    if (!b.layout) return b;
    const next = { ...b };
    delete next.layout;
    return next;
  }
  return { ...b, layout: { width, align } };
}

export function PageEditor({
  doc,
  docId,
  awareness,
  identity,
  onChildPagesWidgetChange,
}: {
  /** The page's live Yjs document (already connected via useYDoc). */
  doc: Y.Doc;
  /** When set, auto-detected collection candidates show inline naming tags. */
  docId?: string;
  /** The room's awareness channel, for publishing/observing live cursors. */
  awareness?: Awareness | null;
  /** This client's display identity, published to teammates' presence. */
  identity?: Identity | null;
  /** Fires whenever the live body's inline childPages-widget membership changes,
   *  so the page shell can suppress its own fallback bottom child-page list
   *  without waiting for a reload. */
  onChildPagesWidgetChange?: (has: boolean) => void;
}) {
  // Blocks are *derived* from Y — the single source of truth. Any local or remote
  // change to the order array or to a block's type/text/props re-runs this sync.
  const [blocks, setBlocks] = useState<DocBlock[]>(() => readDocBlocks(doc));
  const blocksRef = useRef<DocBlock[]>(blocks);
  blocksRef.current = blocks;

  useEffect(() => {
    const order = getOrder(doc);
    const yBlocks = getBlocks(doc);
    const sync = () => setBlocks(readDocBlocks(doc));
    order.observe(sync);
    yBlocks.observeDeep(sync);
    sync();
    return () => {
      order.unobserve(sync);
      yBlocks.unobserveDeep(sync);
    };
  }, [doc]);

  // The page color legend, derived from the shared meta map (the single source of
  // truth). Edited via the legend bar at the top of the page; observed here so a
  // teammate's legend change re-tints tagged blocks live.
  const [legend, setLegend] = useState<PageLegend>(() => readLegend(doc));
  useEffect(() => {
    const meta = getMeta(doc);
    const sync = () => setLegend(readLegend(doc));
    meta.observe(sync);
    sync();
    return () => meta.unobserve(sync);
  }, [doc]);
  const legendById = useMemo(() => new Map(legend.map((e) => [e.id, e])), [legend]);

  // The room is "ready" once the server has seeded it. seedYDoc always yields at
  // least one block (even an empty page seeds a paragraph), so a non-empty doc is
  // a reliable "seed has arrived" signal — and gating edits on it means the
  // client can never create content into an un-seeded doc and block the seed.
  const ready = blocks.length > 0;

  // Tell the page shell live whether the body already carries an inline
  // childPages widget, so it can hide its own fallback bottom list the moment
  // one is inserted (or show it again the moment the last one is removed) —
  // without that shell needing to re-derive it from a stale `doc.body` snapshot.
  const hasChildPagesWidget = useMemo(() => blocks.some(isChildPagesWidget), [blocks]);
  useEffect(() => {
    onChildPagesWidgetChange?.(hasChildPagesWidget);
  }, [hasChildPagesWidget, onChildPagesWidgetChange]);

  const [slash, setSlash] = useState<{ id: string; index: number } | null>(null);

  // ── @mention autocomplete ──
  // The full docs list (for the page picker) and the active `@query` the caret
  // sits in: which block, where the token starts, the typed query, and the
  // highlighted item. Independent of the slash menu (that keys off a leading '/').
  const { docs } = useDocs();
  const [mention, setMention] = useState<{ id: string; start: number; query: string; index: number } | null>(null);

  // A resolved view of every page a mention can point at (title + kind + excerpt),
  // rebuilt only when the docs snapshot changes — never on a keystroke (live prose
  // flows through Yjs, not this snapshot). Chips look their target up here to color
  // themselves by kind and preview it; the slide-in panel reads the same entry.
  const mentionTargets = useMemo(() => buildMentionIndex(docs), [docs]);
  // The mention whose detail panel is currently sliding in (null = closed).
  const [openMentionId, setOpenMentionId] = useState<string | null>(null);

  // Whole-block multi-selection (Notion-style): the inclusive contiguous range of
  // blocks between `anchorId` and `focusId` in render order. Native text selection
  // can't cross two <textarea>s, so this powers copy/cut/delete across list items.
  const [selection, setSelection] = useState<{ anchorId: string; focusId: string } | null>(null);

  // ── Active block (drives the bottom action shelf) ──
  // The single block the writer is currently working with — set by clicking into
  // or focusing a block, cleared by closing the shelf or moving to the trailer.
  // The fixed bottom shelf reads this to surface that block's reorder / width /
  // align / colour / delete controls, replacing the old per-block hover gutter.
  const [activeId, setActiveId] = useState<string | null>(null);

  // ── Drag-to-form-columns ──
  // A block is dragged by the small grip on the active/hovered block; every block
  // is a drop target. `dropAt` is the block under the pointer and which side the
  // dragged block would join. Dropping left/right merges into that block's row
  // (auto-balanced to equal fractions); above/below stacks it on its own line.
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<{ id: string; pos: DropPos } | null>(null);

  const wrapRef = useRef<HTMLDivElement>(null);
  const taRefs = useRef(new Map<string, HTMLTextAreaElement>());
  const focusReq = useRef<{ id: string; caret: number } | null>(null);
  const lastFocusedId = useRef<string | null>(null);

  // ── Undo/redo via Yjs, scoped to this client's own edits ──
  // Tracking only LOCAL_ORIGIN means Ctrl+Z reverts *my* changes, never a
  // teammate's — the collaborative-correct behavior. The manager registers its
  // afterTransaction handler in its constructor, so its whole lifecycle (create +
  // destroy) must live in one effect: a useMemo + separate destroy-effect would,
  // under React StrictMode, be destroyed on the simulated unmount and never
  // re-created — leaving a live-but-deaf manager that captures nothing.
  const [undoMgr, setUndoMgr] = useState<Y.UndoManager | null>(null);
  const [, forceTick] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    const um = new Y.UndoManager([getOrder(doc), getBlocks(doc), getMeta(doc)], {
      trackedOrigins: new Set([LOCAL_ORIGIN]),
    });
    const h = () => forceTick();
    um.on('stack-item-added', h);
    um.on('stack-item-popped', h);
    um.on('stack-cleared', h);
    setUndoMgr(um);
    return () => {
      um.off('stack-item-added', h);
      um.off('stack-item-popped', h);
      um.off('stack-cleared', h);
      um.destroy();
    };
  }, [doc]);

  const registerRef = useCallback((id: string, el: HTMLTextAreaElement | null) => {
    if (el) taRefs.current.set(id, el);
    else taRefs.current.delete(id);
  }, []);

  // ── Presence: publish my identity + cursor, observe teammates' ──
  useEffect(() => {
    if (!awareness) return;
    awareness.setLocalStateField('user', userField(identity ?? null));
  }, [awareness, identity]);

  useEffect(() => {
    if (!awareness) return;
    return () => awareness.setLocalStateField('cursor', null); // clear on unmount
  }, [awareness]);

  const publishCursor = useCallback(
    (blockId: string, start: number, end: number) => {
      awareness?.setLocalStateField('cursor', { blockId, start, end });
    },
    [awareness],
  );

  // Remote cursors, grouped by the block each teammate is currently editing.
  const [remoteByBlock, setRemoteByBlock] = useState<Map<string, RemoteUser[]>>(new Map());
  useEffect(() => {
    if (!awareness) return;
    const update = () => {
      const map = new Map<string, RemoteUser[]>();
      awareness.getStates().forEach((state, clientId) => {
        if (clientId === awareness.clientID) return;
        const user = (state as { user?: { name?: string; color?: string } }).user;
        const cursor = (state as { cursor?: { blockId: string; start: number; end: number } }).cursor;
        if (!user || !cursor?.blockId) return;
        const entry: RemoteUser = {
          clientId,
          name: user.name || 'Anonymous',
          color: user.color || '#64748b',
          cursor,
        };
        const arr = map.get(cursor.blockId);
        if (arr) arr.push(entry);
        else map.set(cursor.blockId, [entry]);
      });
      setRemoteByBlock(map);
    };
    awareness.on('change', update);
    update();
    return () => awareness.off('change', update);
  }, [awareness]);

  /** The one structural funnel: reconcile the Y doc to match `next`. Block state
   *  re-renders via the Y observer above. */
  const commit = useCallback(
    (next: DocBlock[]) => {
      yReconcileBlocks(doc, next);
    },
    [doc],
  );

  const undo = useCallback(() => { undoMgr?.undo(); setSlash(null); setMention(null); }, [undoMgr]);
  const redo = useCallback(() => { undoMgr?.redo(); setSlash(null); setMention(null); }, [undoMgr]);

  function focusBlock(id: string, caret: number) {
    const el = taRefs.current.get(id);
    if (el) {
      el.focus();
      const c = Math.min(caret, el.value.length);
      el.setSelectionRange(c, c);
    }
  }

  // Apply a requested focus after the block list changes (split/merge/insert).
  useLayoutEffect(() => {
    const req = focusReq.current;
    if (!req) return;
    focusReq.current = null;
    focusBlock(req.id, req.caret);
  }, [blocks]); // eslint-disable-line react-hooks/exhaustive-deps

  // Render list = real blocks, plus the synthetic trailer when the page would
  // otherwise have nowhere to type (ends in a widget, or is somehow empty).
  const displayBlocks = useMemo<DocBlock[]>(() => {
    if (blocks.length === 0) return blocks; // not ready — handled below
    const last = blocks[blocks.length - 1];
    if (isWidgetBlock(last)) return [...blocks, { id: TRAILER_ID, type: 'paragraph', text: '' } as ProseBlock];
    return blocks;
  }, [blocks]);

  const candidates: CollectionCandidate[] = useMemo(
    () => (docId ? detectCandidates(flattenToFlatBlocks(blocks)) : []),
    [blocks, docId],
  );

  // Numbered-list ordinals (reset on any non-numbered block).
  const ordinals = useMemo(() => {
    const map = new Map<string, number>();
    let run = 0;
    for (const b of displayBlocks) {
      if (!isWidgetBlock(b) && b.type === 'numbered') {
        run += 1;
        map.set(b.id, run);
      } else {
        run = 0;
      }
    }
    return map;
  }, [displayBlocks]);

  // List-run membership: for each block in a contiguous run of list items (bullet
  // or numbered, mixed runs allowed), whether it is the first / last of its run.
  // Drives tight inter-item spacing so a run reads as one list. A lone list item
  // is a run of length 1 (first && last).
  const listInfo = useMemo(() => {
    const map = new Map<string, { first: boolean; last: boolean }>();
    for (let i = 0; i < displayBlocks.length; i++) {
      const b = displayBlocks[i];
      if (isWidgetBlock(b) || !isListType(b.type)) continue;
      const prev = displayBlocks[i - 1];
      const next = displayBlocks[i + 1];
      const first = !prev || isWidgetBlock(prev) || !isListType(prev.type);
      const last = !next || isWidgetBlock(next) || !isListType(next.type);
      map.set(b.id, { first, last });
    }
    return map;
  }, [displayBlocks]);

  // The set of block ids covered by the current whole-block selection, resolved
  // against render order. Empty when there's no selection or its endpoints have
  // gone stale (e.g. a block was deleted underneath it).
  const selectedIds = useMemo(() => {
    const set = new Set<string>();
    if (!selection) return set;
    const ids = displayBlocks.map((b) => b.id);
    const a = ids.indexOf(selection.anchorId);
    const f = ids.indexOf(selection.focusId);
    if (a < 0 || f < 0) return set;
    for (let i = Math.min(a, f); i <= Math.max(a, f); i++) set.add(ids[i]);
    return set;
  }, [selection, displayBlocks]);

  // ── Slash menu items for the active block ──
  const slashItems: SlashItem[] = useMemo(() => {
    if (!slash) return [];
    const block = displayBlocks.find((b) => b.id === slash.id);
    if (!block || isWidgetBlock(block)) return [];
    const q = (block.text.startsWith('/') ? block.text.slice(1) : '').toLowerCase().trim();
    const items: SlashItem[] = [];
    for (const p of PROSE_MENU) {
      if (!q || p.title.toLowerCase().includes(q) || p.terms.some((t) => t.includes(q))) {
        const meta = PROSE_CATALOG[p.type];
        items.push({ key: `p:${p.type}`, title: p.title, subtitle: 'Block', blurb: meta.blurb, icon: meta.icon, preview: meta.preview, run: () => transformProse(slash.id, p.type) });
      }
    }
    for (const w of WIDGET_LIST) {
      if (!q || w.title.toLowerCase().includes(q) || w.aliases.some((a) => a.includes(q))) {
        const meta = WIDGET_CATALOG[w.type];
        items.push({ key: `w:${w.type}`, title: w.title, subtitle: 'Widget', blurb: meta.blurb, icon: meta.icon, preview: meta.preview, run: () => convertToWidget(slash.id, w.type) });
      }
    }
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slash, displayBlocks]);

  const slashIndex = slash ? Math.min(slash.index, Math.max(0, slashItems.length - 1)) : 0;

  // ── @mention candidates for the active query ──
  // Filtered by the typed text against title + id (the slug that gets inserted),
  // self excluded, best matches first, capped to a short list.
  const mentionItems = useMemo(() => {
    if (!mention) return [];
    const q = mention.query.toLowerCase();
    const scored = docs
      .filter((d) => d.id !== docId)
      .map((d) => ({ id: d.id, title: d.title }))
      .filter((d) => !q || `${d.title} ${d.id}`.toLowerCase().includes(q));
    scored.sort((a, b) => mentionRank(b, q) - mentionRank(a, q));
    return scored.slice(0, 8);
  }, [mention, docs, docId]);

  const mentionIndex = mention ? Math.min(mention.index, Math.max(0, mentionItems.length - 1)) : 0;

  /** Replace the active `@query` token in a block with `@<id> ` and re-place the
   *  caret after it. Routed through the same Y text path as normal typing. */
  function pickMention(blockId: string, start: number, pageId: string) {
    const block = blocksRef.current.find((b) => b.id === blockId);
    if (!block || isWidgetBlock(block)) return;
    const el = taRefs.current.get(blockId);
    const caret = el ? el.selectionStart : block.text.length;
    const token = `@${pageId} `;
    const before = block.text.slice(0, start);
    const newText = before + token + block.text.slice(caret);
    focusReq.current = { id: blockId, caret: before.length + token.length };
    setMention(null);
    ySetBlockText(doc, blockId, newText);
  }

  // ── Trailer materialization ──
  /** Turn the synthetic trailer into a real prose block carrying `text`. */
  function materializeTrailer(text: string, caret: number) {
    const nb: ProseBlock = { id: makeBlockId(), type: 'paragraph', text };
    focusReq.current = { id: nb.id, caret };
    commit([...blocksRef.current, nb]);
    if (text.startsWith('/')) setSlash({ id: nb.id, index: 0 });
    return nb.id;
  }

  // ── Block transforms ──

  function transformProse(id: string, type: ProseType) {
    if (type === 'divider') {
      const para = emptyProse();
      focusReq.current = { id: para.id, caret: 0 };
      const next: DocBlock[] = [];
      for (const b of blocksRef.current) {
        if (b.id === id) {
          next.push({ id, type: 'divider', text: '' });
          next.push(para);
        } else next.push(b);
      }
      commit(next);
      setSlash(null);
      return;
    }
    focusReq.current = { id, caret: 0 };
    commit(blocksRef.current.map((b) => (b.id === id && !isWidgetBlock(b) ? { ...b, type, text: '' } : b)));
    setSlash(null);
  }

  function convertToWidget(id: string, type: WidgetType) {
    const real = blocksRef.current;
    const wasLast = real[real.length - 1]?.id === id;
    let next: DocBlock[] = real.map((b) => (b.id === id ? makeWidgetBlock(type, id) : b));
    if (wasLast) next = [...next, emptyProse()];
    commit(next);
    setSlash(null);
  }

  function onTextChange(id: string, value: string) {
    if (id === TRAILER_ID) {
      materializeTrailer(value, value.length);
      return;
    }
    setSelection(null);
    const block = blocksRef.current.find((b) => b.id === id);
    const isPara = !!block && !isWidgetBlock(block) && block.type === 'paragraph';
    if (isPara && value.startsWith('/')) setSlash((s) => (s && s.id === id ? s : { id, index: 0 }));
    else setSlash((s) => (s && s.id === id ? null : s));
    ySetBlockText(doc, id, value);
    // Detect an active @mention token at the caret (any prose block).
    const caret = taRefs.current.get(id)?.selectionStart ?? value.length;
    const mq = findMentionQuery(value, caret);
    setMention(mq ? { id, start: mq.start, query: mq.query, index: 0 } : null);
  }

  function setWidgetProps(id: string, patch: Record<string, unknown>) {
    ySetWidgetProps(doc, id, patch);
  }

  function setBlockLayout(id: string, patch: Partial<BlockLayout>) {
    ySetBlockLayout(doc, id, patch);
  }

  function setBlockColor(id: string, color: string | null) {
    ySetBlockColor(doc, id, color);
  }

  // ── Page color legend edits ──
  /** Append a fresh legend entry, defaulting to the first colour not yet in use. */
  function addLegendEntry() {
    const used = new Set(legend.map((e) => e.color));
    const color = LEGEND_COLORS.find((c) => !used.has(c)) ?? 'slate';
    ySetLegend(doc, [...legend, { id: makeLegendId(), color, label: '' }]);
  }
  function updateLegendEntry(id: string, patch: Partial<Omit<LegendEntry, 'id'>>) {
    ySetLegend(doc, legend.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }
  function removeLegendEntry(id: string) {
    ySetLegend(doc, legend.filter((e) => e.id !== id));
  }

  function deleteBlock(id: string) {
    const blocks = blocksRef.current;
    // Re-balance the row the block leaves behind (3 columns → 2 become ½, etc.).
    const rowRest = (computeRows(blocks).find((r) => r.some((b) => b.id === id)) ?? []).filter((b) => b.id !== id);
    const w = equalWidth(rowRest.length);
    const widen = new Set(rowRest.map((b) => b.id));
    const next = blocks.filter((b) => b.id !== id).map((b) => (widen.has(b.id) ? withWidth(b, w) : b));
    commit(next);
    setSlash((s) => (s && s.id === id ? null : s));
    setActiveId((a) => (a === id ? null : a));
  }

  /** Move a block one slot earlier (-1) or later (+1) in the document order. */
  function moveBlock(id: string, dir: -1 | 1) {
    const real = [...blocksRef.current];
    const i = real.findIndex((b) => b.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= real.length) return;
    [real[i], real[j]] = [real[j], real[i]];
    commit(real);
  }

  function endDrag() {
    setDragId(null);
    setDropAt(null);
  }

  function onGripDragStart(e: DragEvent<HTMLElement>, id: string) {
    setDragId(id);
    setSelection(null);
    setSlash(null);
    setMention(null);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
    // Drag a ghost of the whole block, not just the little grip.
    const el = (e.currentTarget as HTMLElement).closest('[data-id]') as HTMLElement | null;
    if (el) {
      const r = el.getBoundingClientRect();
      e.dataTransfer.setDragImage(el, e.clientX - r.left, e.clientY - r.top);
    }
  }

  function onBlockDragOver(e: DragEvent<HTMLDivElement>, id: string) {
    if (!dragId || dragId === id) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    // The central band joins the target's row (a column) to its left/right; the
    // thin top/bottom strips stack the block on its own line instead.
    const r = e.currentTarget.getBoundingClientRect();
    const relY = (e.clientY - r.top) / r.height;
    const pos: DropPos = relY < 0.22 ? 'above' : relY > 0.78 ? 'below' : e.clientX < r.left + r.width / 2 ? 'left' : 'right';
    setDropAt((d) => (d && d.id === id && d.pos === pos ? d : { id, pos }));
  }

  function onBlockDrop(e: DragEvent<HTMLDivElement>, id: string) {
    e.preventDefault();
    if (dragId && dropAt && dropAt.id === id) dropBlock(dragId, id, dropAt.pos);
    endDrag();
  }

  /**
   * Move `fromId` beside / above / below `toId`, re-balancing column widths.
   * A left/right drop merges the block into the target's row and divides that
   * row into equal fractions (2 → ½ ½, 3 → ⅓ ⅓ ⅓; a full row stacks instead).
   * Either way the row the block *left* re-balances to fill the freed space.
   */
  function dropBlock(fromId: string, toId: string, pos: DropPos) {
    if (fromId === toId) return;
    const blocks = blocksRef.current;
    const from = blocks.find((b) => b.id === fromId);
    if (!from) return;

    const rows = computeRows(blocks);
    const sourceRest = (rows.find((r) => r.some((b) => b.id === fromId)) ?? []).filter((b) => b.id !== fromId);
    const targetRow = rows.find((r) => r.some((b) => b.id === toId)) ?? [];
    const sameRow = targetRow.some((b) => b.id === fromId);

    const order = blocks.filter((b) => b.id !== fromId);
    const ti = order.findIndex((b) => b.id === toId);
    if (ti < 0) return;

    const widths = new Map<string, BlockWidth>();

    if (pos === 'left' || pos === 'right') {
      const existing = targetRow.filter((b) => b.id !== fromId);
      const size = existing.length + 1;
      if (size <= 3) {
        order.splice(pos === 'left' ? ti : ti + 1, 0, from);
        const w = equalWidth(size);
        for (const b of existing) widths.set(b.id, w);
        widths.set(fromId, w);
      } else {
        // Row already at the 3-column max — stack below it instead of cramming.
        const li = order.findIndex((b) => b.id === targetRow[targetRow.length - 1].id);
        order.splice(li + 1, 0, from);
        widths.set(fromId, 'full');
      }
    } else {
      order.splice(pos === 'above' ? ti : ti + 1, 0, from);
      widths.set(fromId, 'full');
    }

    // Re-balance the row the block vacated (unless it only moved within its row).
    if (!sameRow && sourceRest.length) {
      const w = equalWidth(sourceRest.length);
      for (const b of sourceRest) if (!widths.has(b.id)) widths.set(b.id, w);
    }

    commit(order.map((b) => (widths.has(b.id) ? withWidth(b, widths.get(b.id)!) : b)));
    setActiveId(fromId);
  }

  /** Move a block to the very end on its own full-width line, re-balancing the
   *  row it left (so pulling one out of a 3-column row leaves a clean 2-up). */
  function dropAtEnd(fromId: string) {
    const blocks = blocksRef.current;
    const from = blocks.find((b) => b.id === fromId);
    if (!from) return;
    const sourceRest = (computeRows(blocks).find((r) => r.some((b) => b.id === fromId)) ?? []).filter((b) => b.id !== fromId);
    const w = equalWidth(sourceRest.length);
    const widen = new Set(sourceRest.map((b) => b.id));
    const rest = blocks.filter((b) => b.id !== fromId).map((b) => (widen.has(b.id) ? withWidth(b, w) : b));
    commit([...rest, withWidth(from, 'full')]);
    setActiveId(fromId);
  }

  /** Insert prebuilt blocks after the last-focused block (or at the end). */
  function insertBlocks(toInsert: DocBlock[]) {
    if (toInsert.length === 0) return;
    const real = blocksRef.current;
    const anchor = lastFocusedId.current;
    const idx = anchor && anchor !== TRAILER_ID ? real.findIndex((b) => b.id === anchor) : -1;
    const next = idx >= 0 ? [...real.slice(0, idx + 1), ...toInsert, ...real.slice(idx + 1)] : [...real, ...toInsert];
    commit(next);
  }

  const insertWidget = (type: WidgetType) => insertBlocks([makeWidgetBlock(type, makeBlockId())]);

  // ── Whole-block selection (copy / cut / delete across items) ──
  /** Grow (or start) the block selection by moving its focus end one block in
   *  `dir`. With no selection yet, anchors at `fromId` first. */
  function growSelection(fromId: string, dir: -1 | 1) {
    const ids = displayBlocks.map((b) => b.id);
    setSelection((sel) => {
      const anchorId = sel ? sel.anchorId : fromId;
      const fi = ids.indexOf(sel ? sel.focusId : fromId);
      const ni = fi + dir;
      if (fi < 0 || ni < 0 || ni >= ids.length) return sel; // at a doc edge — no-op
      return { anchorId, focusId: ids[ni] };
    });
  }

  /** Shift+Click: select the range from the current anchor (or last-focused
   *  block) to the clicked block. */
  function shiftSelectTo(id: string) {
    const anchorId = selection?.anchorId ?? lastFocusedId.current ?? id;
    setSelection({ anchorId, focusId: id });
  }

  /** Copy the selected blocks to the clipboard as markdown (prose only). */
  function copySelection() {
    const blocks = blocksRef.current.filter((b): b is ProseBlock => selectedIds.has(b.id) && !isWidgetBlock(b));
    if (blocks.length) void navigator.clipboard?.writeText(listRangeToMarkdown(blocks));
  }

  /** Delete every selected block, focusing the block just before the range (or a
   *  fresh empty paragraph if the doc would otherwise be empty). */
  function deleteSelection() {
    const real = blocksRef.current;
    const firstIdx = real.findIndex((b) => selectedIds.has(b.id));
    if (firstIdx < 0) { setSelection(null); return; }
    let next = real.filter((b) => !selectedIds.has(b.id));
    const prev = firstIdx > 0 ? real[firstIdx - 1] : null;
    if (next.length === 0) {
      const para = emptyProse();
      next = [para];
      focusReq.current = { id: para.id, caret: 0 };
    } else if (prev) {
      focusReq.current = { id: prev.id, caret: !isWidgetBlock(prev) ? prev.text.length : 0 };
    }
    setSelection(null);
    commit(next);
  }

  // ── Keyboard handling for a prose textarea ──
  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>, block: ProseBlock) {
    const ta = e.currentTarget;
    const caret = ta.selectionStart;
    const selEnd = ta.selectionEnd;
    const text = ta.value;

    // @mention menu navigation takes precedence while open.
    if (mention && mention.id === block.id && mentionItems.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMention((m) => (m ? { ...m, index: Math.min(mentionIndex + 1, mentionItems.length - 1) } : m)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setMention((m) => (m ? { ...m, index: Math.max(mentionIndex - 1, 0) } : m)); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); const it = mentionItems[mentionIndex]; if (it) pickMention(block.id, mention.start, it.id); return; }
      if (e.key === 'Escape') { e.preventDefault(); setMention(null); return; }
    }

    // Slash menu navigation takes precedence while open.
    if (slash && slash.id === block.id && slashItems.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSlash((s) => (s ? { ...s, index: Math.min(slashIndex + 1, slashItems.length - 1) } : s)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSlash((s) => (s ? { ...s, index: Math.max(slashIndex - 1, 0) } : s)); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); slashItems[slashIndex]?.run(); return; }
      if (e.key === 'Escape') { e.preventDefault(); setSlash(null); return; }
    }

    // An active whole-block selection captures copy/cut/delete and shift-extend;
    // any other editing key collapses it so normal typing resumes.
    if (selectedIds.size >= 2) {
      const mod = e.metaKey || e.ctrlKey;
      if (e.key === 'Escape') { e.preventDefault(); setSelection(null); return; }
      if (mod && (e.key === 'z' || e.key === 'y' || e.key === 'Z' || e.key === 'Y')) { setSelection(null); return; }
      if (mod && (e.key === 'c' || e.key === 'C')) { e.preventDefault(); copySelection(); return; }
      if (mod && (e.key === 'x' || e.key === 'X')) { e.preventDefault(); copySelection(); deleteSelection(); return; }
      if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); deleteSelection(); return; }
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        if (e.shiftKey) { e.preventDefault(); growSelection(block.id, e.key === 'ArrowDown' ? 1 : -1); return; }
        setSelection(null);
        return; // let the caret move normally next keystroke
      }
      // Modifier combos (e.g. copy of native selection) pass through untouched;
      // anything else is an edit, so drop the selection and let it through.
      if (!mod) setSelection(null);
    }

    // The synthetic trailer: Enter drops a fresh paragraph; Backspace/Up jump to
    // the previous real block. Typing is handled by onTextChange (materialize).
    if (block.id === TRAILER_ID) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        materializeTrailer('', 0);
        return;
      }
      if ((e.key === 'Backspace' && caret === 0) || e.key === 'ArrowUp') {
        const target = prevFocusable(TRAILER_ID);
        if (target) { e.preventDefault(); focusBlock(target, taRefs.current.get(target)?.value.length ?? 0); }
      }
      return;
    }

    // Markdown shortcut: a marker followed by space at line start.
    if (e.key === ' ' && caret === selEnd && block.type === 'paragraph') {
      const left = text.slice(0, caret);
      const t = markerType(left);
      if (t) {
        e.preventDefault();
        const rest = text.slice(caret);
        focusReq.current = { id: block.id, caret: 0 };
        commit(blocksRef.current.map((b) => (b.id === block.id && !isWidgetBlock(b) ? { ...b, type: t, text: rest } : b)));
        return;
      }
    }

    // Enter: split into a new block (lists continue; code keeps the newline).
    if (e.key === 'Enter' && !e.shiftKey) {
      if (block.type === 'code') return;
      e.preventDefault();
      if ((block.type === 'bullet' || block.type === 'numbered') && text.trim() === '') {
        focusReq.current = { id: block.id, caret: 0 };
        commit(blocksRef.current.map((b) => (b.id === block.id && !isWidgetBlock(b) ? { ...b, type: 'paragraph' } : b)));
        return;
      }
      const before = text.slice(0, caret);
      const after = text.slice(selEnd);
      const newType: ProseType = block.type === 'bullet' || block.type === 'numbered' ? block.type : 'paragraph';
      const newBlock: ProseBlock = { id: makeBlockId(), type: newType, text: after };
      focusReq.current = { id: newBlock.id, caret: 0 };
      const next: DocBlock[] = [];
      for (const b of blocksRef.current) {
        if (b.id === block.id) {
          next.push({ ...(b as ProseBlock), text: before });
          next.push(newBlock);
        } else next.push(b);
      }
      commit(next);
      return;
    }

    // Backspace at the very start: de-style, then merge into the previous block.
    if (e.key === 'Backspace' && caret === 0 && selEnd === 0) {
      if (block.type !== 'paragraph') {
        e.preventDefault();
        focusReq.current = { id: block.id, caret: 0 };
        commit(blocksRef.current.map((b) => (b.id === block.id && !isWidgetBlock(b) ? { ...b, type: 'paragraph' } : b)));
        return;
      }
      const real = blocksRef.current;
      const idx = real.findIndex((b) => b.id === block.id);
      const prev = idx > 0 ? real[idx - 1] : null;
      if (prev && !isWidgetBlock(prev)) {
        e.preventDefault();
        const mergeCaret = prev.text.length;
        focusReq.current = { id: prev.id, caret: mergeCaret };
        const next = real
          .filter((b) => b.id !== block.id)
          .map((b) => (b.id === prev.id && !isWidgetBlock(b) ? { ...b, text: prev.text + text } : b));
        commit(next);
        return;
      }
      if (prev && isWidgetBlock(prev) && text === '') {
        e.preventDefault();
        commit(real.filter((b) => b.id !== block.id));
        return;
      }
    }

    // Shift+Arrow at the very start/end of a block starts a whole-block selection
    // (within-block shift-selection elsewhere stays native).
    if (e.key === 'ArrowUp' && e.shiftKey && caret === 0 && selEnd === 0) {
      e.preventDefault();
      growSelection(block.id, -1);
      return;
    }
    if (e.key === 'ArrowDown' && e.shiftKey && caret === text.length && selEnd === text.length) {
      e.preventDefault();
      growSelection(block.id, 1);
      return;
    }

    // Arrow navigation across blocks at the text edges.
    if (e.key === 'ArrowUp' && caret === selEnd) {
      const firstNL = text.indexOf('\n');
      if (firstNL === -1 || caret <= firstNL) {
        const target = prevFocusable(block.id);
        if (target) { e.preventDefault(); focusBlock(target, taRefs.current.get(target)?.value.length ?? 0); }
      }
    }
    if (e.key === 'ArrowDown' && caret === selEnd) {
      const lastNL = text.lastIndexOf('\n');
      if (lastNL === -1 || caret > lastNL) {
        const target = nextFocusable(block.id);
        if (target) { e.preventDefault(); focusBlock(target, 0); }
      }
    }
  }

  // ── Paste: splitting a multi-line paste inside a list into one item per line ──
  function handlePaste(e: ClipboardEvent<HTMLTextAreaElement>, block: ProseBlock) {
    const pasted = e.clipboardData.getData('text/plain');
    if (!pasted.includes('\n') || !isListType(block.type)) return; // default single-block paste
    e.preventDefault();
    const ta = e.currentTarget;
    const before = ta.value.slice(0, ta.selectionStart);
    const after = ta.value.slice(ta.selectionEnd);
    const items = splitTextToListItems(pasted);
    const lastIdx = items.length - 1;
    items[0] = before + items[0];
    items[lastIdx] = items[lastIdx] + after;
    const newBlocks: ProseBlock[] = items.map((t, i) =>
      i === 0 ? { ...block, text: t } : { id: makeBlockId(), type: block.type, text: t },
    );
    focusReq.current = { id: newBlocks[lastIdx].id, caret: items[lastIdx].length - after.length };
    const next: DocBlock[] = [];
    for (const b of blocksRef.current) {
      if (b.id === block.id) next.push(...newBlocks);
      else next.push(b);
    }
    commit(next);
  }

  function focusableList() {
    return displayBlocks.filter((b) => !isWidgetBlock(b) && b.type !== 'divider').map((b) => b.id);
  }
  function prevFocusable(id: string) {
    const list = focusableList();
    const i = list.indexOf(id);
    return i > 0 ? list[i - 1] : null;
  }
  function nextFocusable(id: string) {
    const list = focusableList();
    const i = list.indexOf(id);
    return i >= 0 && i < list.length - 1 ? list[i + 1] : null;
  }

  // Undo/redo shortcuts on the editor wrapper.
  function handleHistoryKey(e: KeyboardEvent<HTMLDivElement>) {
    if (!(e.metaKey || e.ctrlKey)) return;
    const key = e.key.toLowerCase();
    if (key === 'z') {
      e.preventDefault();
      e.stopPropagation();
      if (e.shiftKey) redo();
      else undo();
    } else if (key === 'y') {
      e.preventDefault();
      e.stopPropagation();
      redo();
    }
  }

  if (!ready) {
    return <div className="min-h-[40vh] animate-pulse rounded-lg bg-line-soft" aria-hidden />;
  }

  const canUndo = !!undoMgr && undoMgr.undoStack.length > 0;
  const canRedo = !!undoMgr && undoMgr.redoStack.length > 0;
  const histBtn =
    'rounded-lg border border-line px-2 py-1 text-xs font-semibold text-muted hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-40';

  // The block the bottom action shelf operates on (a real block, never the
  // view-only trailer). Resolving here means a deleted active block simply
  // yields `undefined` and the shelf hides itself.
  const activeBlock = activeId && activeId !== TRAILER_ID ? blocks.find((b) => b.id === activeId) : undefined;

  return (
    <div className="flex gap-4" onKeyDown={handleHistoryKey}>
      <div className="min-w-0 flex-1">
        <LegendBar
          legend={legend}
          onAdd={addLegendEntry}
          onUpdate={updateLegendEntry}
          onRemove={removeLegendEntry}
        />
        <div className="mb-1 flex justify-end gap-1">
          <button type="button" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)" className={histBtn}>
            ↶ Undo
          </button>
          <button type="button" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)" className={histBtn}>
            ↷ Redo
          </button>
        </div>
        <div className="relative">
        <div ref={wrapRef} className="flex flex-wrap items-start gap-x-3">
          {displayBlocks.map((block) => {
            const isTrailer = block.id === TRAILER_ID;
            const layout = (!isTrailer && block.layout) || DEFAULT_LAYOUT;
            // List items sit tight (no internal vertical padding); the run keeps
            // normal padding only at its outer (first/last) edges.
            const li = listInfo.get(block.id);
            const spacing = li ? `${li.first ? 'pt-0.5' : 'pt-0'} ${li.last ? 'pb-0.5' : 'pb-0'}` : 'py-0.5';
            const selected = selectedIds.size >= 2 && selectedIds.has(block.id);
            // Prose blocks (not dividers) can be tagged with a legend colour; the
            // resolved entry (if its id still exists in the legend) tints them.
            const canColor = !isWidgetBlock(block) && block.type !== 'divider';
            const colorId = !isTrailer && !isWidgetBlock(block) ? block.color : undefined;
            const tag = colorId ? legendById.get(colorId) : undefined;
            return (
            <div
              key={block.id}
              data-id={block.id}
              onMouseDown={(e) => {
                if (isTrailer) { setActiveId(null); return; }
                if (e.shiftKey) { e.preventDefault(); shiftSelectTo(block.id); }
                else { setSelection(null); setActiveId(block.id); }
              }}
              onDragOver={isTrailer ? undefined : (e) => onBlockDragOver(e, block.id)}
              onDrop={isTrailer ? undefined : (e) => onBlockDrop(e, block.id)}
              className={`group relative ${spacing} ${WIDTH_CLASS[layout.width]} ${ALIGN_SELF[layout.align]} ${selected ? 'rounded bg-brass-soft/70' : ''} ${activeId === block.id && !isTrailer && !selected ? 'rounded-md ring-1 ring-brass/40' : ''} ${dragId === block.id ? 'opacity-40' : ''}`}
            >
              {/* Drop indicator: a column rail (left/right) or a stack bar (above/below). */}
              {dropAt && dropAt.id === block.id && (
                <div
                  className={`pointer-events-none absolute z-20 rounded bg-brass ${
                    dropAt.pos === 'above' ? 'left-0 right-0 h-0.5 -top-1'
                      : dropAt.pos === 'below' ? 'left-0 right-0 h-0.5 -bottom-1'
                      : dropAt.pos === 'left' ? 'top-0 bottom-0 w-0.5 -left-1.5'
                      : 'top-0 bottom-0 w-0.5 -right-1.5'
                  }`}
                />
              )}
              {/* Drag grip — only on the active or hovered block, so there's a clear
                  handle without the old always-on gutter. Drop beside a block to
                  form a column; drop above/below to stack. */}
              {!isTrailer && (
                <div
                  draggable
                  onDragStart={(e) => onGripDragStart(e, block.id)}
                  onDragEnd={endDrag}
                  title="Drag to move — drop beside a block to form a column"
                  className={`absolute left-0 top-0 z-10 flex h-5 w-4 cursor-grab items-center justify-center rounded-br-md bg-surface/85 text-[12px] leading-none text-muted shadow-sm ring-1 ring-line transition-opacity hover:text-ink active:cursor-grabbing ${
                    activeId === block.id || dragId === block.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                  }`}
                >⠿</div>
              )}
              <div className="relative min-w-0">
                {remoteByBlock.get(block.id)?.length ? (
                  <>
                    <RemoteBlockAccent color={remoteByBlock.get(block.id)![0].color} />
                    <RemoteBlockBadges users={remoteByBlock.get(block.id)!} />
                  </>
                ) : null}
                {isWidgetBlock(block) ? (
                  <WidgetHost block={block} onChange={(patch) => setWidgetProps(block.id, patch)} docId={docId} />
                ) : (
                  <ColorFrame color={tag?.color}>
                    <ProseView
                      block={block}
                      ordinal={ordinals.get(block.id)}
                      registerRef={registerRef}
                      onTextChange={onTextChange}
                      onKeyDown={handleKeyDown}
                      onPaste={handlePaste}
                      onFocus={() => { lastFocusedId.current = block.id; setActiveId(isTrailer ? null : block.id); }}
                      onCursor={publishCursor}
                      mentionIndex={mentionTargets}
                      onOpenMention={setOpenMentionId}
                    />
                  </ColorFrame>
                )}
                {slash && slash.id === block.id && slashItems.length > 0 && (
                  <SlashMenu
                    items={slashItems}
                    activeIndex={slashIndex}
                    onHover={(i) => setSlash((s) => (s ? { ...s, index: i } : s))}
                    onPick={(i) => slashItems[i]?.run()}
                  />
                )}
                {mention && mention.id === block.id && mentionItems.length > 0 && (
                  <MentionMenu
                    items={mentionItems}
                    activeIndex={mentionIndex}
                    onHover={(i) => setMention((m) => (m ? { ...m, index: i } : m))}
                    onPick={(i) => { const it = mentionItems[i]; if (it) pickMention(block.id, mention.start, it.id); }}
                  />
                )}
              </div>
            </div>
            );
          })}
          {/* Trailing drop zone — a clear "put it here" spot that appears while
              dragging, for placing a block on its own line at the end (e.g. to
              pull it back out of a column). */}
          {dragId && (
            <div
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDropAt((d) => (d && d.id === END_DROP_ID ? d : { id: END_DROP_ID, pos: 'below' })); }}
              onDragLeave={() => setDropAt((d) => (d && d.id === END_DROP_ID ? null : d))}
              onDrop={(e) => { e.preventDefault(); if (dragId) dropAtEnd(dragId); endDrag(); }}
              className={`mt-2 w-full rounded-lg border-2 border-dashed py-3 text-center text-xs font-medium transition-colors ${
                dropAt?.id === END_DROP_ID ? 'border-brass bg-brass-soft text-brass' : 'border-line text-muted'
              }`}
            >
              Drop here to place on its own line at the end
            </div>
          )}
        </div>
        {docId && <CollectionTagOverlay wrapRef={wrapRef} candidates={candidates} docId={docId} />}
        </div>
      </div>
      <WidgetShelf blocks={blocks} onInsertWidget={insertWidget} onInsertBlocks={insertBlocks} />
      {activeBlock && selectedIds.size < 2 && (
        <BlockShelf
          block={activeBlock}
          index={blocks.findIndex((b) => b.id === activeBlock.id)}
          total={blocks.length}
          legend={legend}
          onMove={(dir) => moveBlock(activeBlock.id, dir)}
          onLayout={(patch) => setBlockLayout(activeBlock.id, patch)}
          onColor={(id) => setBlockColor(activeBlock.id, id)}
          onDelete={() => deleteBlock(activeBlock.id)}
          onClose={() => setActiveId(null)}
        />
      )}
      {openMentionId && (
        <MentionPanel
          id={openMentionId}
          target={mentionTargets.get(openMentionId) ?? null}
          onClose={() => setOpenMentionId(null)}
        />
      )}
    </div>
  );
}

// ── Prose block view ─────────────────────────────────────────────────────────

function ProseView({
  block,
  ordinal,
  registerRef,
  onTextChange,
  onKeyDown,
  onPaste,
  onFocus,
  onCursor,
  mentionIndex,
  onOpenMention,
}: {
  block: ProseBlock;
  ordinal?: number;
  registerRef: (id: string, el: HTMLTextAreaElement | null) => void;
  onTextChange: (id: string, value: string) => void;
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>, block: ProseBlock) => void;
  onPaste: (e: ClipboardEvent<HTMLTextAreaElement>, block: ProseBlock) => void;
  onFocus: () => void;
  onCursor: (blockId: string, start: number, end: number) => void;
  /** Resolved mention targets, for coloring + previewing chips. */
  mentionIndex: Map<string, MentionTarget>;
  /** Open the slide-in detail panel for a mentioned page. */
  onOpenMention: (id: string) => void;
}) {
  const localRef = useRef<HTMLTextAreaElement | null>(null);
  // Whether this block is being edited (textarea focused). While idle, a
  // mention-bearing block shows the chip overlay instead of its raw `@slug` text.
  const [focused, setFocused] = useState(false);
  // The chip overlay can be taller than the raw text the textarea sizes itself to
  // (a chip shows a page's title, often longer than its `@slug`, so it may wrap an
  // extra line). We measure the overlay and floor the textarea's height to it, so
  // the block always reserves exactly what's painted and never overlaps the next.
  const [overlayHeight, setOverlayHeight] = useState<number | null>(null);
  // The last selection we observed locally, in *old-text* coordinates. Used to
  // re-place the caret when a remote edit rewrites this block's text underneath
  // us, so a teammate typing earlier in the paragraph doesn't shove your cursor.
  const selRef = useRef<{ value: string; start: number; end: number }>({ value: block.text, start: 0, end: 0 });

  const setRef = useCallback(
    (el: HTMLTextAreaElement | null) => {
      localRef.current = el;
      registerRef(block.id, el);
    },
    [block.id, registerRef],
  );

  const captureSel = useCallback(() => {
    const el = localRef.current;
    if (el) {
      selRef.current = { value: el.value, start: el.selectionStart, end: el.selectionEnd };
      onCursor(block.id, el.selectionStart, el.selectionEnd);
    }
  }, [block.id, onCursor]);

  // Preserve the caret across remote text changes (local edits already line up).
  useLayoutEffect(() => {
    const el = localRef.current;
    if (!el) return;
    const sel = selRef.current;
    if (document.activeElement !== el || sel.value === block.text) {
      selRef.current = { value: block.text, start: el.selectionStart, end: el.selectionEnd };
      return;
    }
    const start = adjustCaret(sel.value, block.text, sel.start);
    const end = adjustCaret(sel.value, block.text, sel.end);
    el.setSelectionRange(start, end);
    selRef.current = { value: block.text, start, end };
  }, [block.text]);

  // Auto-grow to fit content.
  useLayoutEffect(() => {
    const el = localRef.current;
    if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`; }
  }, [block.text, block.type]);

  if (block.type === 'divider') {
    return <hr className="my-3 border-t border-line" />;
  }

  const marker =
    block.type === 'bullet' ? '•' : block.type === 'numbered' ? `${ordinal ?? 1}.` : null;

  // Mention overlay: split the text into text/mention runs and paint a read-only
  // layer over the textarea whenever this block carries a mention. The textarea
  // stays mounted and authoritative — the overlay only borrows the surface — so
  // every bit of the editor's focus / caret / split-merge machinery is untouched.
  // Code blocks opt out (an `@id` inside code is code, not a link). The layer has
  // two modes so a mention never reverts to flat plain text the moment you edit:
  //   • idle  → full titled chips, with the raw text hidden beneath them.
  //   • focus → a paint-only highlight tinting each raw `@slug` in place; the real
  //             text stays visible so the caret/selection/spellcheck are untouched.
  const typography = PROSE_CLASS[block.type];
  const segments = splitMentions(block.text);
  const canChip = block.type !== 'code' && segments.some((s) => s.kind === 'mention');
  const chipMode = canChip && !focused; // titled chips; raw text hidden under them
  const markMode = canChip && focused; // in-place highlight; raw text stays visible

  /** Focus the textarea at a raw-text caret index (or its end) — used when the
   *  reader clicks the idle chip overlay between chips to resume editing. */
  function enterEditAt(caret: number | null) {
    const el = localRef.current;
    if (!el) return;
    el.focus();
    const c = caret == null ? el.value.length : Math.min(caret, el.value.length);
    el.setSelectionRange(c, c);
  }

  const field = (
    <div className="relative">
      <textarea
        ref={setRef}
        rows={1}
        value={block.text}
        onChange={(e) => { selRef.current = { value: e.target.value, start: e.target.selectionStart, end: e.target.selectionEnd }; onCursor(block.id, e.target.selectionStart, e.target.selectionEnd); onTextChange(block.id, e.target.value); }}
        onSelect={captureSel}
        onKeyDown={(e) => onKeyDown(e, block)}
        onPaste={(e) => onPaste(e, block)}
        onFocus={(e) => { setFocused(true); onFocus(); onCursor(block.id, e.currentTarget.selectionStart, e.currentTarget.selectionEnd); }}
        onBlur={() => setFocused(false)}
        placeholder={block.type === 'paragraph' ? "Write, or press '/' for blocks…" : undefined}
        spellCheck
        // While the chip overlay is up (idle), hide the raw text under it
        // (transparent) so the `@slug` token never double-paints behind a chip, and
        // floor the height to the overlay so a longer title's extra wrap line still
        // fits. While editing (markMode) the raw text stays visible — the highlight
        // only tints it — so there's nothing to hide and no height to floor.
        style={chipMode && overlayHeight ? { minHeight: `${overlayHeight}px` } : undefined}
        className={`w-full resize-none border-none bg-transparent p-0 placeholder:text-muted/55 focus:outline-none focus:ring-0 ${typography} ${chipMode ? 'text-transparent caret-transparent' : ''}`}
      />
      {(chipMode || markMode) && (
        <MentionReadLayer
          mode={chipMode ? 'chips' : 'mark'}
          segments={segments}
          typography={typography}
          mentionIndex={mentionIndex}
          onOpenMention={onOpenMention}
          onEditAt={enterEditAt}
          onMeasure={setOverlayHeight}
        />
      )}
    </div>
  );

  if (block.type === 'quote') {
    return <div className="my-1 rounded-r-lg border-l-4 border-brass bg-canvas py-2 pl-4 pr-3">{field}</div>;
  }
  if (marker) {
    // Fixed-width, right-aligned, tabular marker column so `1.`–`99.` and `•` all
    // share one text left-edge and consecutive items line up.
    return (
      <div className="flex gap-2">
        <span className="w-6 flex-shrink-0 select-none pt-0.5 text-right text-[15px] leading-relaxed tabular-nums text-brass">{marker}</span>
        <div className="min-w-0 flex-1">{field}</div>
      </div>
    );
  }
  return field;
}

// ── Mention overlay ───────────────────────────────────────────────────────────
// The read-only layer laid over a textarea, in two modes that share one geometry
// (absolute top/left/right, same typography + pre-wrap + zero padding as the field):
//   • 'chips' (idle)  — reproduces the text with each mention swapped for a chip;
//     the raw text beneath is hidden. Interactive: clicking between chips maps the
//     point back to a raw caret index and resumes editing; clicking a chip opens
//     its panel (the chip stops that event itself).
//   • 'mark' (editing) — pointer-transparent, its own text transparent, so the
//     textarea's real glyphs/caret/selection show straight through; each mention run
//     adds only a paint-only tint (no padding/weight/size), keeping every character
//     metric identical so a mention stays a colored token while you type in it.
function MentionReadLayer({ mode, segments, typography, mentionIndex, onOpenMention, onEditAt, onMeasure }: {
  mode: 'chips' | 'mark';
  segments: MentionSegment[];
  typography: string;
  mentionIndex: Map<string, MentionTarget>;
  onOpenMention: (id: string) => void;
  onEditAt: (caret: number | null) => void;
  onMeasure: (height: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const lastH = useRef(-1);
  // Only the chip overlay drives the textarea's min-height (chips can wrap taller
  // than the raw slugs). The 'mark' layer matches the text 1:1, so it never needs
  // to measure. The overlay is anchored top/left/right (not inset-0), so its height
  // is its own *content* height — independent of the textarea we then floor to it —
  // which keeps this measurement stable; we still guard on change so an identical
  // remeasure never schedules another render.
  useLayoutEffect(() => {
    if (mode !== 'chips') return;
    const h = ref.current?.offsetHeight ?? 0;
    if (h && h !== lastH.current) { lastH.current = h; onMeasure(h); }
  });

  if (mode === 'mark') {
    return (
      <div
        ref={ref}
        aria-hidden
        className={`pointer-events-none absolute left-0 right-0 top-0 whitespace-pre-wrap break-words text-transparent ${typography}`}
      >
        {segments.map((seg, i) =>
          seg.kind === 'text' ? (
            <span key={i}>{seg.text}</span>
          ) : (
            <span key={i} className={inlineMentionClass(mentionIndex.get(seg.id) ?? null)}>{seg.raw}</span>
          ),
        )}
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className={`absolute left-0 right-0 top-0 cursor-text whitespace-pre-wrap break-words ${typography}`}
      onMouseDown={(e) => {
        e.preventDefault(); // we place the caret ourselves; don't let the browser
        onEditAt(rawCaretFromPoint(e.clientX, e.clientY));
      }}
    >
      {segments.map((seg, i) =>
        seg.kind === 'text' ? (
          <span key={i} data-seg-start={seg.start}>{seg.text}</span>
        ) : (
          <MentionChip
            key={i}
            id={seg.id}
            raw={seg.raw}
            target={mentionIndex.get(seg.id) ?? null}
            onOpen={onOpenMention}
          />
        ),
      )}
    </div>
  );
}

/** Map a viewport point inside a read overlay to a raw-text caret index via the
 *  clicked text segment's `data-seg-start`. Returns null when the point isn't over
 *  a text segment (a chip, or empty space), so the caller can fall back to end. */
function rawCaretFromPoint(x: number, y: number): number | null {
  const doc = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  };
  let node: Node | null = null;
  let offset = 0;
  if (doc.caretRangeFromPoint) {
    const r = doc.caretRangeFromPoint(x, y);
    if (r) { node = r.startContainer; offset = r.startOffset; }
  } else if (doc.caretPositionFromPoint) {
    const p = doc.caretPositionFromPoint(x, y);
    if (p) { node = p.offsetNode; offset = p.offset; }
  }
  if (!node) return null;
  const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element);
  const seg = el?.closest('[data-seg-start]') as HTMLElement | null;
  if (!seg) return null;
  const start = Number(seg.dataset.segStart);
  const len = seg.textContent?.length ?? 0;
  const within = node.nodeType === Node.TEXT_NODE ? offset : offset > 0 ? len : 0;
  return start + Math.min(within, len);
}

/** Map a caret position from old text to new text given a single-region edit. */
function adjustCaret(oldVal: string, newVal: string, caret: number): number {
  if (oldVal === newVal) return caret;
  const max = Math.min(oldVal.length, newVal.length);
  let p = 0;
  while (p < max && oldVal[p] === newVal[p]) p++;
  let s = 0;
  while (s < max - p && oldVal[oldVal.length - 1 - s] === newVal[newVal.length - 1 - s]) s++;
  const oldChangeEnd = oldVal.length - s;
  const delta = newVal.length - oldVal.length;
  if (caret <= p) return caret;
  if (caret >= oldChangeEnd) return caret + delta;
  return newVal.length - s; // caret was inside the replaced region
}

// ── Bottom action shelf (reorder / width / align / colour / delete) ──────────
// A fixed, contextual toolbar pinned to the bottom of the viewport that drives
// the one "active" block — whatever the writer last clicked into. It replaces
// the old per-block hover gutter: explicit Move ▲▼ buttons are far more reliable
// than drag-to-reorder, and a single persistent bar never flickers on hover.

function BlockShelf({ block, index, total, legend, onMove, onLayout, onColor, onDelete, onClose }: {
  block: DocBlock;
  /** The block's index in the real (non-trailer) order — bounds the move arrows. */
  index: number;
  total: number;
  legend: PageLegend;
  onMove: (dir: -1 | 1) => void;
  onLayout: (patch: Partial<BlockLayout>) => void;
  onColor: (id: string | null) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [colorOpen, setColorOpen] = useState(false);
  const layout = block.layout ?? DEFAULT_LAYOUT;
  const canColor = !isWidgetBlock(block) && block.type !== 'divider';
  const colorId = isWidgetBlock(block) ? undefined : block.color;
  const tag = canColor && colorId ? legend.find((e) => e.id === colorId) : undefined;
  const meta = blockMeta(block);

  // The shelf is persistent (it doesn't vanish on blur), so give it a keyboard
  // exit: Escape closes it the same as the ⌄ button.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const seg = 'flex items-center gap-0.5 rounded-lg bg-canvas p-0.5';
  const cell = 'rounded-md px-2 py-1 text-[11px] font-medium leading-none transition-colors';
  const on = 'bg-surface text-brass shadow-sm';
  const off = 'text-muted hover:text-ink';
  const icon = 'flex h-7 w-7 items-center justify-center rounded-lg text-muted transition-colors hover:bg-canvas hover:text-ink disabled:cursor-not-allowed disabled:opacity-30';
  const rule = <span className="mx-0.5 h-6 w-px bg-line" aria-hidden />;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
      <div className="pointer-events-auto flex max-w-full items-center gap-1.5 overflow-x-auto rounded-2xl border border-line bg-surface/95 px-2 py-1.5 shadow-xl backdrop-blur">
        <span className="flex flex-shrink-0 items-center gap-1.5 pl-1 pr-0.5 text-[11px] font-semibold text-muted">
          <span className="flex h-4 w-4 items-center justify-center text-muted">{meta.icon}</span>
          {meta.label}
        </span>
        {rule}
        <div className="flex flex-shrink-0 items-center">
          <button type="button" className={icon} title="Move up" disabled={index <= 0} onClick={() => onMove(-1)}>▲</button>
          <button type="button" className={icon} title="Move down" disabled={index >= total - 1} onClick={() => onMove(1)}>▼</button>
        </div>
        {rule}
        <div className={seg}>
          {BLOCK_WIDTHS.map((w) => (
            <button key={w} type="button" title={`Width: ${w}`} onClick={() => onLayout({ width: w })} className={`${cell} ${layout.width === w ? on : off}`}>{WIDTH_GLYPH[w]}</button>
          ))}
        </div>
        <div className={seg}>
          {BLOCK_ALIGNS.map((a) => (
            <button key={a} type="button" title={`Align: ${a}`} onClick={() => onLayout({ align: a })} className={`${cell} ${layout.align === a ? on : off}`}>{ALIGN_GLYPH[a]}</button>
          ))}
        </div>
        {canColor && (
          <>
            {rule}
            <div className="relative flex-shrink-0">
              <button
                type="button"
                title={tag ? `Legend: ${tag.label || 'unlabeled'}` : 'Tag with a legend colour'}
                onClick={() => setColorOpen((o) => !o)}
                className={icon}
              >
                <span className={`h-3.5 w-3.5 rounded-full border ${tag ? `${LEGEND_STYLE[tag.color].swatch} border-transparent` : 'border-line'}`} />
              </button>
              {colorOpen && (
                <BlockColorPopover
                  legend={legend}
                  colorId={colorId}
                  onPick={(id) => { onColor(id); setColorOpen(false); }}
                  onClose={() => setColorOpen(false)}
                />
              )}
            </div>
          </>
        )}
        {rule}
        <button type="button" className={`${icon} flex-shrink-0 hover:bg-oxblood-soft hover:text-oxblood`} title="Delete block" onClick={onDelete}>✕</button>
        <button type="button" className={`${icon} flex-shrink-0`} title="Close" onClick={onClose}>⌄</button>
      </div>
    </div>
  );
}

/** Icon + friendly name for a block, for the shelf's identity chip. */
function blockMeta(block: DocBlock): { icon: ReactNode; label: string } {
  if (isWidgetBlock(block)) {
    return { icon: WIDGET_CATALOG[block.type].icon, label: WIDGET_LIST.find((w) => w.type === block.type)?.title ?? 'Widget' };
  }
  return { icon: PROSE_CATALOG[block.type].icon, label: PROSE_MENU.find((p) => p.type === block.type)?.title ?? 'Block' };
}

// ── Legend-colour frame (tinted rail around a tagged prose block) ────────────
// Mirrors the small-widget look (a colored left rail + faint wash) so a tagged
// paragraph reads as kin to the field widgets. No tag → children pass through.
function ColorFrame({ color, children }: { color?: LegendColor; children: ReactNode }) {
  if (!color) return <>{children}</>;
  const st = LEGEND_STYLE[color];
  return (
    <div className={`relative rounded-lg py-1 pl-3.5 pr-2 ${st.tint}`}>
      <span className={`pointer-events-none absolute inset-y-1 left-0 w-1 rounded-r ${st.bar}`} aria-hidden />
      {children}
    </div>
  );
}

/** The block-level colour picker: choose one legend entry (or clear the tag). */
function BlockColorPopover({ legend, colorId, onPick, onClose }: {
  legend: PageLegend;
  colorId?: string;
  onPick: (id: string | null) => void;
  onClose: () => void;
}) {
  return (
    <>
      <button type="button" aria-label="Close" className="fixed inset-0 z-20 cursor-default" onClick={onClose} />
      <div className="absolute bottom-full right-0 z-30 mb-2 w-52 rounded-xl border border-line bg-surface p-1.5 shadow-lg">
        <div className="px-1 pb-1 font-mono text-[10px] font-semibold uppercase tracking-wide text-muted">Legend colour</div>
        {legend.length === 0 ? (
          <p className="px-1 py-1 text-[11px] leading-snug text-muted">Add colours to the legend at the top of the page first.</p>
        ) : (
          <>
            {legend.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => onPick(e.id)}
                className={`flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left text-xs ${e.id === colorId ? 'bg-canvas' : 'hover:bg-canvas/60'}`}
              >
                <span className={`h-3 w-3 flex-shrink-0 rounded-full ${LEGEND_STYLE[e.color].swatch}`} />
                <span className="min-w-0 flex-1 truncate text-ink">{e.label || <span className="text-muted">Unlabeled</span>}</span>
                {e.id === colorId && <span className="flex-shrink-0 text-muted">✓</span>}
              </button>
            ))}
            {colorId && (
              <button
                type="button"
                onClick={() => onPick(null)}
                className="mt-0.5 flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left text-xs text-muted hover:bg-canvas/60"
              >
                <span className="flex h-3 w-3 flex-shrink-0 items-center justify-center text-muted">∅</span> None
              </button>
            )}
          </>
        )}
      </div>
    </>
  );
}

// ── Page color legend bar ────────────────────────────────────────────────────
// Pinned at the top of the page: the page's pre-defined color legend. Each entry
// is a colour swatch (click to recolour) + an editable meaning, and tagged prose
// blocks reference these entries by id.
function LegendBar({ legend, onAdd, onUpdate, onRemove }: {
  legend: PageLegend;
  onAdd: () => void;
  onUpdate: (id: string, patch: Partial<Omit<LegendEntry, 'id'>>) => void;
  onRemove: (id: string) => void;
}) {
  if (legend.length === 0) {
    return (
      <button
        type="button"
        onClick={onAdd}
        className="mb-3 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-line px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:border-brass hover:text-ink"
      >
        <span className="text-sm leading-none">＋</span> Add color legend
      </button>
    );
  }
  return (
    <div className="mb-4 rounded-xl border border-line bg-canvas/60 p-2.5">
      <div className="mb-1.5 px-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-muted">Color legend</div>
      <div className="flex flex-wrap items-center gap-2">
        {legend.map((e) => (
          <LegendEntryEditor key={e.id} entry={e} onUpdate={(patch) => onUpdate(e.id, patch)} onRemove={() => onRemove(e.id)} />
        ))}
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-1 rounded-lg border border-dashed border-line px-2 py-1 text-xs font-medium text-muted transition-colors hover:border-brass hover:text-ink"
        >
          ＋ Color
        </button>
      </div>
    </div>
  );
}

/** One editable legend row: recolour swatch + meaning input + remove. */
function LegendEntryEditor({ entry, onUpdate, onRemove }: {
  entry: LegendEntry;
  onUpdate: (patch: Partial<Omit<LegendEntry, 'id'>>) => void;
  onRemove: () => void;
}) {
  const [picking, setPicking] = useState(false);
  const st = LEGEND_STYLE[entry.color];
  return (
    <span className={`relative inline-flex items-center gap-1.5 rounded-lg border py-1 pl-1.5 pr-1 ${st.border} ${st.tint}`}>
      <button
        type="button"
        title="Change colour"
        onClick={() => setPicking((p) => !p)}
        className={`h-4 w-4 flex-shrink-0 rounded-full ring-1 ring-inset ring-black/10 ${st.swatch}`}
      />
      <input
        value={entry.label}
        onChange={(e) => onUpdate({ label: e.target.value })}
        placeholder="Meaning…"
        className={`w-28 border-none bg-transparent p-0 text-xs font-medium placeholder:text-muted focus:outline-none focus:ring-0 ${st.text}`}
      />
      <button
        type="button"
        title="Remove"
        onClick={onRemove}
        className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded text-[11px] text-muted hover:bg-surface hover:text-oxblood"
      >✕</button>
      {picking && (
        <ColorPalette
          current={entry.color}
          onPick={(color) => { onUpdate({ color }); setPicking(false); }}
          onClose={() => setPicking(false)}
        />
      )}
    </span>
  );
}

/** A grid of the controlled legend colours, for recolouring a legend entry. */
function ColorPalette({ current, onPick, onClose }: {
  current: LegendColor;
  onPick: (color: LegendColor) => void;
  onClose: () => void;
}) {
  return (
    <>
      <button type="button" aria-label="Close" className="fixed inset-0 z-20 cursor-default" onClick={onClose} />
      <div className="absolute left-0 top-full z-30 mt-1 grid w-44 grid-cols-6 gap-1.5 rounded-xl border border-line bg-surface p-2 shadow-lg">
        {LEGEND_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            title={c}
            onClick={() => onPick(c)}
            className={`h-5 w-5 rounded-full ring-1 ring-inset ring-black/10 ${LEGEND_STYLE[c].swatch} ${c === current ? 'outline outline-2 outline-offset-1 outline-ink' : ''}`}
          />
        ))}
      </div>
    </>
  );
}

// ── @mention menu ─────────────────────────────────────────────────────────────
// A compact page picker shown while typing `@query`. Mirrors the slash menu's
// block-anchored dropdown; each row shows the page title and the slug that will
// be inserted (so the writer learns the id). Picking inserts `@<id> `.

/** Rank a candidate against the query: prefix match beats a mere substring. */
function mentionRank(item: { id: string; title: string }, q: string): number {
  if (!q) return 0;
  return item.id.toLowerCase().startsWith(q) || item.title.toLowerCase().startsWith(q) ? 2 : 1;
}

function MentionMenu({
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

// ── Slash menu ────────────────────────────────────────────────────────────────

function SlashMenu({
  items,
  activeIndex,
  onHover,
  onPick,
}: {
  items: SlashItem[];
  activeIndex: number;
  onHover: (i: number) => void;
  onPick: (i: number) => void;
}) {
  const active = items[activeIndex];
  return (
    <div className="absolute left-0 top-full z-20 mt-1 flex items-start gap-2">
      <div className="max-h-72 w-72 overflow-auto rounded-xl border border-line bg-surface p-1 shadow-lg">
        {items.map((it, i) => (
          <button
            key={it.key}
            type="button"
            onMouseEnter={() => onHover(i)}
            onMouseDown={(e) => { e.preventDefault(); onPick(i); }}
            className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left ${
              i === activeIndex ? 'bg-canvas text-ink' : 'text-muted'
            }`}
          >
            <span className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border ${
              i === activeIndex ? 'border-brass bg-surface text-brass' : 'border-line text-muted'
            }`}>
              {it.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium">{it.title}</span>
                <span className="flex-shrink-0 font-mono text-[10px] uppercase tracking-wide text-muted">{it.subtitle}</span>
              </span>
              <span className="block truncate text-[11px] text-muted">{it.blurb}</span>
            </span>
          </button>
        ))}
      </div>
      {active && (
        <div className="hidden w-56 rounded-xl border border-line bg-surface p-3 shadow-lg sm:block">
          <p className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-wide text-muted">Preview</p>
          <div className="pointer-events-none">{active.preview}</div>
        </div>
      )}
    </div>
  );
}
