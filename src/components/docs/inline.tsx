'use client';

import { useEffect, useRef, useState } from 'react';

/** Convert a free-form title into a slug ID (e.g. "My Page!" -> "my-page"). */
export function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * Inline single-field text prompt — replaces window.prompt(), which Next.js
 * does not support during rendering. Submits on Enter, cancels on Escape.
 */
export function InlinePrompt({
  placeholder,
  submitLabel = 'Add',
  onSubmit,
  onCancel,
}: {
  placeholder: string;
  submitLabel?: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function submit() {
    const trimmed = value.trim();
    if (trimmed) onSubmit(trimmed);
  }

  return (
    <div className="flex items-center gap-1">
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); submit(); }
          if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
        }}
        placeholder={placeholder}
        className="min-w-0 flex-1 rounded-md border border-line px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brass"
      />
      <button
        type="button"
        onClick={submit}
        className="rounded-md bg-ink px-2 py-1 text-xs font-semibold text-white hover:bg-ink-soft"
      >
        {submitLabel}
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="rounded-md border border-line px-2 py-1 text-xs font-semibold text-ink hover:bg-canvas"
      >
        Cancel
      </button>
    </div>
  );
}
