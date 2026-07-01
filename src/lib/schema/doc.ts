import { z } from 'zod';

// ── Documentation node ────────────────────────────────────────────────────
// A single editable documentation page. Hierarchy is expressed via `parentId`
// (null = top-level). Sibling order is controlled by `order`.

export const DocNodeSchema = z.object({
  /** Stable slug ID — never changes once assigned. Format: my-page-name */
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'ID must be slug format (e.g. getting-started)'),
  title: z.string().min(1, 'Title is required'),
  /** ID of the parent doc, or null for a top-level section */
  parentId: z.string().nullable(),
  /** Sort order among siblings (lower = first) */
  order: z.number().int().nonnegative(),
  /**
   * The whole page, as a serialized BlockNote document. There is one page kind:
   * `body` holds prose *and* structured widget blocks (status, badges, tags,
   * refs, collection, labeled). The old templateId/data split has been retired —
   * legacy keys on disk are simply ignored (z.object strips unknown keys).
   */
  body: z.string(),
  /**
   * Optional hierarchy tint: an OKLCH hue (0–359) that colours this page's row
   * in the docs sidebar. A page with no own hue inherits the nearest coloured
   * ancestor's, softened by depth, so a whole branch reads as one tonal family.
   * null / absent = no own colour (purely inherited). The actual lightness and
   * chroma are fixed by the renderer (src/lib/docs/hierarchyColor.ts) so every
   * hue lands in the theme's comfortable, parchment-friendly band.
   */
  hue: z.number().int().min(0).max(359).nullable().optional(),
});

export type DocNode = z.infer<typeof DocNodeSchema>;

export const DocCollectionSchema = z.array(DocNodeSchema);
export type DocCollection = z.infer<typeof DocCollectionSchema>;

/** A doc node with its resolved children, for rendering a tree. */
export type DocTreeNode = DocNode & { children: DocTreeNode[] };

/** Build a nested tree from a flat collection, sorted by `order` then title. */
export function buildDocTree(docs: DocNode[]): DocTreeNode[] {
  const byId = new Map<string, DocTreeNode>();
  for (const doc of docs) {
    byId.set(doc.id, { ...doc, children: [] });
  }

  const roots: DocTreeNode[] = [];
  for (const node of byId.values()) {
    if (node.parentId && byId.has(node.parentId)) {
      byId.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sort = (nodes: DocTreeNode[]) => {
    nodes.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
    nodes.forEach((n) => sort(n.children));
  };
  sort(roots);

  return roots;
}

/** All ancestor IDs of a doc (nearest parent first). */
export function ancestorIds(docs: DocNode[], id: string): string[] {
  const byId = new Map(docs.map((d) => [d.id, d]));
  const chain: string[] = [];
  let current = byId.get(id);
  while (current?.parentId) {
    chain.push(current.parentId);
    current = byId.get(current.parentId);
  }
  return chain;
}
