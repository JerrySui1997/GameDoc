'use client';

import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { clampStat, PIP_MAX, type SectionAlign, type SectionWidth, type Stat } from '@/lib/studio/types';

// ── Shared Studio engine parts ──────────────────────────────────────────────
// Generic pieces of the "sheet engine" shared by Character Studio
// (StudioPanel.tsx) and Environment Studio (EnvironmentPanel.tsx). Nothing
// here knows about characters or environments — only about `Stat` and the
// generic section width/align vocabularies. Extracted once so both panels
// run the exact same engine instead of duplicating it.

// Glyphs for the per-section layout cycle buttons (width fraction + vertical
// alignment). Cycling steps through the controlled vocabularies in order.
export const SP_WIDTH_GLYPH: Record<SectionWidth, string> = { full: '▭', half: '◧', third: '◰' };
export const SP_ALIGN_GLYPH: Record<SectionAlign, string> = { top: '⤒', center: '≡', bottom: '⤓' };
export function nextIn<T>(arr: readonly T[], cur: T): T {
  const i = arr.indexOf(cur);
  return arr[(i + 1) % arr.length];
}

export const ART_ACCEPT = ['image/png', 'image/jpeg', 'image/webp', 'image/avif', 'image/gif'];
export const ART_MAX_DIM = 720;

export async function toWebpDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, ART_MAX_DIM / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, w, h);
    return canvas.toDataURL('image/webp', 0.82);
  } finally {
    bitmap.close?.();
  }
}

/** Auto-growing textarea — the free-write note region. */
export function NoteArea({
  value, onChange, onBlur, placeholder,
}: {
  value: string; onChange: (v: string) => void; onBlur: () => void; placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`; }
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      className="sp-note"
    />
  );
}

/** Editable section heading (doubles as the divider rule). */
export function SectionLabel({ value, onChange, onBlur }: { value: string; onChange: (v: string) => void; onBlur: () => void }) {
  return (
    <div className="sp-rule">
      <input className="sp-rule-input" value={value} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} placeholder="Section" />
      <i />
    </div>
  );
}

/** One stat, rendered by its `type`. Display-side editing stays inline (clicks,
 *  toggles, inline inputs); structural config lives in the "edit stats" panel. */
export function StatRow({
  stat, edit, editCommit, commitNow,
}: {
  stat: Stat;
  edit: (p: Partial<Stat>) => void;
  editCommit: (p: Partial<Stat>) => void;
  commitNow: () => void;
}) {
  switch (stat.type) {
    case 'bar': {
      const value = clampStat(stat.value, stat.max);
      const pct = Math.round((value / stat.max) * 100);
      // Click anywhere on the track to set the value by position.
      const pick = (e: React.MouseEvent<HTMLSpanElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const frac = rect.width > 0 ? (e.clientX - rect.left) / rect.width : 0;
        editCommit({ value: clampStat(frac * stat.max, stat.max) });
      };
      return (
        <div className="sp-stat">
          <span className="sp-stat-label">{stat.label}</span>
          <span className="sp-bar-wrap">
            <span className="sp-bar" title={`Set ${stat.label}`} onClick={pick}>
              <i style={{ width: `${pct}%` }} />
            </span>
            <span className="sp-bar-read">{value} / {stat.max}</span>
          </span>
        </div>
      );
    }

    case 'number':
      return (
        <div className="sp-stat">
          <span className="sp-stat-label">{stat.label}</span>
          <span className="sp-num">
            <input
              className="sp-num-input"
              inputMode="numeric"
              value={String(stat.value)}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                edit({ value: Number.isNaN(n) ? 0 : n });
              }}
              onBlur={commitNow}
            />
            {stat.unit && <span className="sp-num-unit">{stat.unit}</span>}
          </span>
        </div>
      );

    case 'toggle':
      return (
        <div className="sp-stat">
          <span className="sp-stat-label">{stat.label}</span>
          <button
            type="button"
            onClick={() => editCommit({ on: !stat.on })}
            className={stat.on ? 'sp-toggle sp-toggle-on' : 'sp-toggle'}
          >{stat.on ? 'ON' : 'OFF'}</button>
        </div>
      );

    case 'tag':
      return (
        <div className="sp-stat">
          <span className="sp-stat-label">{stat.label}</span>
          <span className="sp-tagrow">
            {stat.options.map((opt, i) => (
              <button
                key={i}
                type="button"
                onClick={() => editCommit({ choice: opt })}
                className={opt === stat.choice ? 'sp-tag sp-tag-on' : 'sp-tag'}
              >{opt}</button>
            ))}
          </span>
        </div>
      );

    case 'text':
      return (
        <div className="sp-stat sp-stat-text">
          <span className="sp-stat-label">{stat.label}</span>
          <input
            className="sp-text-input"
            value={stat.text}
            onChange={(e) => edit({ text: e.target.value })}
            onBlur={commitNow}
            placeholder="…"
          />
        </div>
      );

    case 'pips':
    default: {
      const value = clampStat(stat.value, stat.max);
      const count = Math.min(stat.max, PIP_MAX);
      return (
        <div className="sp-stat">
          <span className="sp-stat-label">{stat.label}</span>
          <span className="sp-pips">
            {Array.from({ length: count }, (_, i) => (
              <button
                key={i}
                type="button"
                title={`Set ${stat.label} to ${i + 1}`}
                onClick={() => editCommit({ value: value === i + 1 ? i : i + 1 })}
                className={i < value ? 'sp-pip sp-pip-on' : 'sp-pip'}
              />
            ))}
          </span>
        </div>
      );
    }
  }
}

export function ArtSection({ art, onSet }: { art: string; onSet: (art: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);

  async function ingest(file: File | undefined) {
    if (!file || !ART_ACCEPT.includes(file.type)) return;
    setBusy(true);
    try {
      onSet(await toWebpDataUrl(file));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sp-polaroid">
      <span className="sp-tape" />
      <div
        className={over ? 'sp-frame sp-frame-over' : 'sp-frame'}
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); ingest(e.dataTransfer.files?.[0]); }}
      >
        {art ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={art} alt="concept art" draggable={false} />
        ) : (
          <span className="sp-frame-empty">{busy ? 'reading…' : 'drop / browse\nconcept art'}</span>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept={ART_ACCEPT.join(',')}
        hidden
        onChange={(e) => { ingest(e.target.files?.[0]); e.target.value = ''; }}
      />
      {art && <button type="button" className="sp-link" onClick={() => onSet('')}>remove art</button>}
    </div>
  );
}
