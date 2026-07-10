'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { useDocs } from '@/components/docs/DocsProvider';
import { buildMentionIndex } from '@/lib/docs/mentionTarget';
import { findMentionQuery, splitMentions } from '@/lib/docs/mentions';
import { MentionChip, MentionMenu, MentionPanel, inlineMentionClass, mentionRank } from '@/components/docs/Mentions';

// A single-field `@mention`-aware input/textarea for widget text (Labeled's
// value, Hero's subtitle, a Cards card body, …) — the same `@` typeahead and
// chip/mark overlay prose gets (see PageEditor's ProseView + Mentions.tsx),
// scoped down to one plain local value instead of a Yjs-backed block. Widget
// props commit as a whole-value overwrite on blur (ySetWidgetProps), so this
// can't reuse ProseView's live per-keystroke Yjs diffing — and it's mention-only
// (no bold/italic/code: those are a prose-block concept). Sources its own
// `useDocs()` + mention index, matching the established `RefListEditor`
// precedent, so the widget host's `{block, onChange}` contract never changes.

type FieldMention = { start: number; query: string; index: number };

export function MentionField({ value, onCommit, multiline, placeholder, className }: {
  value: string;
  onCommit: (next: string) => void;
  multiline?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const { docs } = useDocs();
  const mentionIndex = useMemo(() => buildMentionIndex(docs), [docs]);

  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);

  const [focused, setFocused] = useState(false);
  const [mention, setMention] = useState<FieldMention | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const pendingCaret = useRef<number | null>(null);
  const elRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);

  // Re-place the caret after picking a mention rewrites `v` out from under the
  // field — the same deferred-placement idea as PageEditor's `focusReq`, scoped
  // to this one field instead of a shared block registry.
  useLayoutEffect(() => {
    if (pendingCaret.current == null) return;
    const c = pendingCaret.current;
    pendingCaret.current = null;
    elRef.current?.setSelectionRange(c, c);
  }, [v]);

  // Candidates for the active `@query`: filtered by title/id, best match first,
  // capped to a short list — same shape as PageEditor's own `mentionItems`.
  const mentionItems = useMemo(() => {
    if (!mention) return [];
    const q = mention.query.toLowerCase();
    const scored = docs
      .map((d) => ({ id: d.id, title: d.title }))
      .filter((d) => !q || `${d.title} ${d.id}`.toLowerCase().includes(q));
    scored.sort((a, b) => mentionRank(b, q) - mentionRank(a, q));
    return scored.slice(0, 8);
  }, [mention, docs]);
  const mentionIdx = mention ? Math.min(mention.index, Math.max(0, mentionItems.length - 1)) : 0;

  function handleChange(e: ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) {
    const next = e.target.value;
    const caret = e.target.selectionStart ?? next.length;
    setV(next);
    const mq = findMentionQuery(next, caret);
    setMention(mq ? { start: mq.start, query: mq.query, index: 0 } : null);
  }

  /** Replace the active `@query` token with `@<id> ` — the same text-splice as
   *  PageEditor's `pickMention`, minus the Yjs/live-DOM-caret indirection (this
   *  field has no remote edits to race against). */
  function pick(id: string) {
    if (!mention) return;
    const before = v.slice(0, mention.start);
    const after = v.slice(mention.start + 1 + mention.query.length);
    const token = `@${id} `;
    pendingCaret.current = before.length + token.length;
    setV(before + token + after);
    setMention(null);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) {
    if (!mention || mentionItems.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setMention((m) => (m ? { ...m, index: Math.min(mentionIdx + 1, mentionItems.length - 1) } : m)); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setMention((m) => (m ? { ...m, index: Math.max(mentionIdx - 1, 0) } : m)); return; }
    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); const it = mentionItems[mentionIdx]; if (it) pick(it.id); return; }
    if (e.key === 'Escape') { e.preventDefault(); setMention(null); return; }
  }

  /** Resume editing from the idle chip overlay. Simpler than ProseView's
   *  pixel-to-caret mapping (`rawCaretFromPoint`): these are short, single-
   *  purpose fields, not long paragraphs, so landing at the end reads fine. */
  function enterEdit() {
    const el = elRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }

  const segments = splitMentions(v);
  const canChip = segments.some((s) => s.kind === 'mention');
  const chipMode = canChip && !focused; // titled chips; raw text hidden under them
  const markMode = canChip && focused; // in-place highlight; raw text stays visible

  const fieldClass = className ?? '';
  const commonProps = {
    value: v,
    placeholder,
    spellCheck: true,
    onChange: handleChange,
    onKeyDown: handleKeyDown,
    onFocus: () => setFocused(true),
    onBlur: () => { setFocused(false); setMention(null); if (v !== value) onCommit(v); },
    // While the chip overlay is up, hide the raw text under it so the `@id`
    // token never double-paints behind a chip (see ProseView's textarea).
    className: `${fieldClass} ${chipMode ? 'text-transparent caret-transparent' : ''}`,
  };

  return (
    <div className="relative w-full">
      {multiline ? (
        <textarea {...commonProps} ref={(el) => { elRef.current = el; }} rows={3} />
      ) : (
        <input {...commonProps} ref={(el) => { elRef.current = el; }} />
      )}
      {markMode && (
        <div
          aria-hidden
          className={`pointer-events-none absolute left-0 right-0 top-0 whitespace-pre-wrap break-words text-transparent ${fieldClass}`}
        >
          {segments.map((seg, i) =>
            seg.kind === 'mention' ? (
              <span key={i} className={inlineMentionClass(mentionIndex.get(seg.id) ?? null)}>{seg.raw}</span>
            ) : (
              <span key={i}>{seg.text}</span>
            ),
          )}
        </div>
      )}
      {chipMode && (
        <div
          className={`absolute left-0 right-0 top-0 cursor-text whitespace-pre-wrap break-words ${fieldClass}`}
          onMouseDown={(e) => { e.preventDefault(); enterEdit(); }}
        >
          {segments.map((seg, i) =>
            seg.kind === 'mention' ? (
              <MentionChip key={i} id={seg.id} raw={seg.raw} target={mentionIndex.get(seg.id) ?? null} onOpen={setOpenId} />
            ) : (
              <span key={i}>{seg.text}</span>
            ),
          )}
        </div>
      )}
      {mention && mentionItems.length > 0 && (
        <MentionMenu
          items={mentionItems}
          activeIndex={mentionIdx}
          onHover={(i) => setMention((m) => (m ? { ...m, index: i } : m))}
          onPick={(i) => { const it = mentionItems[i]; if (it) pick(it.id); }}
        />
      )}
      {openId && (
        <MentionPanel id={openId} target={mentionIndex.get(openId) ?? null} onClose={() => setOpenId(null)} />
      )}
    </div>
  );
}
