import { z } from 'zod';

// ── Reference Image Board data model ────────────────────────────────────────
// A board is a shared, reusable named entity (like a Collection) — created
// once, then embedded into any number of pages via the ImageBoard widget's
// board picker. Editing the board updates every embed, since the widget only
// ever stores a pointer (`boardId`) and resolves the live board at render
// time. Loose-but-validated: every field self-heals with `.catch(...)` so
// hand-edited JSON always parses.

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const BoardImageSchema = z.object({
  id: z.string().catch(''),
  filename: z.string().catch(''), // on-disk name under images/<boardId>/, e.g. "<id>.webp"
  caption: z.string().catch(''),
  width: z.number().int().min(1).catch(1),
  height: z.number().int().min(1).catch(1),
  createdAt: z.string().catch(''),
});
export type BoardImage = z.infer<typeof BoardImageSchema>;

export const BoardSchema = z.object({
  id: z.string().regex(SLUG, 'ID must be slug format (e.g. forest-ruins)'),
  name: z.string().min(1, 'Name is required'),
  description: z.string().catch(''),
  images: z.array(BoardImageSchema).catch([]),
  createdAt: z.string().catch(''),
});
export type Board = z.infer<typeof BoardSchema>;

export const BoardListSchema = z.array(BoardSchema);
export type BoardList = z.infer<typeof BoardListSchema>;

let imageSeq = 0;
/** Unique-enough id for an image within a board. */
export function makeImageId(): string {
  imageSeq += 1;
  return `img-${Date.now().toString(36)}-${imageSeq.toString(36)}`;
}
