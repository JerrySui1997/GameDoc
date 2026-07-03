'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { clsx } from 'clsx';
import { BlockLabel, parseJson, valueClass } from '../blocks/shared';
import { FieldEditor } from '@/components/templates/TemplateForm';
import { asBadges, asStringList, toneStyle, TONES, type Badge } from '@/lib/templates/types';
import { CollectionView } from '@/components/widgets';
import { useCollections } from '@/components/collections/CollectionsProvider';
import { WidgetShell } from './looks';
import { MentionField } from './MentionField';
import type { WidgetProps } from './types';

// The small structured widgets, ported from the old BlockNote block specs to
// plain components. The host persists props; these commit on blur / discrete
// actions so a keystroke never re-renders the document mid-typing.

/** A labeled single- or multi-line text value. */
export function Labeled({ props, onChange }: WidgetProps) {
  const label = String(props.label ?? 'Field');
  const value = String(props.value ?? '');
  const highlight = !!props.highlight;
  const multiline = !!props.multiline;

  return (
    <WidgetShell type="labeled">
      <div className={clsx('flex w-full flex-col gap-1 sm:flex-row sm:gap-3', highlight && 'rounded-md bg-brass-soft p-2')}>
        <BlockLabel value={label} onCommit={(l) => onChange({ label: l })} />
        <MentionField value={value} multiline={multiline} onCommit={(v) => onChange({ value: v })} className={valueClass} />
      </div>
    </WidgetShell>
  );
}

/** A colored status chip: label + value + tone. */
export function StatusBadge({ props, onChange }: WidgetProps) {
  const label = String(props.label ?? 'Status');
  const value = String(props.value ?? '');
  const tone = String(props.tone ?? 'slate');
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const commit = () => { if (v !== value) onChange({ value: v }); };

  return (
    <WidgetShell type="statusBadge">
      <div className="flex w-full flex-wrap items-center gap-2">
        <BlockLabel value={label} onCommit={(l) => onChange({ label: l })} />
        <input
          value={v}
          onChange={(e) => setV(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          placeholder="value"
          className="rounded-lg border border-line px-2.5 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brass"
        />
        <select
          value={tone}
          onChange={(e) => onChange({ tone: e.target.value })}
          className="rounded border border-line px-1 py-1 text-xs text-muted"
        >
          {TONES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        {v && <span className={clsx('rounded border px-2 py-0.5 text-xs font-semibold', toneStyle(tone))}>{v}</span>}
      </div>
    </WidgetShell>
  );
}

// The list widgets reuse the in-place editors from TemplateForm (StringListEditor,
// BadgeListEditor, RefListEditor, CollectionPicker via FieldEditor). Those commit
// on discrete actions (Enter / select / ✕), so writing straight through onChange
// won't steal focus mid-typing.

function Frame({ label, onLabel, children }: { label: string; onLabel: (l: string) => void; children: ReactNode }) {
  return (
    <div className="w-full space-y-1.5">
      <BlockLabel value={label} onCommit={onLabel} />
      {children}
    </div>
  );
}

export function Badges({ props, onChange }: WidgetProps) {
  return (
    <WidgetShell type="badges">
      <Frame label={String(props.label ?? 'Badges')} onLabel={(l) => onChange({ label: l })}>
        <FieldEditor
          field={{ key: 'v', label: '', kind: 'badges' }}
          value={asBadges(parseJson<Badge[]>(props.badgesJson, []))}
          onChange={(next) => onChange({ badgesJson: JSON.stringify(next) })}
        />
      </Frame>
    </WidgetShell>
  );
}

export function Tags({ props, onChange }: WidgetProps) {
  const tone = String(props.tone ?? 'slate');
  return (
    <WidgetShell type="tags">
      <Frame label={String(props.label ?? 'Tags')} onLabel={(l) => onChange({ label: l })}>
        <FieldEditor
          field={{ key: 'v', label: '', kind: 'tags', tagsTone: tone }}
          value={asStringList(parseJson<string[]>(props.tagsJson, []))}
          onChange={(next) => onChange({ tagsJson: JSON.stringify(next) })}
        />
        <label className="inline-flex items-center gap-1 text-[11px] text-muted">
          chip color
          <select
            value={tone}
            onChange={(e) => onChange({ tone: e.target.value })}
            className="rounded border border-line px-1 py-0.5"
          >
            {TONES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
      </Frame>
    </WidgetShell>
  );
}

export function Refs({ props, onChange }: WidgetProps) {
  return (
    <WidgetShell type="refs">
      <Frame label={String(props.label ?? 'References')} onLabel={(l) => onChange({ label: l })}>
        <FieldEditor
          field={{ key: 'v', label: '', kind: 'refs' }}
          value={asStringList(parseJson<string[]>(props.refsJson, []))}
          onChange={(next) => onChange({ refsJson: JSON.stringify(next) })}
        />
      </Frame>
    </WidgetShell>
  );
}

export function Collection({ props, onChange }: WidgetProps) {
  const { getById } = useCollections();
  const collectionId = String(props.collectionId ?? '');
  const collection = collectionId ? getById(collectionId) ?? null : null;
  return (
    <WidgetShell type="collection">
      <Frame label={String(props.label ?? 'Collection')} onLabel={(l) => onChange({ label: l })}>
        <FieldEditor
          field={{ key: 'v', label: '', kind: 'collection' }}
          value={collectionId}
          onChange={(next) => onChange({ collectionId: String(next ?? '') })}
        />
        {collection && <div className="rounded-lg border border-line"><CollectionView label="" collection={collection} /></div>}
      </Frame>
    </WidgetShell>
  );
}
