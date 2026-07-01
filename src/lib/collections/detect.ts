import { fromList, fromInline, fromTable, type ExtractedCollection } from './extract';

// ── Auto-detection of collection candidates ───────────────────────────────
// Scans a document for content that could become a Collection — contiguous
// list runs, tables, and comma/semicolon-separated sentences — and returns one
// candidate per detected structure, anchored to the block it came from.
//
// Like extract.ts this module is intentionally pure and server-safe: it never
// imports BlockNote or any 'use client' code. The client editor flattens its
// BlockNote blocks into FlatBlock[] (reusing inlineToText/tableToRows) and hands
// them here, so detection logic stays unit-testable and shared.

/** Minimal, BlockNote-agnostic view of a block needed for detection. */
export type FlatBlock = {
  /** BlockNote block id (its `data-id` in the DOM) — used to anchor the tag. */
  id: string;
  /** Block type, e.g. 'paragraph' | 'bulletListItem' | 'numberedListItem' | 'table'. */
  type: string;
  /** Flattened inline text of the block ('' for tables). */
  text: string;
  /** Table rows, only present for table blocks. */
  rows?: string[][];
};

export type CollectionCandidate = {
  /** Block the candidate is anchored to (first block of a list run). */
  anchorBlockId: string;
  draft: ExtractedCollection;
};

const LIST_TYPES = new Set(['bulletListItem', 'numberedListItem', 'checkListItem']);

/** A run of >= this many list items is worth offering as a collection. */
const MIN_LIST_ITEMS = 2;
/** A sentence with >= this many delimited parts is worth offering. */
const MIN_INLINE_PARTS = 2;

function countDelimited(text: string): number {
  return text.split(/[,;]/).map((p) => p.trim()).filter(Boolean).length;
}

/**
 * Find every collection-izable structure in a flattened document. Contiguous
 * list items collapse into a single candidate anchored to the run's first
 * block; each table is its own candidate; a delimiter-bearing paragraph becomes
 * an inline candidate.
 */
export function detectCandidates(blocks: FlatBlock[]): CollectionCandidate[] {
  const out: CollectionCandidate[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];

    if (block.type === 'table') {
      const draft = fromTable(block.rows ?? []);
      if (draft.items.length > 0) out.push({ anchorBlockId: block.id, draft });
      continue;
    }

    if (LIST_TYPES.has(block.type)) {
      // Greedily consume the contiguous run of list items.
      const run: FlatBlock[] = [];
      let j = i;
      while (j < blocks.length && LIST_TYPES.has(blocks[j].type)) {
        run.push(blocks[j]);
        j++;
      }
      i = j - 1; // skip past the consumed run
      const lines = run.map((b) => b.text).filter((t) => t.trim());
      if (lines.length >= MIN_LIST_ITEMS) {
        out.push({ anchorBlockId: run[0].id, draft: fromList(lines) });
      }
      continue;
    }

    // A single paragraph that reads as a comma/semicolon-separated sentence.
    if (block.text.trim() && countDelimited(block.text) >= MIN_INLINE_PARTS) {
      out.push({ anchorBlockId: block.id, draft: fromInline(block.text) });
    }
  }

  return out;
}
