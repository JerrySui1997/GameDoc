'use client';

import { useEffect, useRef, useState } from 'react';
import { parseJson } from '../blocks/shared';
import {
  asStudioEnvironment,
  ATMOSPHERE_STAMP_PALETTE,
  DEFAULT_ATMOSPHERE_STAMPS,
  ENV_SECTION_ALIGNS,
  ENV_SECTION_KINDS,
  ENV_SECTION_TITLES,
  ENV_SECTION_WIDTHS,
  ENV_TIER_COLORS,
  ENV_TIER_LABELS,
  makeEnvSection,
  type AtmosphereStamp,
  type EnvSection,
  type EnvSectionKind,
  type StudioEnvironment,
} from '@/lib/environment/types';
import { makeStat, PIP_MAX, STAT_TYPES, STAT_TYPE_LABELS, type Stat, type StatType } from '@/lib/studio/types';
import { ArtSection, NoteArea, nextIn, SectionLabel, SP_ALIGN_GLYPH, SP_WIDTH_GLYPH, StatRow } from './studioParts';
import type { WidgetProps } from './types';

// ── Environment Studio panel ─────────────────────────────────────────────────
// Sibling of Character Studio (StudioPanel.tsx) for locations/environments —
// same section-list sheet engine (imported from studioParts.tsx), same warm
// `.sp-*` aesthetic (no new CSS), only the section-kind vocabulary and default
// seed data differ (place name / code / tier / flag / stats / atmosphere /
// notes / art / contract). See studio/types.ts's StudioPanel for the fuller
// rationale — this file mirrors it structurally, field for field.

// ── The panel ────────────────────────────────────────────────────────────────

