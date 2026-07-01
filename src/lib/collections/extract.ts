import {
  LABEL_COLUMN,
  type CollectionItem,
  type CollectionSourceKind,
} from './types';

// ── Pure extraction helpers ───────────────────────────────────────────────
// These turn already-flattened text (lines / a sentence / table rows) into a
// collection's { columns, items }. They are intentionally free of any BlockNote
// or client ('use client') import so they stay server-safe and unit-testable;
// the BlockNote-specific step of flattening a selection into lines/rows lives
// in the client editor.

/** Local slug helper — mirrors slugify() in inline.tsx, kept here so this pure
 *  module never imports the 'use client' inline component. */
function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export type ExtractedCollection = {
  columns: string[];
  items: CollectionItem[];
  sourceKind: CollectionSourceKind;
};

/** Assign a stable, unique slug id to an item, falling back to item-N. */
function makeItemId(seed: string, index: number, taken: Set<string>): string {
  const base = slugify(seed) || `item-${index + 1}`;
  let id = base;
  let n = 2;
  while (taken.has(id)) id = `${base}-${n++}`;
  taken.add(id);
  return id;
}

/** A bullet/numbered list (or any set of lines) → one item per non-empty line. */
export function fromList(lines: string[]): ExtractedCollection {
  const taken = new Set<string>();
  const items = lines
    .map((l) => l.trim())
    .filter(Boolean)
    .map((label, i) => ({ id: makeItemId(label, i, taken), values: { [LABEL_COLUMN]: label } }));
  return { columns: [LABEL_COLUMN], items, sourceKind: 'list' };
}

/** A comma-separated sentence → one item per comma/semicolon-delimited part. */
export function fromInline(text: string): ExtractedCollection {
  const parts = text
    .split(/[,;]/)
    .map((p) => p.trim())
    .filter(Boolean);
  return { ...fromList(parts), sourceKind: 'inline' };
}

/**
 * A table → one item per data row. The first row is treated as the header when
 * it has no empty cells and there is at least one data row; otherwise synthetic
 * `col-N` headers are used and every row becomes an item.
 */
export function fromTable(rows: string[][]): ExtractedCollection {
  const clean = rows
    .map((r) => r.map((c) => c.trim()))
    .filter((r) => r.some((c) => c.length > 0));
  if (clean.length === 0) return { columns: [LABEL_COLUMN], items: [], sourceKind: 'table' };

  const width = Math.max(...clean.map((r) => r.length));
  const headerRow = clean[0];
  const useHeader = clean.length > 1 && headerRow.length === width && headerRow.every((c) => c.length > 0);

  const columns: string[] = [];
  const seen = new Set<string>();
  for (let c = 0; c < width; c++) {
    const raw = useHeader ? headerRow[c] : `col-${c + 1}`;
    let key = slugify(raw) || `col-${c + 1}`;
    let n = 2;
    while (seen.has(key)) key = `${key}-${n++}`;
    seen.add(key);
    columns.push(key);
  }

  const dataRows = useHeader ? clean.slice(1) : clean;
  const taken = new Set<string>();
  const items = dataRows.map((row, i) => {
    const values: Record<string, string> = {};
    columns.forEach((key, c) => { values[key] = row[c] ?? ''; });
    return { id: makeItemId(row[0] ?? `item-${i + 1}`, i, taken), values };
  });

  return { columns, items, sourceKind: 'table' };
}
