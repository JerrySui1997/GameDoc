'use client';

import { useEffect, useState } from 'react';

// Shared bits for the custom widget blocks. Each widget block stores its
// structured value as a JSON string prop (BlockNote block props are
// primitive-only: string | number | boolean), parsed on render here.

export const valueClass =
  'w-full rounded-lg border border-line px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brass';

/** Safe JSON parse with a fallback (props are stored as JSON strings). */
export function parseJson<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== 'string') return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/**
 * Inline label editor. Uses local state and commits on blur/Enter so editing a
 * BlockNote block prop doesn't re-render (and steal focus) on every keystroke.
 */
export function BlockLabel({ value, onCommit }: { value: string; onCommit: (next: string) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <input
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => { if (v !== value) onCommit(v); }}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
      placeholder="Label"
      className="w-28 shrink-0 rounded border border-transparent bg-transparent pt-0.5 font-mono text-xs font-semibold uppercase tracking-wide text-muted hover:border-line focus:border-brass focus:bg-surface focus:text-ink focus:outline-none"
    />
  );
}
