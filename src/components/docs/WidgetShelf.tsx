'use client';

import { useState } from 'react';
import { useTemplates } from '@/components/templates/TemplatesProvider';
import { slugify } from '@/components/docs/inline';
import { isWidgetBlock, type DocBlock, type WidgetType } from '@/lib/docs/blocks';
import { WIDGET_LIST } from './widgets/registry';
import { WIDGET_CATALOG } from './catalog';
import { fieldToWidget } from './blocks/presets';
import type { PageTemplate, TemplateField } from '@/lib/templates/types';

// The shelf: a side panel of widget tools and named "page styles" (presets,
// reusing the templates store). Tools insert a single widget; a style inserts
// its whole arrangement; "Save as style" captures the page's current widgets
// into a reusable preset.

/** A page's current widget block → a preset field (captures structure, not values). */
function widgetToField(block: { type: string; props: Record<string, unknown> }, i: number): TemplateField | null {
  const label = String(block.props.label ?? `Field ${i + 1}`);
  const key = slugify(label) || `field-${i + 1}`;
  switch (block.type) {
    case 'labeled': return { key, label, kind: block.props.multiline ? 'longtext' : 'text', highlight: !!block.props.highlight };
    case 'statusBadge': {
      const value = String(block.props.value ?? '');
      return { key, label, kind: 'select', options: value ? [value] : [], toneMap: value ? { [value]: String(block.props.tone ?? 'slate') } : undefined };
    }
    case 'badges': return { key, label, kind: 'badges' };
    case 'tags': return { key, label, kind: 'tags', tagsTone: String(block.props.tone ?? 'slate') };
    case 'refs': return { key, label, kind: 'refs' };
    case 'collection': return { key, label, kind: 'collection' };
    default: return null;
  }
}

export function WidgetShelf({
  blocks,
  onInsertWidget,
  onInsertBlocks,
}: {
  blocks: DocBlock[];
  onInsertWidget: (type: WidgetType) => void;
  onInsertBlocks: (blocks: DocBlock[]) => void;
}) {
  const { templates, createTemplate } = useTemplates();
  const [open, setOpen] = useState(true);
  const [savingName, setSavingName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function applyStyle(template: PageTemplate) {
    const widgets = template.fields.map(fieldToWidget);
    if (widgets.length > 0) onInsertBlocks(widgets);
  }

  async function saveAsStyle() {
    const name = (savingName ?? '').trim();
    const id = slugify(name);
    if (!id) { setError('Name needs a letter or number'); return; }
    if (templates.some((t) => t.id === id)) { setError('A style with that name exists'); return; }
    const fields = blocks
      .filter(isWidgetBlock)
      .map((b, i) => widgetToField(b, i))
      .filter((f): f is TemplateField => f !== null);
    if (fields.length === 0) { setError('Add some widgets first'); return; }
    try {
      await createTemplate({ id, name, badgeKey: null, fields });
      setSavingName(null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save style');
    }
  }

  return (
    <aside className="w-56 shrink-0">
      <div className="sticky top-4 space-y-4 rounded-xl border border-line bg-surface p-3">
        <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between font-mono text-[11px] font-semibold uppercase tracking-wide text-muted">
          Shelf <span className="text-muted">{open ? '▾' : '▸'}</span>
        </button>

        {open && (
          <>
            <div className="space-y-1">
              <p className="px-1 font-mono text-[10px] font-semibold uppercase tracking-wide text-muted">Widgets</p>
              {WIDGET_LIST.map((def) => {
                const meta = WIDGET_CATALOG[def.type];
                return (
                  // `group` + `relative` so the preview popover appears on hover,
                  // positioned to the left of the shelf where there's room.
                  <div key={def.type} className="group relative">
                    <button
                      onClick={() => onInsertWidget(def.type)}
                      className="flex w-full items-center gap-2 rounded-lg border border-line px-2 py-1.5 text-left text-xs font-medium text-ink hover:border-brass hover:bg-brass-soft"
                    >
                      <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center text-muted group-hover:text-brass">
                        {meta.icon}
                      </span>
                      <span className="truncate">{def.title}</span>
                    </button>
                    {/* Popup sample — what the widget renders as, on hover. */}
                    <div className="pointer-events-none absolute right-full top-0 z-30 mr-2 hidden w-56 rounded-xl border border-line bg-surface p-3 shadow-xl group-hover:block">
                      <p className="text-xs font-semibold text-ink">{def.title}</p>
                      <p className="mt-0.5 text-[11px] leading-snug text-muted">{meta.blurb}</p>
                      <div className="mt-2 border-t border-line-soft pt-2">{meta.preview}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="space-y-1">
              <p className="px-1 font-mono text-[10px] font-semibold uppercase tracking-wide text-muted">Page styles</p>
              {templates.length === 0 && <p className="px-1 text-[11px] text-muted">No styles yet — build a page and save it as one.</p>}
              {templates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => applyStyle(t)}
                  title={`Insert the ${t.name} layout`}
                  className="block w-full rounded-lg border border-line px-2.5 py-1.5 text-left text-xs font-medium text-ink hover:border-brass hover:bg-brass-soft"
                >
                  ⊞ {t.name}
                </button>
              ))}
            </div>

            <div className="space-y-1.5 border-t border-line-soft pt-3">
              {savingName === null ? (
                <button onClick={() => { setSavingName(''); setError(null); }} className="w-full rounded-lg border border-dashed border-line py-1.5 text-xs font-medium text-muted hover:border-brass hover:text-ink">
                  Save page as style
                </button>
              ) : (
                <div className="space-y-1.5">
                  <input
                    autoFocus
                    value={savingName}
                    onChange={(e) => { setSavingName(e.target.value); setError(null); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') saveAsStyle(); if (e.key === 'Escape') setSavingName(null); }}
                    placeholder="Style name"
                    className="w-full rounded-md border border-line px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-brass"
                  />
                  <div className="flex gap-1">
                    <button onClick={saveAsStyle} className="rounded-md bg-ink px-2 py-1 text-xs font-semibold text-white hover:bg-ink-soft">Save</button>
                    <button onClick={() => setSavingName(null)} className="rounded-md border border-line px-2 py-1 text-xs font-semibold text-ink hover:bg-canvas">Cancel</button>
                  </div>
                </div>
              )}
              {error && <p className="text-[11px] text-oxblood">{error}</p>}
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
