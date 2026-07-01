// @mentions in prose — the "soft" semantic layer.
//
// A mention is the plain-text token `@<page-id>` embedded in a prose block's
// text (e.g. "the pier where @nightmanul first appears"). Because it's just
// text, it round-trips through the body funnel untouched — the editor stays
// plain-text, nothing new is persisted — and the doc graph lifts each mention
// into a `mentions` edge. That's what lets the graph fill in from the prose you
// already write, not only from widgets.
//
// Pure and server-safe (no React): used by the graph builder and the editor's
// autocomplete alike. A page id is a slug (see DocNodeSchema): lowercase
// letters/digits, hyphen-separated.

// `@` + a slug, where the `@` is at the start or follows a non-word character —
// so `me@example` / `a@b` (emails, handles) never trigger a mention.
const MENTION_RE = /(?:^|[^A-Za-z0-9_])@([a-z0-9]+(?:-[a-z0-9]+)*)/g;

/** Every page id mentioned in a prose string, first-seen order, de-duplicated. */
export function extractMentionIds(text: string): string[] {
  if (!text.includes('@')) return [];
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(MENTION_RE)) {
    const id = m[1];
    if (!seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

// ── Segmentation (for chip rendering) ────────────────────────────────────────
// Split a prose string into an ordered run of plain-text and mention segments so
// the editor can paint each `@page-id` as a styled chip while leaving the rest as
// text. Every segment carries `start`, its offset in the *raw* text — that's what
// lets a click on the rendered overlay map back to an exact textarea caret index
// (the rendered chip may show a page's title, a different length than its slug, so
// only the raw offsets are trustworthy). Pure: no React, same token rule as above.

export type MentionSegment =
  | { kind: 'text'; text: string; start: number }
  | { kind: 'mention'; id: string; raw: string; start: number };

export function splitMentions(text: string): MentionSegment[] {
  if (!text.includes('@')) return text ? [{ kind: 'text', text, start: 0 }] : [];
  const segs: MentionSegment[] = [];
  let last = 0;
  for (const m of text.matchAll(MENTION_RE)) {
    const id = m[1];
    // m[0] is `<optional non-word char>@<id>`; the `@` sits id.length+1 from its end.
    const at = (m.index ?? 0) + m[0].length - (id.length + 1);
    if (at > last) segs.push({ kind: 'text', text: text.slice(last, at), start: last });
    segs.push({ kind: 'mention', id, raw: `@${id}`, start: at });
    last = at + id.length + 1;
  }
  if (last < text.length) segs.push({ kind: 'text', text: text.slice(last), start: last });
  return segs;
}

// ── Autocomplete trigger ─────────────────────────────────────────────────────
// While the user types, find the `@query` token the caret currently sits in so
// the editor can show a page picker. The query is the run of non-whitespace
// characters after an `@` that is itself at line start or preceded by
// whitespace. Returns null when the caret isn't inside such a token.

export type MentionQuery = { start: number; query: string };

export function findMentionQuery(text: string, caret: number): MentionQuery | null {
  let i = caret - 1;
  while (i >= 0 && !/\s/.test(text[i]) && text[i] !== '@') i--;
  if (i < 0 || text[i] !== '@') return null;
  const before = i > 0 ? text[i - 1] : '';
  if (before && /[A-Za-z0-9_]/.test(before)) return null; // mid-word @ (email/handle), not a mention
  return { start: i, query: text.slice(i + 1, caret) };
}
