// Page color legend — a small, page-level controlled vocabulary mapping a named
// color to an author-defined meaning ("red = needs work", "blue = lore", …). A
// page pre-defines its legend at the top, and any prose (text-body) block can be
// tagged with one of the legend's colors by *id* (so re-coloring a legend entry
// re-tints every block that references it, and a stable id survives label edits).
//
// This module is pure and server-safe — string constants only, no React — so it
// runs in the block model, the Yjs funnel, scripts and the editor alike.

export const LEGEND_COLORS = [
  'slate', 'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal',
  'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose',
] as const;
export type LegendColor = (typeof LEGEND_COLORS)[number];

const COLOR_SET: ReadonlySet<string> = new Set(LEGEND_COLORS);
export function isLegendColor(value: string): value is LegendColor {
  return COLOR_SET.has(value);
}

/** One legend row: a stable id, a controlled color, and the meaning the author
 *  assigns to it. Blocks reference the `id`, never the color or label. */
export type LegendEntry = { id: string; color: LegendColor; label: string };
export type PageLegend = LegendEntry[];

// ── Literal Tailwind classes per color ──────────────────────────────────────
// Tailwind v4 only emits classes it sees literally in source, so a dynamic
// `bg-${color}-50` would never be generated — every class here is spelled out.
// `swatch` is the solid dot (picker + legend chip), `bar`/`tint` are the rail and
// faint wash on a tagged block (mirroring the widget look), and `text`/`border`
// style the editable legend chip.
export type LegendStyle = { swatch: string; bar: string; tint: string; text: string; border: string };

export const LEGEND_STYLE: Record<LegendColor, LegendStyle> = {
  slate:   { swatch: 'bg-slate-500',   bar: 'bg-slate-400',   tint: 'bg-slate-50',   text: 'text-slate-700',   border: 'border-slate-200' },
  red:     { swatch: 'bg-red-500',     bar: 'bg-red-400',     tint: 'bg-red-50',     text: 'text-red-700',     border: 'border-red-200' },
  orange:  { swatch: 'bg-orange-500',  bar: 'bg-orange-400',  tint: 'bg-orange-50',  text: 'text-orange-700',  border: 'border-orange-200' },
  amber:   { swatch: 'bg-amber-500',   bar: 'bg-amber-400',   tint: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200' },
  yellow:  { swatch: 'bg-yellow-500',  bar: 'bg-yellow-400',  tint: 'bg-yellow-50',  text: 'text-yellow-700',  border: 'border-yellow-200' },
  lime:    { swatch: 'bg-lime-500',    bar: 'bg-lime-400',    tint: 'bg-lime-50',    text: 'text-lime-700',    border: 'border-lime-200' },
  green:   { swatch: 'bg-green-500',   bar: 'bg-green-400',   tint: 'bg-green-50',   text: 'text-green-700',   border: 'border-green-200' },
  emerald: { swatch: 'bg-emerald-500', bar: 'bg-emerald-400', tint: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  teal:    { swatch: 'bg-teal-500',    bar: 'bg-teal-400',    tint: 'bg-teal-50',    text: 'text-teal-700',    border: 'border-teal-200' },
  cyan:    { swatch: 'bg-cyan-500',    bar: 'bg-cyan-400',    tint: 'bg-cyan-50',    text: 'text-cyan-700',    border: 'border-cyan-200' },
  sky:     { swatch: 'bg-sky-500',     bar: 'bg-sky-400',     tint: 'bg-sky-50',     text: 'text-sky-700',     border: 'border-sky-200' },
  blue:    { swatch: 'bg-blue-500',    bar: 'bg-blue-400',    tint: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200' },
  indigo:  { swatch: 'bg-indigo-500',  bar: 'bg-indigo-400',  tint: 'bg-indigo-50',  text: 'text-indigo-700',  border: 'border-indigo-200' },
  violet:  { swatch: 'bg-violet-500',  bar: 'bg-violet-400',  tint: 'bg-violet-50',  text: 'text-violet-700',  border: 'border-violet-200' },
  purple:  { swatch: 'bg-purple-500',  bar: 'bg-purple-400',  tint: 'bg-purple-50',  text: 'text-purple-700',  border: 'border-purple-200' },
  fuchsia: { swatch: 'bg-fuchsia-500', bar: 'bg-fuchsia-400', tint: 'bg-fuchsia-50', text: 'text-fuchsia-700', border: 'border-fuchsia-200' },
  pink:    { swatch: 'bg-pink-500',    bar: 'bg-pink-400',    tint: 'bg-pink-50',    text: 'text-pink-700',    border: 'border-pink-200' },
  rose:    { swatch: 'bg-rose-500',    bar: 'bg-rose-400',    tint: 'bg-rose-50',    text: 'text-rose-700',    border: 'border-rose-200' },
};

/** A stable, collision-resistant id for a new legend entry (mirrors makeBlockId). */
export function makeLegendId(): string {
  return `lg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Coerce one loosely-stored legend row, or null when unusable. */
function coerceLegendEntry(raw: unknown): LegendEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === 'string' && r.id ? r.id : makeLegendId();
  const color = typeof r.color === 'string' && isLegendColor(r.color) ? r.color : 'slate';
  const label = typeof r.label === 'string' ? r.label : '';
  return { id, color, label };
}

/** Coerce a stored legend value into a clean, id-deduplicated PageLegend. */
export function coerceLegend(raw: unknown): PageLegend {
  if (!Array.isArray(raw)) return [];
  const out: LegendEntry[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const entry = coerceLegendEntry(item);
    if (!entry || seen.has(entry.id)) continue;
    seen.add(entry.id);
    out.push(entry);
  }
  return out;
}
