import { z } from 'zod';

// ── Collections ───────────────────────────────────────────────────────────
// A collection is a reusable, named list of items extracted from a doc's
// content (a bulleted/numbered list, a table, or a comma-separated sentence).
// Once captured it becomes a first-class record that a specialized page can
// embed by id via a `collection` template field — "a collection widget that
// knows where the reference is."
//
// Follows the same spine as docs/templates: Zod schema first, types derived
// with z.infer, stable slug ids, controlled vocabulary in one place.

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// How the collection's items were captured. Controlled vocabulary — never
// inline these literals elsewhere.
export const COLLECTION_SOURCE_KINDS = ['list', 'table', 'inline'] as const;
export type CollectionSourceKind = (typeof COLLECTION_SOURCE_KINDS)[number];

export const COLLECTION_SOURCE_LABEL: Record<CollectionSourceKind, string> = {
  list: 'List',
  table: 'Table',
  inline: 'Inline (comma-separated)',
};

/** The default column key used for single-column (list/inline) collections. */
export const LABEL_COLUMN = 'label';

export const CollectionItemSchema = z.object({
  /** Stable slug id, unique within the collection. */
  id: z.string().regex(SLUG, 'Item id must be slug format'),
  /** Column key → cell value. A list/inline item just has { label: "…" }. */
  values: z.record(z.string()).default({}),
});
export type CollectionItem = z.infer<typeof CollectionItemSchema>;

export const CollectionSchema = z.object({
  /** Stable slug id — never changes once assigned. */
  id: z.string().regex(SLUG, 'ID must be slug format (e.g. weapons)'),
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  /** Ordered column keys. Single-column collections use [LABEL_COLUMN]. */
  columns: z.array(z.string().min(1)).min(1).default([LABEL_COLUMN]),
  items: z.array(CollectionItemSchema).default([]),
  /** Doc the collection was extracted from, if any (provenance only). */
  sourceDocId: z.string().nullable().default(null),
  /**
   * Id of the BlockNote block the collection was captured from, if any. Used to
   * anchor the in-editor "name this collection" tag and to dedupe a block that
   * has already been captured. Nullable + default keeps existing rows valid.
   */
  sourceBlockId: z.string().nullable().default(null),
  sourceKind: z.enum(COLLECTION_SOURCE_KINDS).default('list'),
});
export type Collection = z.infer<typeof CollectionSchema>;

export const CollectionCollectionSchema = z.array(CollectionSchema);
export type CollectionList = z.infer<typeof CollectionCollectionSchema>;

// ── Value helpers ─────────────────────────────────────────────────────────

/** Primary display text for an item: its label column, else its first value. */
export function itemPrimary(item: CollectionItem, columns: string[]): string {
  const first = columns[0] ?? LABEL_COLUMN;
  return item.values[first] ?? item.values[LABEL_COLUMN] ?? Object.values(item.values)[0] ?? '';
}
