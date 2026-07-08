// Inline formatting marks in prose — bold/italic/code, layered on top of mentions.
//
// Like @mentions (see ./mentions), a mark is just literal markdown punctuation
// sitting in a prose block's plain text (`**bold**`, `*italic*`, `` `code` ``) —
// nothing new is persisted, and the text still round-trips through the body
// funnel and the clipboard untouched. `splitInline` layers mark segmentation on
// top of mention segmentation rather than merging two independent scans: it
// asks `splitMentions` to carve out the mentions first, then only looks for
// marks inside the plain-text runs left over. Marks never nest into or across a
// mention token — a deliberate scope limit that avoids a much harder
// overlapping-interval merge nobody actually needs.
//
// Pure and server-safe (no React) — used by the editor's overlay renderer.

import { splitMentions, type MentionSegment } from './mentions';

export type InlineMark = 'bold' | 'italic' | 'code';

export type InlineSegment =
  | { kind: 'text'; text: string; raw: string; start: number; marks: InlineMark[] }
  | { kind: 'mention'; id: string; raw: string; start: number };

type ClaimedRange = { start: number; end: number; mark: InlineMark };

// Each mark's opening/closing marker length, symmetric on both sides
// (`**`/`**`, `*`/`*`, `` ` ``/`` ` ``) — used to strip markers off the raw span
// to get the mark's inner text.
const MARKER_LEN: Record<InlineMark, number> = { code: 1, bold: 2, italic: 1 };

const CODE_RE = /`([^`]+)`/g;
const BOLD_RE = /\*\*([^*]+)\*\*/g;
const ITALIC_RE = /\*([^*]+)\*/g;

function overlapsAny(start: number, end: number, ranges: ClaimedRange[]): boolean {
  return ranges.some((r) => start < r.end && end > r.start);
}

/**
 * Claim mark ranges over one plain-text run, highest precedence first: code
 * spans claim first (so `` `**not bold**` `` stays literal inside the code),
 * then bold spans that don't overlap a claimed code span, then italic spans
 * that don't overlap code or bold. This intentionally cannot express a combined
 * `***bold italic***` span — that falls through as an unclaimed leading/trailing
 * `*` plus a bold span, a readable-enough degradation for a case nobody asked
 * for. Returned in left-to-right order for the caller's single walk.
 */
function claimMarks(text: string): ClaimedRange[] {
  const claimed: ClaimedRange[] = [];

  for (const m of text.matchAll(CODE_RE)) {
    const start = m.index ?? 0;
    claimed.push({ start, end: start + m[0].length, mark: 'code' });
  }
  for (const m of text.matchAll(BOLD_RE)) {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    if (!overlapsAny(start, end, claimed)) claimed.push({ start, end, mark: 'bold' });
  }
  for (const m of text.matchAll(ITALIC_RE)) {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    if (!overlapsAny(start, end, claimed)) claimed.push({ start, end, mark: 'italic' });
  }

  claimed.sort((a, b) => a.start - b.start);
  return claimed;
}

/** Sub-segment one plain-text run (absolute offset `base` in the full string)
 *  into marked/unmarked text segments, walking the claimed ranges left to right. */
function splitTextRun(text: string, base: number): InlineSegment[] {
  const claimed = claimMarks(text);
  if (!claimed.length) {
    return text ? [{ kind: 'text', text, raw: text, start: base, marks: [] }] : [];
  }

  const out: InlineSegment[] = [];
  let cursor = 0;
  for (const range of claimed) {
    if (range.start > cursor) {
      const gap = text.slice(cursor, range.start);
      out.push({ kind: 'text', text: gap, raw: gap, start: base + cursor, marks: [] });
    }
    const raw = text.slice(range.start, range.end);
    const n = MARKER_LEN[range.mark];
    out.push({ kind: 'text', text: raw.slice(n, raw.length - n), raw, start: base + range.start, marks: [range.mark] });
    cursor = range.end;
  }
  if (cursor < text.length) {
    const gap = text.slice(cursor);
    out.push({ kind: 'text', text: gap, raw: gap, start: base + cursor, marks: [] });
  }
  return out;
}

function isMention(seg: MentionSegment): seg is Extract<MentionSegment, { kind: 'mention' }> {
  return seg.kind === 'mention';
}

/** Split a prose string into text-with-marks and mention segments, in order,
 *  each carrying its offset in the raw text (same contract as `splitMentions`). */
export function splitInline(text: string): InlineSegment[] {
  const out: InlineSegment[] = [];
  for (const seg of splitMentions(text)) {
    if (isMention(seg)) out.push(seg);
    else out.push(...splitTextRun(seg.text, seg.start));
  }
  return out;
}

// ── Selection toggling (format toolbar / keyboard shortcuts) ────────────────
// Wrap, or un-wrap, a text range with a mark's markers — toggle-aware, so
// applying the same mark to an already-marked range removes it instead of
// double-wrapping. Two ways a range can already read as "marked": the
// selection itself is the wrapped span including its markers (re-selecting
// after the first toggle re-selects the whole `**word**`, since that's what a
// generic caret-preserving diff naturally produces — see PageEditor's
// mark-mode caret effect), or just the markers sitting immediately outside an
// inner-text-only selection. Anything else gets wrapped. Pure text math — the
// caller commits the result and places the caret.
const MARKERS: Record<InlineMark, string> = { bold: '**', italic: '*', code: '`' };

export function toggleInlineMark(
  text: string,
  start: number,
  end: number,
  mark: InlineMark,
): { text: string; caret: number } {
  const marker = MARKERS[mark];
  const n = marker.length;
  const inner = text.slice(start, end);
  const before = text.slice(0, start);
  const after = text.slice(end);

  if (inner.length >= 2 * n && inner.startsWith(marker) && inner.endsWith(marker)) {
    const unwrapped = inner.slice(n, inner.length - n);
    return { text: before + unwrapped + after, caret: start + unwrapped.length };
  }
  if (before.endsWith(marker) && after.startsWith(marker)) {
    const newBefore = before.slice(0, before.length - n);
    const newAfter = after.slice(n);
    return { text: newBefore + inner + newAfter, caret: newBefore.length + inner.length };
  }
  return { text: before + marker + inner + marker + after, caret: start + n + inner.length + n };
}
