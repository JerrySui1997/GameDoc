// Yjs ⇄ body mapping (the single funnel between the CRDT live-editing layer and
// the canonical on-disk body string). This module is pure and server-safe — it
// imports yjs and the pure block model only, never React — so it runs in the
// collab server, in the editor, and in scripts alike.
//
// Shape of a page's Y.Doc:
//   meta   : Y.Map    — { title, legend? }  (legend = the page color legend)
//   order  : Y.Array  — block ids, in render order
//   blocks : Y.Map    — id → Y.Map(block)
// A block Y.Map always has a `type`. Prose blocks carry `text` as a *Y.Text*
// (so two people typing in one paragraph merge character-by-character); widget
// blocks carry `props` as a Y.Map (per-key last-writer-wins).

import * as Y from 'yjs';
import {
  coerceLayout,
  isWidgetType,
  parseBody,
  parseLegend,
  serializeBlocks,
  type BlockLayout,
  type DocBlock,
  type ProseBlock,
  type ProseType,
  type WidgetType,
} from './blocks';
import { coerceLegend, type PageLegend } from './legend';

export const Y_META = 'meta';
export const Y_ORDER = 'order';
export const Y_BLOCKS = 'blocks';

export type YMeta = Y.Map<unknown>;
export type YOrder = Y.Array<string>;
export type YBlocks = Y.Map<Y.Map<unknown>>;

/** Typed accessors for a page Y.Doc's top-level shared types. */
export function getMeta(doc: Y.Doc): YMeta {
  return doc.getMap(Y_META);
}
export function getOrder(doc: Y.Doc): YOrder {
  return doc.getArray<string>(Y_ORDER);
}
export function getBlocks(doc: Y.Doc): YBlocks {
  return doc.getMap<Y.Map<unknown>>(Y_BLOCKS);
}

/** Build a single block's Y.Map from a plain DocBlock. */
export function makeYBlock(block: DocBlock): Y.Map<unknown> {
  const yb = new Y.Map<unknown>();
  yb.set('type', block.type);
  if (block.layout) yb.set('layout', { ...block.layout });
  if (isWidgetType(block.type) && 'props' in block) {
    const props = new Y.Map<unknown>();
    for (const [k, v] of Object.entries(block.props)) props.set(k, v);
    yb.set('props', props);
  } else if ('text' in block) {
    yb.set('text', new Y.Text(block.text));
    if (block.color) yb.set('color', block.color);
  }
  return yb;
}

/** Convert a single block Y.Map back to a plain DocBlock, or null if malformed. */
export function yBlockToDocBlock(id: string, yb: Y.Map<unknown>): DocBlock | null {
  const type = yb.get('type');
  if (typeof type !== 'string') return null;
  const layout = coerceLayout(yb.get('layout'));
  if (isWidgetType(type)) {
    const yProps = yb.get('props');
    const props: Record<string, unknown> = {};
    if (yProps instanceof Y.Map) {
      for (const [k, v] of yProps.entries()) props[k] = v;
    }
    return layout ? { id, type: type as WidgetType, props, layout } : { id, type: type as WidgetType, props };
  }
  const yText = yb.get('text');
  const text = yText instanceof Y.Text ? yText.toString() : typeof yText === 'string' ? yText : '';
  const prose: ProseBlock = { id, type: type as ProseType, text };
  if (layout) prose.layout = layout;
  const color = yb.get('color');
  if (typeof color === 'string' && color) prose.color = color;
  return prose;
}

/** Read the ordered DocBlocks out of a Y.Doc (skips any dangling order ids). */
export function readDocBlocks(doc: Y.Doc): DocBlock[] {
  const order = getOrder(doc);
  const blocks = getBlocks(doc);
  const out: DocBlock[] = [];
  for (const id of order.toArray()) {
    const yb = blocks.get(id);
    if (!yb) continue;
    const block = yBlockToDocBlock(id, yb);
    if (block) out.push(block);
  }
  return out;
}