export function EnvironmentPanel({ props, onChange }: WidgetProps) {
  const dataJson = String(props.dataJson ?? '');
  const stored = asStudioEnvironment(parseJson<unknown>(dataJson, {}));
  const [data, setData] = useState<StudioEnvironment>(stored);
  const dataRef = useRef(data);
  const lastJson = useRef(dataJson);
  const [adding, setAdding] = useState(false);

  // Re-sync when the stored prop changes from the outside (only after a commit,
  // never mid-typing — so this won't clobber in-progress edits).
  useEffect(() => {
    if (dataJson !== lastJson.current) {
      lastJson.current = dataJson;
      const next = asStudioEnvironment(parseJson<unknown>(dataJson, {}));
      dataRef.current = next;
      setData(next);
    }
  }, [dataJson]);

  const commit = (next: StudioEnvironment) => {
    const json = JSON.stringify(next);
    lastJson.current = json;
    onChange({ dataJson: json });
  };
  /** Local-only update (instant typing feedback). */
  const patch = (p: Partial<StudioEnvironment>) => {
    const next = { ...dataRef.current, ...p };
    dataRef.current = next;
    setData(next);
  };
  /** Update + persist (for discrete actions: clicks, toggles, uploads). */
  const patchCommit = (p: Partial<StudioEnvironment>) => {
    const next = { ...dataRef.current, ...p };
    dataRef.current = next;
    setData(next);
    commit(next);
  };
  const commitNow = () => commit(dataRef.current);

  // ── Section operations ──────────────────────────────────────────────────
  const mapSections = (fn: (s: EnvSection) => EnvSection) => dataRef.current.sections.map(fn);
  /** Local section edit (typing). */
  const editSection = (id: string, p: Partial<EnvSection>) =>
    patch({ sections: mapSections((s) => (s.id === id ? { ...s, ...p } : s)) });
  /** Section edit + persist (discrete actions). */
  const editSectionCommit = (id: string, p: Partial<EnvSection>) =>
    patchCommit({ sections: mapSections((s) => (s.id === id ? { ...s, ...p } : s)) });
  const removeSection = (id: string) =>
    patchCommit({ sections: dataRef.current.sections.filter((s) => s.id !== id) });
  const moveSection = (id: string, dir: -1 | 1) => {
    const arr = [...dataRef.current.sections];
    const i = arr.findIndex((s) => s.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    patchCommit({ sections: arr });
  };
  const addSection = (kind: EnvSectionKind) => {
    setAdding(false);
    patchCommit({ sections: [...dataRef.current.sections, makeEnvSection(kind)] });
  };

  return (
    <div className="sp-root">
      {/* Title bar — editable brand + title chrome; everything else is a section. */}
      <header className="sp-titlebar">
        <input
          className="sp-brand"
          value={data.brand}
          onChange={(e) => patch({ brand: e.target.value })}
          onBlur={commitNow}
          placeholder="Brand"
          spellCheck={false}
        />
        <span className="sp-divider" />
        <input
          className="sp-title"
          value={data.title}
          onChange={(e) => patch({ title: e.target.value })}
          onBlur={commitNow}
          placeholder="Title"
        />
        <div className="sp-spacer" />
      </header>

      <div className="sp-body">
        {/* ── Reorderable / removable sections (identity included) ── */}
        {data.sections.map((section, i) => (
          <div key={section.id} className="sp-section" data-w={section.width} data-align={section.align}>
            <div className="sp-sec-gutter">
              <button type="button" className="sp-sec-btn" title="Move up" disabled={i === 0} onClick={() => moveSection(section.id, -1)}>▲</button>
              <button type="button" className="sp-sec-btn" title="Move down" disabled={i === data.sections.length - 1} onClick={() => moveSection(section.id, 1)}>▼</button>
              <button type="button" className="sp-sec-btn" title={`Width: ${section.width} — click to cycle`} onClick={() => editSectionCommit(section.id, { width: nextIn(ENV_SECTION_WIDTHS, section.width) })}>{SP_WIDTH_GLYPH[section.width]}</button>
              <button type="button" className="sp-sec-btn" title={`Vertical align: ${section.align} — click to cycle`} onClick={() => editSectionCommit(section.id, { align: nextIn(ENV_SECTION_ALIGNS, section.align) })}>{SP_ALIGN_GLYPH[section.align]}</button>
              <button type="button" className="sp-sec-btn sp-sec-del" title="Remove section" onClick={() => removeSection(section.id)}>✕</button>
            </div>
            <div className="sp-sec-body">
              <EnvSectionContent
                section={section}
                edit={(p) => editSection(section.id, p)}
                editCommit={(p) => editSectionCommit(section.id, p)}
                commitNow={commitNow}
              />
            </div>
          </div>
        ))}

        {/* ── Add a section ── */}
        <div className="sp-add">
          {adding ? (
            <div className="sp-add-menu">
              {ENV_SECTION_KINDS.map((kind) => (
                <button key={kind} type="button" className="sp-add-item" onClick={() => addSection(kind)}>
                  {ENV_SECTION_TITLES[kind]}
                </button>
              ))}
              <button type="button" className="sp-add-cancel" onClick={() => setAdding(false)}>cancel</button>
            </div>
          ) : (
            <button type="button" className="sp-add-btn" onClick={() => setAdding(true)}>+ section</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Per-kind section renderers ───────────────────────────────────────────────

function EnvSectionContent({
  section, edit, editCommit, commitNow,
}: {
  section: EnvSection;
  edit: (p: Partial<EnvSection>) => void;
  editCommit: (p: Partial<EnvSection>) => void;
  commitNow: () => void;
}) {
  switch (section.kind) {
    case 'rule':
      return <SectionLabel value={section.label} onChange={(v) => edit({ label: v })} onBlur={commitNow} />;

    case 'placename':
      return (
        <input
          className="sp-codename"
          value={section.text}
          onChange={(e) => edit({ text: e.target.value })}
          onBlur={commitNow}
          placeholder="PLACE NAME"
        />
      );

    case 'code':
      return (
        <input
          className="sp-code-sec"
          value={section.text}
          onChange={(e) => edit({ text: e.target.value })}
          onBlur={commitNow}
          placeholder="L-XX"
          spellCheck={false}
        />
      );

    case 'tier':
      return (
        <div className="sp-tier-pick">
          {[1, 2, 3].map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => editCommit({ tier: t })}
              className="sp-tier-btn"
              style={section.tier === t ? { background: ENV_TIER_COLORS[t], borderColor: ENV_TIER_COLORS[t], color: '#fff' } : { borderColor: ENV_TIER_COLORS[t], color: ENV_TIER_COLORS[t] }}
            >T{t}</button>
          ))}
          <span className="sp-tier-name">{ENV_TIER_LABELS[section.tier]}</span>
        </div>
      );

    case 'flag':
      return (
        <div className="sp-flagrow">
          <input
            className="sp-flag-name"
            value={section.label}
            onChange={(e) => edit({ label: e.target.value })}
            onBlur={commitNow}
            placeholder="FLAG NAME"
          />
          <button
            type="button"
            onClick={() => editCommit({ on: !section.on })}
            className={section.on ? 'sp-flag sp-flag-on' : 'sp-flag'}
          >{section.on ? 'ON' : 'OFF'}</button>
        </div>
      );

    case 'art':
      return <ArtSection art={section.art} onSet={(art) => editCommit({ art })} />;

    case 'atmosphere':
      return <AtmosphereSection section={section} edit={edit} editCommit={editCommit} commitNow={commitNow} />;

    case 'stats':
      return <EnvStatsSection section={section} edit={edit} editCommit={editCommit} commitNow={commitNow} />;

    case 'contract':
      return (
        <div className="sp-contract">
          <div className="sp-rail-lock">
            <div className="sp-rail-tag">Contract<br /><span>LOCK</span></div>
            <NoteArea value={section.locked} onChange={(v) => edit({ locked: v })} onBlur={commitNow} placeholder="The fixed contract — what must not drift…" />
          </div>
          <div className="sp-rail-open">
            <div className="sp-rail-tag">Design space<br /><span>OPEN</span></div>
            <NoteArea value={section.open} onChange={(v) => edit({ open: v })} onBlur={commitNow} placeholder="Open for design — mood, dressing, free choices…" />
          </div>
        </div>
      );

    case 'note':
    default:
      return (
        <label className="sp-field">
          <input className="sp-flabel-input" value={section.label} onChange={(e) => edit({ label: e.target.value })} onBlur={commitNow} placeholder="Label" />
          <NoteArea value={section.text} onChange={(v) => edit({ text: v })} onBlur={commitNow} placeholder="Write…" />
        </label>
      );
  }
}

function EnvStatsSection({
  section, edit, editCommit, commitNow,
}: {
  section: EnvSection;
  edit: (p: Partial<EnvSection>) => void;
  editCommit: (p: Partial<EnvSection>) => void;
  commitNow: () => void;
}) {
  const stats = section.stats;
  /** Local stat edit (typing). */
  const editStat = (i: number, p: Partial<Stat>) =>
    edit({ stats: stats.map((s, j) => (j === i ? { ...s, ...p } : s)) });
  /** Stat edit + persist (discrete actions). */
  const editStatCommit = (i: number, p: Partial<Stat>) =>
    editCommit({ stats: stats.map((s, j) => (j === i ? { ...s, ...p } : s)) });
  const addStat = () => editCommit({ stats: [...stats, makeStat('pips')] });
  const removeStat = (i: number) => editCommit({ stats: stats.filter((_, j) => j !== i) });
  // Switching type reseeds the type-specific fields (keeps only the label) so a
  // bar→tag flip can't leave stale numbers behind.
  const changeType = (i: number, type: StatType) =>
    editStatCommit(i, { ...makeStat(type), label: stats[i].label });

  // ── Tag option editing (only meaningful for tag stats) ──
  const renameOption = (i: number, k: number, val: string) => {
    const s = stats[i];
    editStat(i, {
      options: s.options.map((o, m) => (m === k ? val : o)),
      choice: s.choice === s.options[k] ? val : s.choice,
    });
  };
  const removeOption = (i: number, k: number) => {
    const s = stats[i];
    const next = s.options.filter((_, m) => m !== k);
    editStatCommit(i, { options: next, choice: s.choice === s.options[k] ? (next[0] ?? '') : s.choice });
  };
  const addOption = (i: number) =>
    editStatCommit(i, { options: [...stats[i].options, `Option ${stats[i].options.length + 1}`] });

  return (
    <>
      <SectionLabel value={section.label} onChange={(v) => edit({ label: v })} onBlur={commitNow} />
      <div className="sp-stats">
        {stats.map((s, i) => (
          <StatRow
            key={i}
            stat={s}
            edit={(p) => editStat(i, p)}
            editCommit={(p) => editStatCommit(i, p)}
            commitNow={commitNow}
          />
        ))}
        <details className="sp-stat-edit">
          <summary>edit stats</summary>
          {stats.map((s, i) => (
            <div key={i} className="sp-stat-editgroup">
              <div className="sp-stat-editrow">
                <input
                  className="sp-stat-rename"
                  value={s.label}
                  onChange={(e) => editStat(i, { label: e.target.value })}
                  onBlur={commitNow}
                />
                <select
                  className="sp-stat-type"
                  value={s.type}
                  onChange={(e) => changeType(i, e.target.value as StatType)}
                >
                  {STAT_TYPES.map((t) => (
                    <option key={t} value={t}>{STAT_TYPE_LABELS[t]}</option>
                  ))}
                </select>
                {(s.type === 'pips' || s.type === 'bar') && (
                  <input
                    className="sp-stat-cfg"
                    type="number"
                    min={1}
                    max={s.type === 'pips' ? PIP_MAX : 9999}
                    title="Max"
                    value={s.max}
                    onChange={(e) => editStat(i, { max: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                    onBlur={commitNow}
                  />
                )}
                {s.type === 'number' && (
                  <input
                    className="sp-stat-cfg"
                    value={s.unit}
                    placeholder="unit"
                    title="Unit"
                    onChange={(e) => editStat(i, { unit: e.target.value })}
                    onBlur={commitNow}
                  />
                )}
                <button type="button" className="sp-stat-rm" title="Remove stat" onClick={() => removeStat(i)}>✕</button>
              </div>
              {s.type === 'tag' && (
                <div className="sp-tag-opts">
                  {s.options.map((opt, k) => (
                    <div key={k} className="sp-tag-optrow">
                      <input
                        className="sp-tag-optname"
                        value={opt}
                        onChange={(e) => renameOption(i, k, e.target.value)}
                        onBlur={commitNow}
                      />
                      <button type="button" className="sp-tag-optrm" title="Remove option" onClick={() => removeOption(i, k)}>✕</button>
                    </div>
                  ))}
                  <button type="button" className="sp-tag-optadd" onClick={() => addOption(i)}>+ add option</button>
                </div>
              )}
            </div>
          ))}
          <button type="button" className="sp-stat-add" onClick={addStat}>+ add stat</button>
        </details>
      </div>
    </>
  );
}

function AtmosphereSection({
  section, edit, editCommit, commitNow,
}: {
  section: EnvSection;
  edit: (p: Partial<EnvSection>) => void;
  editCommit: (p: Partial<EnvSection>) => void;
  commitNow: () => void;
}) {
  // Empty stamps (a pre-stamps atmosphere section) fall back to the default
  // vocabulary; the first edit materializes it onto the section.
  const stamps = section.stamps.length ? section.stamps : DEFAULT_ATMOSPHERE_STAMPS;
  const selected = section.atmosphere;

  const renameStamp = (i: number, key: string) => {
    const old = stamps[i].key;
    edit({
      stamps: stamps.map((s, j) => (j === i ? { ...s, key } : s)),
      atmosphere: selected === old ? key : selected, // keep selection on the renamed stamp
    });
  };
  const recolorStamp = (i: number) => {
    const cur = ATMOSPHERE_STAMP_PALETTE.indexOf(stamps[i].color);
    const color = ATMOSPHERE_STAMP_PALETTE[(cur + 1) % ATMOSPHERE_STAMP_PALETTE.length];
    editCommit({ stamps: stamps.map((s, j) => (j === i ? { ...s, color } : s)) });
  };
  const addStamp = () => {
    const fresh: AtmosphereStamp = { key: 'NEW', color: ATMOSPHERE_STAMP_PALETTE[stamps.length % ATMOSPHERE_STAMP_PALETTE.length], hint: '' };
    editCommit({ stamps: [...stamps, fresh] });
  };
  const removeStamp = (i: number) => {
    const removed = stamps[i].key;
    const next = stamps.filter((_, j) => j !== i);
    editCommit({ stamps: next, atmosphere: selected === removed ? (next[0]?.key ?? '') : selected });
  };

  return (
    <>
      <SectionLabel value={section.label} onChange={(v) => edit({ label: v })} onBlur={commitNow} />
      <div className="sp-stamps">
        {stamps.map((s, i) => {
          const active = selected === s.key;
          return (
            <button
              key={i}
              type="button"
              title={s.hint}
              onClick={() => editCommit({ atmosphere: s.key })}
              className="sp-stamp"
              style={active ? { background: s.color, borderColor: s.color, color: '#fff' } : { borderColor: s.color, color: s.color }}
            >
              {s.key}
            </button>
          );
        })}
      </div>
      <details className="sp-stamp-edit">
        <summary>edit stamps</summary>
        {stamps.map((s, i) => (
          <div key={i} className="sp-stamp-editrow">
            <button
              type="button"
              className="sp-stamp-swatch"
              style={{ background: s.color }}
              title="Cycle color"
              onClick={() => recolorStamp(i)}
            />
            <input
              className="sp-stamp-rename"
              value={s.key}
              onChange={(e) => renameStamp(i, e.target.value)}
              onBlur={commitNow}
            />
            <button type="button" className="sp-stamp-rm" title="Remove stamp" onClick={() => removeStamp(i)}>✕</button>
          </div>
        ))}
        <button type="button" className="sp-stamp-add" onClick={addStamp}>+ add stamp</button>
      </details>
    </>
  );
}
