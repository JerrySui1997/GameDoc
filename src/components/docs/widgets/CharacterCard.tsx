'use client';

import { useMemo, useState } from 'react';
import { useDocs } from '../DocsProvider';
import {
  clampStat,
  PIP_MAX,
  SECTION_TITLES,
  TIER_COLORS,
  TIER_LABELS,
  type Section,
  type StudioCharacter,
} from '@/lib/studio/types';
import {
  pageHasStudio,
  parseHideIds,
  sectionPickerLabel,
  studioFromBody,
  visibleSections,
} from '@/lib/studio/card';
import type { WidgetProps } from './types';

// ── Character Card ───────────────────────────────────────────────────────────
// A *bound* widget: it stores no character data of its own, only a pointer to a
// character page (`sourcePageId`) plus the designer's choice of which sections to
// hide (`hideJson`). On render it reads that page's Character Studio panel — the
// single source of truth — and shows a clean, read-only card of the sections the
// designer kept. Edit the studio on the character page and every card bound to it
// reflects the change. New sections added to the studio appear automatically
// (they're shown unless explicitly hidden), so the binding stays live, not a copy.
//
// The chrome bar (source picker + "fields" chooser + link to the source) is the
// only interactive part; everything below is a faithful, non-editable rendering of
// the studio, styled with the same warm `.cc-*` palette as the studio itself.

/** The selected personality stamp's color, falling back to a neutral ink. */
function personalityColor(section: Section): string {
  const stamps = section.stamps.length ? section.stamps : [];
  return stamps.find((s) => s.key === section.personality)?.color ?? '#5b6b73';
}

/** One stat rendered read-only, by its type. */
function CardStat({ stat }: { stat: Section['stats'][number] }) {
  switch (stat.type) {
    case 'bar': {
      const value = clampStat(stat.value, stat.max);
      const pct = Math.round((value / stat.max) * 100);
      return (
        <div className="cc-stat">
          <span className="cc-stat-label">{stat.label}</span>
          <span className="cc-bar"><i style={{ width: `${pct}%` }} /></span>
          <span className="cc-stat-read">{value}/{stat.max}</span>
        </div>
      );
    }
    case 'number':
      return (
        <div className="cc-stat">
          <span className="cc-stat-label">{stat.label}</span>
          <span className="cc-stat-read">{stat.value}{stat.unit && <em> {stat.unit}</em>}</span>
        </div>
      );
    case 'toggle':
      return (
        <div className="cc-stat">
          <span className="cc-stat-label">{stat.label}</span>
          <span className={stat.on ? 'cc-pill cc-pill-on' : 'cc-pill'}>{stat.on ? 'ON' : 'OFF'}</span>
        </div>
      );
    case 'tag':
      return (
        <div className="cc-stat">
          <span className="cc-stat-label">{stat.label}</span>
          <span className="cc-pill cc-pill-on">{stat.choice || '—'}</span>
        </div>
      );
    case 'text':
      return (
        <div className="cc-stat">
          <span className="cc-stat-label">{stat.label}</span>
          <span className="cc-stat-read">{stat.text || '—'}</span>
        </div>
      );
    case 'pips':
    default: {
      const value = clampStat(stat.value, stat.max);
      const count = Math.min(stat.max, PIP_MAX);
      return (
        <div className="cc-stat">
          <span className="cc-stat-label">{stat.label}</span>
          <span className="cc-pips">
            {Array.from({ length: count }, (_, i) => (
              <span key={i} className={i < value ? 'cc-pip cc-pip-on' : 'cc-pip'} />
            ))}
          </span>
        </div>
      );
    }
  }
}

/** One studio section, rendered read-only. Identity bits (codename / art) are
 *  hoisted into the card header by the parent and skipped here. */
function CardSection({ section }: { section: Section }) {
  switch (section.kind) {
    case 'code':
      return <span className="cc-code">{section.text || 'T-XX'}</span>;
    case 'tier':
      return (
        <span className="cc-tier" style={{ background: TIER_COLORS[section.tier], borderColor: TIER_COLORS[section.tier] }}>
          {TIER_LABELS[section.tier]}
        </span>
      );
    case 'flag':
      return (
        <span className={section.on ? 'cc-flag cc-flag-on' : 'cc-flag'}>
          {section.label || 'FLAG'}{section.on ? '' : ' · off'}
        </span>
      );
    case 'personality': {
      const color = personalityColor(section);
      return <span className="cc-pers" style={{ background: color, borderColor: color }}>{section.personality || '—'}</span>;
    }
    case 'stats':
      return (
        <div className="cc-block">
          {section.label && <div className="cc-block-head">{section.label}</div>}
          <div className="cc-stats">{section.stats.map((s, i) => <CardStat key={i} stat={s} />)}</div>
        </div>
      );
    case 'note':
      return (
        <div className="cc-block">
          {section.label && <div className="cc-block-head">{section.label}</div>}
          <p className="cc-note">{section.text || <span className="cc-empty">—</span>}</p>
        </div>
      );
    case 'contract':
      return (
        <div className="cc-block cc-contract">
          <div className="cc-rail cc-rail-lock"><span className="cc-rail-tag">Locked</span><p>{section.locked || <span className="cc-empty">—</span>}</p></div>
          <div className="cc-rail cc-rail-open"><span className="cc-rail-tag">Open</span><p>{section.open || <span className="cc-empty">—</span>}</p></div>
        </div>
      );
    case 'rule':
      return <div className="cc-rule">{section.label && <span>{section.label}</span>}</div>;
    case 'art':
      // Extra art sections (beyond the hoisted portrait) render inline.
      return section.art ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="cc-art-inline" src={section.art} alt="concept art" />
      ) : null;
    case 'codename':
      // Hoisted to the header; nothing inline.
      return null;
    default:
      return null;
  }
}