/** Whether a Y.Doc has been populated with page content yet. */
export function isYDocEmpty(doc: Y.Doc): boolean {
  return getOrder(doc).length === 0;
}

/**
 * Seed an *empty* Y.Doc from a stored body string (and optional title). No-op if
 * the doc already has blocks, so it's safe to call on every room load — existing
 * CRDT state always wins over the on-disk snapshot.
 */
export function seedYDoc(doc: Y.Doc, body: string, title?: string): void {
  if (!isYDocEmpty(doc)) return;
  const blocks = parseBody(body);
  const legend = parseLegend(body);
  doc.transact(() => {
    const meta = getMeta(doc);
    if (title !== undefined && meta.get('title') === undefined) meta.set('title', title);
    if (legend.length && meta.get('legend') === undefined) {
      meta.set('legend', legend.map((e) => ({ ...e })));
    }
    const yBlocks = getBlocks(doc);
    const order = getOrder(doc);
    for (const block of blocks) {
      yBlocks.set(block.id, makeYBlock(block));
      order.push([block.id]);
    }
  }, 'seed');
}

/** Serialize a Y.Doc's blocks + legend back to the canonical body string. */
export function serializeYDoc(doc: Y.Doc): string {
  return serializeBlocks(readDocBlocks(doc), readLegend(doc));
}

/** Read the collaborative title, or undefined if unset. */
export function readTitle(doc: Y.Doc): string | undefined {
  const t = getMeta(doc).get('title');
  return typeof t === 'string' ? t : undefined;
}

/** Read the collaborative page color legend ([] when unset). */
export function readLegend(doc: Y.Doc): PageLegend {
  return coerceLegend(getMeta(doc).get('legend'));
}

// ── Live mutations (client editor) ─────────────────────────────────────────
// Every local edit is applied inside a transaction tagged with LOCAL_ORIGIN, so
// the editor's Y.UndoManager (which tracks only this origin) undoes the local
// user's own changes and never a teammate's — the Figma-correct behavior.

export const LOCAL_ORIGIN = 'local-edit';

/**
 * Apply the minimal single-region edit that turns `ytext` into `next`. Diffing by
 * common prefix/suffix means a keystroke is one insert/delete op — which is what
 * lets two people type in the same paragraph and have their edits merge rather
 * than clobber. Caller is responsible for wrapping in a transaction.
 */
export function applyTextDiff(ytext: Y.Text, next: string): void {
  const cur = ytext.toString();
  if (cur === next) return;
  const max = Math.min(cur.length, next.length);
  let p = 0;
  while (p < max && cur[p] === next[p]) p++;
  let s = 0;
  while (s < max - p && cur[cur.length - 1 - s] === next[next.length - 1 - s]) s++;
  const delCount = cur.length - p - s;
  if (delCount > 0) ytext.delete(p, delCount);
  const insStr = next.slice(p, next.length - s);
  if (insStr) ytext.insert(p, insStr);
}

/** Diff-apply new text to one prose block's Y.Text (the typing hot path). */
export function ySetBlockText(doc: Y.Doc, id: string, value: string): void {
  const yb = getBlocks(doc).get(id);
  if (!yb) return;
  const ytext = yb.get('text');
  if (!(ytext instanceof Y.Text)) return;
  doc.transact(() => applyTextDiff(ytext, value), LOCAL_ORIGIN);
}

/** Merge a patch into one widget block's props (per-key last-writer-wins). */
export function ySetWidgetProps(doc: Y.Doc, id: string, patch: Record<string, unknown>): void {
  const yb = getBlocks(doc).get(id);
  if (!yb) return;
  const yProps = yb.get('props');
  if (!(yProps instanceof Y.Map)) return;
  doc.transact(() => {
    for (const [k, v] of Object.entries(patch)) yProps.set(k, v);
  }, LOCAL_ORIGIN);
}

/** Patch one block's layout (width / vertical align). A full-width, top-aligned
 *  result is the implicit default and is removed rather than stored. */
