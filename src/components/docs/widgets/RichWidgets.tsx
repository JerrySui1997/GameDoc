'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { clsx } from 'clsx';
import { BlockLabel, parseJson } from '../blocks/shared';
import { TONES } from '@/lib/templates/types';
import { tonalName } from '@/lib/color/tonalName';
import { blocksToPlainText, parseBody } from '@/lib/docs/blocks';
import { resolveRowHue, rowColors, type RowColors } from '@/lib/docs/hierarchyColor';
import { useDocs } from '../DocsProvider';
import { MentionField } from './MentionField';
import type { WidgetProps } from './types';

// The deck-level widgets: a lead banner (Hero), a responsive titled-card grid
// (Cards), and a true-color palette (Swatches). They follow the same convention
// as the small widgets — structured value stored as a JSON string prop, text
// inputs editing local state and committing on blur, discrete actions committing
// immediately — so a keystroke never re-renders the document and steals focus.

// ── Shared helpers ───────────────────────────────────────────────────────────

/** Same chrome as SmallWidgets' Frame: an inline-editable label over content. */
function Frame({ label, onLabel, right, children }: {
  label: string;
  onLabel: (l: string) => void;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="w-full space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <BlockLabel value={label} onCommit={onLabel} />
        {right}
      </div>
      {children}
    </div>
  );
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

// ── Hero ─────────────────────────────────────────────────────────────────────

type HeroTone = 'dark' | 'light' | 'accent';
const HERO_TONES: HeroTone[] = ['dark', 'light', 'accent'];

const HERO_SHELL: Record<HeroTone, string> = {
  dark: 'bg-ink text-white',
  light: 'bg-canvas text-ink border border-line',
  accent: 'bg-gradient-to-br from-brass to-ink text-white',
};

/** A lead banner with three inline-editable fields rendered directly on it. */
export function Hero({ props, onChange }: WidgetProps) {
  const eyebrow = String(props.eyebrow ?? '');
  const title = String(props.title ?? '');
  const subtitle = String(props.subtitle ?? '');
  const tone: HeroTone = HERO_TONES.includes(props.tone as HeroTone) ? (props.tone as HeroTone) : 'dark';
  const onLight = tone === 'light';

  const [local, setLocal] = useState({ eyebrow, title });
  useEffect(() => setLocal({ eyebrow, title }), [eyebrow, title]);
  const set = (k: keyof typeof local, v: string) => setLocal((s) => ({ ...s, [k]: v }));
  const commit = (k: keyof typeof local) => { if (local[k] !== String(props[k] ?? '')) onChange({ [k]: local[k] }); };

  const fieldBase = 'w-full border-none bg-transparent p-0 focus:outline-none focus:ring-0';
  const placeholder = onLight ? 'placeholder:text-muted' : 'placeholder:text-white/40';

  return (
    <div className={clsx('relative w-full rounded-2xl px-8 py-10', HERO_SHELL[tone])}>
      <select
        value={tone}
        onChange={(e) => onChange({ tone: e.target.value })}
        className="absolute right-3 top-3 rounded border border-white/20 bg-black/10 px-1 py-0.5 text-[11px] text-current opacity-60 focus:opacity-100"
      >
        {HERO_TONES.map((t) => <option key={t} value={t} className="text-slate-900">{t}</option>)}
      </select>
      <input
        value={local.eyebrow}
        onChange={(e) => set('eyebrow', e.target.value)}
        onBlur={() => commit('eyebrow')}
        placeholder="Eyebrow"
        className={clsx(fieldBase, placeholder, 'text-xs font-semibold uppercase tracking-[0.2em]', onLight ? 'text-brass' : 'text-white/70')}
      />
      <input
        value={local.title}
        onChange={(e) => set('title', e.target.value)}
        onBlur={() => commit('title')}
        placeholder="Title"
        className={clsx(fieldBase, placeholder, 'mt-2 text-3xl leading-snug font-bold tracking-tight')}
      />
      <MentionField
        value={subtitle}
        onCommit={(v) => onChange({ subtitle: v })}
        placeholder="Subtitle"
        className={clsx(fieldBase, placeholder, 'mt-2 text-base', onLight ? 'text-muted' : 'text-white/70')}
      />
    </div>
  );
}

// ── Cards ──────────────────────────────────────────────────────────────────────

type Card = { eyebrow?: string; title: string; body: string; tone?: string };

function asCards(value: unknown): Card[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
    .map((c) => ({
      eyebrow: typeof c.eyebrow === 'string' ? c.eyebrow : '',
      title: typeof c.title === 'string' ? c.title : '',
      body: typeof c.body === 'string' ? c.body : '',
      tone: typeof c.tone === 'string' ? c.tone : '',
    }));
}

// Accent rail colour per tone. Atelier is a warm, muted parchment palette, so the
// raw saturated Tailwind ramps (red-500, sky-500 …) read as generic and clash with
// it. These are earthy, desaturated equivalents — three of them ARE the theme's own
// accent tokens (red→oxblood, amber→brass, sky→teal) — applied as a thin left rail
// (the accent idiom shared by the studio/character/timeline cards), not a solid top
// bar. Set inline so Tailwind needn't enumerate dynamic colours; the tone *names*
// stay the controlled vocabulary, only their rendered hue is themed.
const TONE_RAIL: Record<string, string> = {
  slate: '#5b6b73',  // muted (the --muted token)
  green: '#5f7d52',  // sage
  yellow: '#c79a3e', // ochre
  orange: '#b3623a', // burnt sienna
  red: '#8c2e2e',    // oxblood (theme accent)
  amber: '#b07d3c',  // brass (theme accent)
  purple: '#6b5b8c', // plum
  sky: '#3d8fb8',    // teal (theme accent)
  blue: '#3a6ea5',   // steel blue
};

const COL_CLASS: Record<number, string> = {
  1: 'sm:grid-cols-1',
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-3',
};

/** A responsive grid of titled cards — crew, gameplay steps, world zones, etc. */
export function Cards({ props, onChange }: WidgetProps) {
  const label = String(props.label ?? '');
  const columns = [1, 2, 3].includes(Number(props.columns)) ? Number(props.columns) : 3;
  const [items, setItems] = useState<Card[]>(() => asCards(parseJson(props.cardsJson, [])));
  useEffect(() => setItems(asCards(parseJson(props.cardsJson, []))), [props.cardsJson]);

  const commit = (next: Card[]) => onChange({ cardsJson: JSON.stringify(next) });
  const patch = (i: number, p: Partial<Card>) => setItems((cur) => cur.map((c, j) => (j === i ? { ...c, ...p } : c)));
  const add = () => { const next = [...items, { eyebrow: '', title: '', body: '', tone: '' }]; setItems(next); commit(next); };
  const remove = (i: number) => { const next = items.filter((_, j) => j !== i); setItems(next); commit(next); };
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    setItems(next);
    commit(next);
  };

  const colsSelect = (
    <label className="inline-flex items-center gap-1 text-[11px] text-muted">
      cols
      <select
        value={columns}
        onChange={(e) => onChange({ columns: Number(e.target.value) })}
        className="rounded border border-line px-1 py-0.5"
      >
        {[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
    </label>
  );

  return (
    <Frame label={label} onLabel={(l) => onChange({ label: l })} right={colsSelect}>
      <div className={clsx('grid gap-4', COL_CLASS[columns])}>
        {items.map((c, i) => (
          <div
            key={i}
            className="group/card relative overflow-hidden rounded-xl border border-line bg-surface shadow-[0_4px_14px_rgba(26,37,48,0.06)]"
            style={c.tone ? { borderLeftWidth: '3px', borderLeftColor: TONE_RAIL[c.tone] ?? TONE_RAIL.slate } : undefined}
          >
            <div className="space-y-1.5 p-4">
              <div className="absolute right-1.5 top-1.5 flex gap-0.5 opacity-0 transition-opacity group-hover/card:opacity-100">
                <button type="button" title="Move up" onClick={() => move(i, -1)} className="rounded bg-surface/80 px-1 text-[10px] text-muted hover:text-ink">▲</button>
                <button type="button" title="Move down" onClick={() => move(i, 1)} className="rounded bg-surface/80 px-1 text-[10px] text-muted hover:text-ink">▼</button>
                <button type="button" title="Remove card" onClick={() => remove(i)} className="rounded bg-surface/80 px-1 text-[10px] text-muted hover:text-oxblood">✕</button>
              </div>
              <input
                value={c.eyebrow ?? ''}
                onChange={(e) => patch(i, { eyebrow: e.target.value })}
                onBlur={() => commit(items)}
                placeholder="eyebrow"
                className="w-full border-none bg-transparent p-0 font-mono text-[11px] font-semibold uppercase tracking-wider text-muted placeholder:text-muted/55 focus:outline-none focus:ring-0"
              />
              <input
                value={c.title}
                onChange={(e) => patch(i, { title: e.target.value })}
                onBlur={() => commit(items)}
                placeholder="Title"
                className="w-full border-none bg-transparent p-0 text-base font-semibold text-ink placeholder:text-muted/55 focus:outline-none focus:ring-0"
              />
              <MentionField
                multiline
                value={c.body}
                onCommit={(v) => commit(items.map((x, j) => (j === i ? { ...x, body: v } : x)))}
                placeholder="Body"
                className="w-full resize-none border-none bg-transparent p-0 text-sm leading-relaxed text-muted placeholder:text-muted/55 focus:outline-none focus:ring-0"
              />
              <select
                value={c.tone || ''}
                onChange={(e) => { const next = items.map((x, j) => (j === i ? { ...x, tone: e.target.value } : x)); setItems(next); commit(next); }}
                className="rounded border border-line px-1 py-0.5 text-[11px] text-muted"
              >
                <option value="">no accent</option>
                {TONES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={add}
          className="flex min-h-[7rem] items-center justify-center rounded-xl border border-dashed border-line text-sm text-muted hover:border-brass hover:text-ink"
        >
          + card
        </button>
      </div>
    </Frame>
  );
}

// ── Swatches ─────────────────────────────────────────────────────────────────

// A swatch carries its hex and a display name. `auto` marks a name that tracks
// the hex via the tonal naming rules; once the user types over it, `auto` flips
// off and the chosen name is remembered for that hex in the overrides map.
type Swatch = { hex: string; name: string; auto: boolean };

function asSwatches(value: unknown): Swatch[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
    .map((s) => {
      const hex = typeof s.hex === 'string' ? s.hex : '#888888';
      const auto = typeof s.auto === 'boolean' ? s.auto : false;
      const stored = typeof s.name === 'string' ? s.name : '';
      // Legacy swatches had no `auto` flag and an empty name meant "unnamed";
      // treat anything blank as auto so it picks up a generated name.
      const name = stored || tonalName(hex);
      return { hex, name, auto: stored ? auto : true };
    });
}

const normHex = (hex: string) => hex.trim().toLowerCase();

/** Read the per-hex name overrides the user has set, keyed by normalized hex. */
function asOverrides(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === 'string' && v) out[normHex(k)] = v;
  }
  return out;
}

// Distinct default hues offered as new swatches are added, so each "+ color"
// lands on a visibly different color rather than repeating the same gray.
const SEED_HEXES = [
  '#3b82f6', '#ef4444', '#22c55e', '#eab308', '#a855f7',
  '#f97316', '#06b6d4', '#ec4899', '#14b8a6', '#6366f1',
];

/** Pick a hex not already used in the palette; random fallback once seeds run out. */
function uniqueHex(used: Set<string>): string {
  for (const hex of SEED_HEXES) if (!used.has(normHex(hex))) return hex;
  for (let i = 0; i < 64; i++) {
    const hex = '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
    if (!used.has(hex)) return hex;
  }
  return '#888888';
}

/**
 * A true-color hex palette — deck-style swatches, each editable in place. Names
 * are generated from each color via the tonal naming rules; typing over a name
 * pins it, and the override is remembered for that exact hex.
 */
export function Swatches({ props, onChange }: WidgetProps) {
  const label = String(props.label ?? 'Palette');
  const [items, setItems] = useState<Swatch[]>(() => asSwatches(parseJson(props.swatchesJson, [])));
  const [overrides, setOverrides] = useState<Record<string, string>>(() => asOverrides(parseJson(props.overridesJson, {})));
  useEffect(() => setItems(asSwatches(parseJson(props.swatchesJson, []))), [props.swatchesJson]);
  useEffect(() => setOverrides(asOverrides(parseJson(props.overridesJson, {}))), [props.overridesJson]);

  const commit = (next: Swatch[], nextOverrides = overrides) =>
    onChange({ swatchesJson: JSON.stringify(next), overridesJson: JSON.stringify(nextOverrides) });

  // The name a hex should display: a remembered override wins, else the tonal rule.
  const resolveName = (hex: string, ov = overrides) => ov[normHex(hex)] ?? tonalName(hex);

  // Recolor a swatch. The name re-resolves unless the user pinned it: a pinned
  // name follows its color only while there's a remembered override for the new
  // hex; otherwise the pin is released and the tonal name takes over.
  const setHex = (i: number, hex: string) => setItems((cur) => cur.map((s, j) => {
    if (j !== i) return s;
    const override = overrides[normHex(hex)];
    return override
      ? { hex, name: override, auto: false }
      : { hex, name: tonalName(hex), auto: true };
  }));

  // Edit a name. Clearing it reverts to the generated name and forgets the
  // override; otherwise the typed name pins and is remembered for this hex.
  const setName = (i: number, raw: string) => {
    setItems((cur) => cur.map((s, j) => (j === i ? { ...s, name: raw, auto: false } : s)));
  };
  const commitName = (i: number) => {
    const s = items[i];
    if (!s) return;
    const typed = s.name.trim();
    const key = normHex(s.hex);
    const nextOverrides = { ...overrides };
    let next: Swatch[];
    if (typed) {
      nextOverrides[key] = typed;
      next = items.map((x, j) => (j === i ? { ...x, name: typed, auto: false } : x));
    } else {
      delete nextOverrides[key];
      next = items.map((x, j) => (j === i ? { ...x, name: tonalName(x.hex), auto: true } : x));
    }
    setOverrides(nextOverrides);
    setItems(next);
    commit(next, nextOverrides);
  };

  const add = () => {
    const used = new Set(items.map((s) => normHex(s.hex)));
    const hex = uniqueHex(used);
    const next = [...items, { hex, name: resolveName(hex), auto: !overrides[normHex(hex)] }];
    setItems(next);
    commit(next);
  };
  const remove = (i: number) => { const next = items.filter((_, j) => j !== i); setItems(next); commit(next); };

  return (
    <Frame label={label} onLabel={(l) => onChange({ label: l })}>
      <div className="flex flex-wrap gap-3">
        {items.map((s, i) => (
          <div key={i} className="group/sw flex w-24 flex-col items-stretch gap-1">
            <div className="relative">
              <input
                type="color"
                value={HEX_RE.test(s.hex) ? s.hex : '#000000'}
                onChange={(e) => setHex(i, e.target.value)}
                onBlur={() => commit(items)}
                title="Pick color"
                className="h-12 w-full cursor-pointer rounded-lg border border-line p-0"
                style={{ backgroundColor: s.hex }}
              />
              <button
                type="button"
                title="Remove color"
                onClick={() => remove(i)}
                className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full border border-line bg-surface text-[9px] text-muted opacity-0 transition-opacity hover:text-oxblood group-hover/sw:opacity-100"
              >
                ✕
              </button>
            </div>
            <input
              value={s.name}
              onChange={(e) => setName(i, e.target.value)}
              onBlur={() => commitName(i)}
              placeholder="name"
              title={s.auto ? 'Auto-named — type to rename' : 'Custom name — clear to auto-name'}
              className={clsx(
                'w-full border-none bg-transparent p-0 text-center text-xs font-medium placeholder:text-muted/55 focus:outline-none focus:ring-0',
                s.auto ? 'text-muted italic' : 'text-ink',
              )}
            />
            <input
              value={s.hex}
              onChange={(e) => setHex(i, e.target.value)}
              onBlur={() => commit(items)}
              placeholder="#000000"
              className="w-full border-none bg-transparent p-0 text-center font-mono text-[10px] uppercase text-muted placeholder:text-muted/55 focus:outline-none focus:ring-0"
            />
          </div>
        ))}
        <button
          type="button"
          onClick={add}
          className="flex h-12 w-24 items-center justify-center self-start rounded-lg border border-dashed border-line text-sm text-muted hover:border-brass hover:text-ink"
        >
          + color
        </button>
      </div>
    </Frame>
  );
}

// ── Child pages ──────────────────────────────────────────────────────────────

// A live card grid of this page's own children — for pages (a Story index, a
// Systems hub) whose real content *is* its children, so the cards can sit right
// under the heading instead of the fixed list the page used to grow at the
// bottom, leaving a blank gap above it. Membership is automatic and always
// current (every child, live, via useDocs) — there's nothing to pick or
// maintain. The one editable bit per card is a display-title override (same
// auto/custom idiom as Swatches' color names): typing over a title pins it for
// that card, clearing it reverts to the real page title. The real title itself
// — used everywhere else (sidebar, URL, mentions) — is never touched.

/** First ~140 chars of a child's own body, for a short card excerpt. */
function childExcerpt(body: string): string {
  const text = blocksToPlainText(parseBody(body)).trim().replace(/\s+/g, ' ');
  return text.length > 140 ? `${text.slice(0, 140).trimEnd()}…` : text;
}

function ChildPageCard({
  href,
  realTitle,
  title,
  overridden,
  excerpt,
  onRename,
  colors,
}: {
  href: string;
  realTitle: string;
  title: string;
  overridden: boolean;
  excerpt: string;
  onRename: (next: string) => void;
  colors: RowColors | null;
}) {
  const [v, setV] = useState(title);
  useEffect(() => setV(title), [title]);

  return (
    <div
      className="group/card relative overflow-hidden rounded-xl border border-line bg-surface shadow-[0_4px_14px_rgba(26,37,48,0.06)]"
      style={
        colors
          ? { backgroundColor: colors.fill, boxShadow: `0 4px 14px rgba(26,37,48,0.06), inset 3px 0 0 ${colors.rail}` }
          : undefined
      }
    >
      <a href={href} aria-label={`Open ${realTitle}`} className="absolute inset-0" />
      <div className="relative space-y-1.5 p-4 pointer-events-none">
        <input
          value={v}
          onChange={(e) => setV(e.target.value)}
          onBlur={() => { if (v !== title) onRename(v); }}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          placeholder={realTitle}
          title={overridden ? 'Custom label — clear to use the page title' : 'Using the page title — type to rename this card'}
          className="relative z-10 w-full pointer-events-auto border-none bg-transparent p-0 text-base font-semibold text-ink placeholder:text-muted/55 focus:outline-none focus:ring-0"
        />
        {excerpt && <p className="text-sm leading-relaxed text-muted">{excerpt}</p>}
      </div>
    </div>
  );
}

/** A live grid of the current page's child pages, as navigable cards. */
export function ChildPages({ props, onChange, docId }: WidgetProps) {
  const { docs } = useDocs();
  const label = String(props.label ?? 'Child pages');
  const columns = [1, 2, 3].includes(Number(props.columns)) ? Number(props.columns) : 3;
  const overrides = parseJson<Record<string, string>>(props.titlesJson, {});

  const children = useMemo(
    () => docs.filter((d) => d.parentId === docId).sort((a, b) => a.order - b.order || a.title.localeCompare(b.title)),
    [docs, docId],
  );

  const rename = (childId: string, realTitle: string, value: string) => {
    const trimmed = value.trim();
    const next = { ...overrides };
    if (!trimmed || trimmed === realTitle) delete next[childId];
    else next[childId] = trimmed;
    onChange({ titlesJson: JSON.stringify(next) });
  };

  const colsSelect = (
    <label className="inline-flex items-center gap-1 text-[11px] text-muted">
      cols
      <select
        value={columns}
        onChange={(e) => onChange({ columns: Number(e.target.value) })}
        className="rounded border border-line px-1 py-0.5"
      >
        {[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
    </label>
  );

  return (
    <Frame label={label} onLabel={(l) => onChange({ label: l })} right={colsSelect}>
      {children.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-3 py-4 text-center text-sm text-muted">
          No child pages yet — they'll appear here automatically once you add some.
        </p>
      ) : (
        <div className={clsx('grid gap-4', COL_CLASS[columns])}>
          {children.map((child) => {
            const resolved = resolveRowHue(docs, child.id);
            return (
              <ChildPageCard
                key={child.id}
                href={`/docs/${child.id}`}
                realTitle={child.title}
                title={overrides[child.id] ?? child.title}
                overridden={child.id in overrides}
                excerpt={childExcerpt(child.body)}
                onRename={(v) => rename(child.id, child.title, v)}
                colors={resolved ? rowColors(resolved.hue, resolved.depth) : null}
              />
            );
          })}
        </div>
      )}
    </Frame>
  );
}