/** The rendered, read-only card — portrait + name hoisted into a header, the rest
 *  of the chosen sections flowed below in the studio's own order. */
function CardStage({ studio, visible }: { studio: StudioCharacter; visible: Section[] }) {
  const portrait = visible.find((s) => s.kind === 'art' && s.art);
  const codename = visible.find((s) => s.kind === 'codename');
  // The header carries name + portrait; the body carries everything else, in
  // order — minus the one art we used as the portrait (others still render).
  const body = visible.filter((s) => s !== portrait && s.kind !== 'codename');

  return (
    <div className="cc-stage">
      {portrait && (
        // eslint-disable-next-line @next/next/no-img-element
        <div className="cc-portrait"><img src={portrait.art} alt="concept art" /></div>
      )}
      <div className="cc-content">
        <div className="cc-name">{codename?.text?.trim() || studio.title || 'Unnamed'}</div>
        <div className="cc-sections">
          {body.map((s) => <CardSection key={s.id} section={s} />)}
        </div>
      </div>
    </div>
  );
}

export function CharacterCard({ props, onChange }: WidgetProps) {
  const { docs } = useDocs();
  const sourcePageId = String(props.sourcePageId ?? '');
  const hideIds = parseHideIds(props.hideJson);

  // Pages that actually carry a studio — the only valid sources. Re-derived when
  // any doc body changes (cheap: a handful of pages, parsed once each).
  const studioPages = useMemo(
    () => docs.filter((d) => pageHasStudio(d.body)).map((d) => ({ id: d.id, title: d.title })),
    [docs],
  );

  const source = docs.find((d) => d.id === sourcePageId) ?? null;
  const studio = source ? studioFromBody(source.body) : null;
  const visible = studio ? visibleSections(studio, hideIds) : [];

  const setSource = (id: string) => onChange({ sourcePageId: id, hideJson: '[]' });
  const toggleSection = (id: string, hidden: boolean) => {
    const next = hidden ? [...hideIds, id] : hideIds.filter((x) => x !== id);
    onChange({ hideJson: JSON.stringify(next) });
  };

  return (
    <div className="cc-root">
      {/* ── Chrome: bind to a source, choose fields, jump to the source ── */}
      <header className="cc-chrome">
        <span className="cc-chrome-tag">Character card</span>
        <select className="cc-source" value={sourcePageId} onChange={(e) => setSource(e.target.value)}>
          <option value="">— pick a character page —</option>
          {studioPages.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
        </select>
        {source && (
          <a className="cc-open" href={`/docs/${source.id}`} title="Open the source of truth">edit source ↗</a>
        )}
        {studio && studio.sections.length > 0 && (
          <details className="cc-fields">
            <summary>fields</summary>
            <div className="cc-fields-menu">
              {studio.sections.map((s) => {
                const hidden = hideIds.includes(s.id);
                return (
                  <label key={s.id} className="cc-field-row">
                    <input type="checkbox" checked={!hidden} onChange={(e) => toggleSection(s.id, !e.target.checked)} />
                    <span>{sectionPickerLabel(s, SECTION_TITLES[s.kind])}</span>
                  </label>
                );
              })}
            </div>
          </details>
        )}
      </header>

      {/* ── Stage: read-only render of the chosen studio sections ── */}
      {!source ? (
        <div className="cc-placeholder">
          Bind this card to a character page that has a <b>Character Studio</b>. It will mirror that
          studio as a single source of truth — edit the studio once, every card updates.
        </div>
      ) : !studio ? (
        <div className="cc-placeholder">
          <b>{source.title}</b> has no Character Studio yet. Add a Character Studio panel to that page,
          then this card will display it.
        </div>
      ) : visible.length === 0 ? (
        <div className="cc-placeholder">No fields selected — open <b>fields</b> above to choose what to show.</div>
      ) : (
        <CardStage studio={studio} visible={visible} />
      )}
    </div>
  );
}
