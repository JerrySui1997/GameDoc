'use client';

import { useState } from 'react';
import { useDocs } from '@/components/docs/DocsProvider';
import { useCollections } from '@/components/collections/CollectionsProvider';
import { MentionMenu, mentionRank } from '@/components/docs/Mentions';
import {
  asText,
  asStringList,
  asBadges,
  emptyValue,
  TONES,
  type PageTemplate,
  type TemplateField,
  type Badge,
} from '@/lib/templates/types';

const inputClass =
  'w-full rounded-lg border border-line px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brass';

// ── Per-kind field editors ────────────────────────────────────────────────

function StringListEditor({
  values,
  onChange,
}: {
  values: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState('');
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1.5">
        {values.map((v, i) => (
          <span key={i} className="inline-flex items-center gap-1 rounded border border-line bg-surface px-2 py-0.5 text-xs text-ink">
            {v}
            <button type="button" onClick={() => onChange(values.filter((_, j) => j !== i))} className="text-muted hover:text-oxblood">×</button>
          </span>
        ))}
      </div>
      <div className="flex gap-1">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && draft.trim()) { e.preventDefault(); onChange([...values, draft.trim()]); setDraft(''); }
          }}
          placeholder="Add value, press Enter"
          className={inputClass}
        />
      </div>
    </div>
  );
}

function BadgeListEditor({
  values,
  onChange,
}: {
  values: Badge[];
  onChange: (next: Badge[]) => void;
}) {
  const [draft, setDraft] = useState('');
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1.5">
        {values.map((b, i) => (
          <span key={i} className="inline-flex items-center gap-1 rounded border border-line bg-surface px-2 py-0.5 text-xs text-ink">
            {b.label}
            <select
              value={b.tone ?? 'slate'}
              onChange={(e) => onChange(values.map((x, j) => (j === i ? { ...x, tone: e.target.value } : x)))}
              className="bg-transparent text-[10px] text-muted focus:outline-none"
            >
              {TONES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <button type="button" onClick={() => onChange(values.filter((_, j) => j !== i))} className="text-muted hover:text-oxblood">×</button>
          </span>
        ))}
      </div>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && draft.trim()) { e.preventDefault(); onChange([...values, { label: draft.trim(), tone: 'slate' }]); setDraft(''); }
        }}
        placeholder="Add badge label, press Enter"
        className={inputClass}
      />
    </div>
  );
}

function RefListEditor({
  values,
  onChange,
}: {
  values: string[];
  onChange: (next: string[]) => void;
}) {
  const { docs, getById } = useDocs();
  const candidates = docs.filter((d) => !values.includes(d.id));

  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const q = query.trim().toLowerCase();
  const items = candidates
    .filter((d) => !q || `${d.title} ${d.id}`.toLowerCase().includes(q))
    .sort((a, b) => mentionRank(b, q) - mentionRank(a, q))
    .slice(0, 8)
    .map((d) => ({ id: d.id, title: d.title }));
  const idx = Math.min(activeIndex, Math.max(0, items.length - 1));

  const pick = (id: string) => {
    onChange([...values, id]);
    setQuery('');
    setActiveIndex(0);
  };

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1.5">
        {values.map((id) => (
          <span key={id} className="inline-flex items-center gap-1 rounded border border-line bg-surface px-2 py-0.5 text-xs text-ink">
            {getById(id)?.title ?? id}
            <button type="button" onClick={() => onChange(values.filter((v) => v !== id))} className="text-muted hover:text-oxblood">×</button>
          </span>
        ))}
      </div>
      <div className="relative">
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setActiveIndex(0); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={(e) => {
            if (!open || items.length === 0) return;
            if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex(Math.min(idx + 1, items.length - 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex(Math.max(idx - 1, 0)); }
            else if (e.key === 'Enter') { e.preventDefault(); const it = items[idx]; if (it) pick(it.id); }
            else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
          }}
          placeholder="Add a reference…"
          className={inputClass}
        />
        {open && items.length > 0 && (
          <MentionMenu
            items={items}
            activeIndex={idx}
            onHover={setActiveIndex}
            onPick={(i) => { const it = items[i]; if (it) pick(it.id); }}
          />
        )}
      </div>
    </div>
  );
}

function CollectionPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const { collections } = useCollections();
  return (
    <div className="space-y-1">
      <select value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}>
        <option value="">Pick a collection…</option>
        {collections.map((c) => (
          <option key={c.id} value={c.id}>{c.name} ({c.items.length})</option>
        ))}
      </select>
      {collections.length === 0 && (
        <p className="text-xs text-muted">
          No collections yet. Select a list, table, or comma-separated sentence in a doc and choose “Make collection”.
        </p>
      )}
    </div>
  );
}

export function FieldEditor({
  field,
  value,
  onChange,
}: {
  field: TemplateField;
  value: unknown;
  onChange: (next: unknown) => void;
}) {
  switch (field.kind) {
    case 'text':
      return <input value={asText(value)} onChange={(e) => onChange(e.target.value)} className={inputClass} />;
    case 'longtext':
      return <textarea value={asText(value)} onChange={(e) => onChange(e.target.value)} rows={3} className={inputClass} />;
    case 'select':
      return (
        <select value={asText(value)} onChange={(e) => onChange(e.target.value)} className={inputClass}>
          <option value="">—</option>
          {(field.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    case 'tags':
      return <StringListEditor values={asStringList(value)} onChange={onChange} />;
    case 'refs':
      return <RefListEditor values={asStringList(value)} onChange={onChange} />;
    case 'badges':
      return <BadgeListEditor values={asBadges(value)} onChange={onChange} />;
    case 'collection':
      return <CollectionPicker value={asText(value)} onChange={onChange} />;
  }
}

export function TemplateForm({
  template,
  data,
  onChange,
}: {
  template: PageTemplate;
  data: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const setField = (key: string, next: unknown) => onChange({ ...data, [key]: next });

  return (
    <div className="space-y-4 rounded-xl border border-line bg-surface p-4">
      {template.fields.map((field) => (
        <div key={field.key}>
          <label className="mb-1 block font-mono text-xs font-semibold uppercase tracking-wide text-muted">
            {field.label}
            {template.badgeKey === field.key && <span className="ml-1 text-[10px] text-muted">(header badge)</span>}
          </label>
          {field.description && <p className="mb-1 text-xs text-muted">{field.description}</p>}
          <FieldEditor
            field={field}
            value={field.key in data ? data[field.key] : emptyValue(field.kind)}
            onChange={(next) => setField(field.key, next)}
          />
        </div>
      ))}
      {template.fields.length === 0 && (
        <p className="text-sm text-muted">This template has no fields yet. Add some in the template builder.</p>
      )}
    </div>
  );
}