export function ySetBlockLayout(doc: Y.Doc, id: string, patch: Partial<BlockLayout>): void {
  const yb = getBlocks(doc).get(id);
  if (!yb) return;
  doc.transact(() => {
    const cur = coerceLayout(yb.get('layout')) ?? { width: 'full', align: 'top' };
    const next = coerceLayout({ ...cur, ...patch });
    if (next) yb.set('layout', next);
    else yb.delete('layout');
  }, LOCAL_ORIGIN);
}

/** Tag (or untag, with null) one prose block with a legend-entry id. */
export function ySetBlockColor(doc: Y.Doc, id: string, color: string | null): void {
  const yb = getBlocks(doc).get(id);
  if (!yb) return;
  doc.transact(() => {
    if (color) yb.set('color', color);
    else yb.delete('color');
  }, LOCAL_ORIGIN);
}

/** Set the collaborative page title. */
export function ySetTitle(doc: Y.Doc, title: string): void {
  doc.transact(() => getMeta(doc).set('title', title), LOCAL_ORIGIN);
}

/** Replace the collaborative page color legend (whole-array last-writer-wins —
 *  legend edits are small and infrequent, so per-entry CRDT merge isn't worth it). */
export function ySetLegend(doc: Y.Doc, legend: PageLegend): void {
  doc.transact(() => getMeta(doc).set('legend', legend.map((e) => ({ ...e }))), LOCAL_ORIGIN);
}

/**
 * Reconcile the Y structures to match a target block list — the funnel for every
 * *structural* edit (split, merge, retype, delete, move, insert). Text is
 * diff-applied (not wholesale-replaced) so a concurrent keystroke in an untouched
 * block survives. The order array is only rewritten when it actually changed.
 */
export function yReconcileBlocks(doc: Y.Doc, target: DocBlock[]): void {
  doc.transact(() => {
    const blocks = getBlocks(doc);
    const order = getOrder(doc);
    const targetIds = target.map((b) => b.id);
    const targetIdSet = new Set(targetIds);

    // Drop removed blocks.
    for (const id of [...blocks.keys()]) {
      if (!targetIdSet.has(id)) blocks.delete(id);
    }

    // Upsert each target block.
    for (const tb of target) {
      const yb = blocks.get(tb.id);
      if (!yb || yb.get('type') !== tb.type) {
        // New block, or its kind/type changed — (re)build from scratch.
        blocks.set(tb.id, makeYBlock(tb));
        continue;
      }
      // Sync layout (width / vertical align): set when present, clear when the
      // target reverted to the implicit full-width default.
      if (tb.layout) {
        const cur = yb.get('layout');
        const same = cur && typeof cur === 'object'
          && (cur as BlockLayout).width === tb.layout.width
          && (cur as BlockLayout).align === tb.layout.align;
        if (!same) yb.set('layout', { ...tb.layout });
      } else if (yb.get('layout') !== undefined) {
        yb.delete('layout');
      }
      if (isWidgetType(tb.type) && 'props' in tb) {
        const yProps = yb.get('props');
        if (yProps instanceof Y.Map) {
          for (const k of [...yProps.keys()]) {
            if (!(k in tb.props)) yProps.delete(k);
          }
          for (const [k, v] of Object.entries(tb.props)) {
            if (yProps.get(k) !== v) yProps.set(k, v);
          }
        }
      } else if ('text' in tb) {
        const ytext = yb.get('text');
        if (ytext instanceof Y.Text) applyTextDiff(ytext, tb.text);
        // Sync the legend-color tag: set when present, clear when removed.
        if (tb.color) {
          if (yb.get('color') !== tb.color) yb.set('color', tb.color);
        } else if (yb.get('color') !== undefined) {
          yb.delete('color');
        }
      }
    }

    // Rewrite order only if the sequence actually differs.
    const cur = order.toArray();
    const same = cur.length === targetIds.length && cur.every((id, i) => id === targetIds[i]);
    if (!same) {
      order.delete(0, order.length);
      order.insert(0, targetIds);
    }
  }, LOCAL_ORIGIN);
}
