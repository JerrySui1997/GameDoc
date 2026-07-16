'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useDocs } from '@/components/docs/DocsProvider';
import { useTemplates } from '@/components/templates/TemplatesProvider';
import { slugify } from '@/components/docs/inline';
import { styleToBlocks } from '@/components/docs/blocks/presets';
import { serializeBlocks } from '@/lib/docs/blocks';
import { momentScaffoldBody } from '@/lib/docs/momentScaffold';

// A built-in style option (alongside saved templates) that seeds the "Moment
// story" section stack. slugify() never emits ':', so this id can't collide
// with a user-saved template id.
const MOMENT_STYLE_ID = 'builtin:moment';

/**
 * Create a page in the tree. Every page is the same kind; an optional "style"
 * just seeds the new page's body with that preset's widget blocks (apply-once —
 * the page then owns them).
 */
export function NodeCreator({
  parentId,
  basePath = '/docs',
  onDone,
  onCancel,
}: {
  parentId: string | null;
  /** Personal spaces (src/app/(personal)/app) pass '/app/docs'. */
  basePath?: string;
  onDone?: () => void;
  onCancel: () => void;
}) {
  const { createDoc } = useDocs();
  const { templates } = useTemplates();
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [styleId, setStyleId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  async function submit() {
    const trimmed = title.trim();
    const id = slugify(trimmed);
    if (!id) { setError('Enter a title with at least one letter or number'); return; }
    setBusy(true);
    setError(null);
    try {
      // A chosen style seeds the body with its widget blocks; else a blank page.
      const style = styleId ? templates.find((t) => t.id === styleId) : undefined;
      const body =
        styleId === MOMENT_STYLE_ID ? momentScaffoldBody() : style ? serializeBlocks(styleToBlocks(style)) : '';
      const created = await createDoc({ id, title: trimmed, parentId, body });
      onDone?.();
      router.push(`${basePath}/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create page');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <input
        ref={inputRef}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); submit(); }
          if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
        }}
        placeholder="New page title"
        className="w-full rounded-md border border-line px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brass"
      />
      <select
        value={styleId}
        onChange={(e) => setStyleId(e.target.value)}
        className="w-full rounded-md border border-line px-2 py-1 text-xs text-muted focus:outline-none focus:ring-2 focus:ring-brass"
      >
        <option value="">Blank page</option>
        <option value={MOMENT_STYLE_ID}>Start from Moment story</option>
        {templates.map((t) => <option key={t.id} value={t.id}>Start from {t.name}</option>)}
      </select>
      <div className="flex gap-1">
        <button type="button" onClick={submit} disabled={busy} className="rounded-md bg-ink px-2 py-1 text-xs font-semibold text-white hover:bg-ink-soft disabled:opacity-50">
          Create
        </button>
        <button type="button" onClick={onCancel} className="rounded-md border border-line px-2 py-1 text-xs font-semibold text-ink hover:bg-canvas">
          Cancel
        </button>
      </div>
      {error && <p className="text-xs text-oxblood">{error}</p>}
    </div>
  );
}
