// Page hierarchy colour — an optional per-page hue that tints the page's row in
// the docs sidebar (DocsTree). This is deliberately a *different* concept from
// the page color-legend (src/lib/docs/legend.ts, a within-page block vocabulary
// keyed to named Tailwind ramps): here a single hue is a structural signal on
// the page tree. Assign a hue to a page and every descendant that has no hue of
// its own inherits it, softened a little per level, so a whole branch reads as
// one tonal family.
//
// Colours are generated in OKLCH, not the named Tailwind ramps, for two reasons
// the goal calls for:
//   • "the entire hue spectrum" — hue is a free 0–359 angle, and OKLCH keeps the
//     wheel perceptually even (no dark-blue / glaring-yellow lopsidedness HSL has).
//   • "the theme's comfortable range" — lightness and chroma are *fixed* by this
//     module to a narrow, parchment-friendly band, so no hue can be picked neon
//     or muddy. The author only ever chooses an angle; the paper tone is ours.
//
// Pure and server-safe (string maths only, no React) so the block model, the
// sidebar, and any script can all derive identical colours.

import type { DocNode } from '@/lib/schema/doc';

/** Curated hue stops offered as one-click swatches in the picker. Evenly spread
 *  around the OKLCH wheel; any hue 0–359 is still valid (the slider is free), so
 *  these are comfortable presets, not the whole vocabulary. Names are flavour. */
export const HUE_STOPS: ReadonlyArray<{ hue: number; name: string }> = [
  { hue: 25, name: 'Ember' },
  { hue: 50, name: 'Amber' },
  { hue: 80, name: 'Ochre' },
  { hue: 120, name: 'Moss' },
  { hue: 150, name: 'Fern' },
  { hue: 180, name: 'Viridian' },
  { hue: 210, name: 'Teal' },
  { hue: 240, name: 'Steel' },
  { hue: 265, name: 'Indigo' },
  { hue: 295, name: 'Violet' },
  { hue: 325, name: 'Mulberry' },
  { hue: 350, name: 'Rose' },
];

/** Normalise any stored value into a clean integer hue, or null. */
export function coerceHue(raw: unknown): number | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  return ((Math.round(raw) % 360) + 360) % 360;
}

/** The CSS strings a tinted row needs. Everything is OKLCH so a single hue angle
 *  produces a coherent set (faint fill, legible rail, deep active fill). */
export type RowColors = {
  /** Idle row background — a faint wash of the hue on cream paper. */
  fill: string;
  /** Hover row background — the same wash, a touch deeper. */
  fillHover: string;
  /** Left accent rail — saturated enough to name the colour even when the fill is subtle. */
  rail: string;
  /** Background when this row is the open page — a deep, confident version of the hue. */
  activeBg: string;
  /** Text colour to sit on `activeBg`. */
  activeInk: string;
};

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** A single, mid-tone representative of a hue — the picker swatch / legend dot.
 *  Same comfortable band the rows live in, just at readable strength. */
export function hueSwatch(hue: number): string {
  return `oklch(0.70 0.135 ${hue})`;
}

/**
 * Resolve the row colours for a hue at a given inheritance `depth`.
 *
 *   depth 0  = the page that actually owns the hue (strongest)
 *   depth 1+ = a descendant inheriting it — each level lighter and a little less
 *              saturated, so the colour visibly "drains" down the branch while
 *              staying unmistakably the same family.
 *
 * Lightness and chroma are clamped to the parchment-comfortable band regardless
 * of hue or depth — that is what keeps the whole spectrum usable without any
 * angle reading as harsh on the cream sidebar.
 */
export function rowColors(hue: number, depth: number): RowColors {
  const d = clamp(depth, 0, 4); // fading caps after a few levels so deep trees stay legible

  // Idle fill: very light, low chroma; softens (lighter + greyer) with depth.
  const fillL = clamp(0.905 + d * 0.013, 0.9, 0.955);
  const fillC = clamp(0.055 - d * 0.008, 0.018, 0.055);

  // Hover: the same wash pushed a touch deeper for feedback.
  const hoverL = clamp(fillL - 0.03, 0.86, 0.95);
  const hoverC = clamp(fillC + 0.012, 0.02, 0.07);

  // Rail: mid lightness, real chroma so the hue is named at a glance; fades gently.
  const railL = clamp(0.66 + d * 0.018, 0.62, 0.74);
  const railC = clamp(0.13 - d * 0.012, 0.055, 0.13);

  return {
    fill: `oklch(${fillL.toFixed(3)} ${fillC.toFixed(3)} ${hue})`,
    fillHover: `oklch(${hoverL.toFixed(3)} ${hoverC.toFixed(3)} ${hue})`,
    rail: `oklch(${railL.toFixed(3)} ${railC.toFixed(3)} ${hue})`,
    // Active state is depth-independent: the open page should always read at full
    // confidence, whoever it inherited its hue from.
    activeBg: `oklch(0.42 0.095 ${hue})`,
    activeInk: `oklch(0.975 0.012 ${hue})`,
  };
}

/** A horizontal gradient of the *comfortable* swatch band across the wheel — used
 *  to paint the hue slider so it previews the real (paper-tuned) palette, not a
 *  raw neon rainbow. */
export function spectrumGradient(): string {
  const stops: string[] = [];
  for (let h = 0; h <= 360; h += 30) stops.push(`${hueSwatch(h % 360)} ${(h / 360) * 100}%`);
  return `linear-gradient(to right, ${stops.join(', ')})`;
}

/**
 * Walk from a page up its ancestors to find the hue that should colour its row.
 * Returns the owning hue plus the `depth` below the owner (0 = the page owns it),
 * or null when no page in the chain has a hue. O(chain length); `byId` lets the
 * caller hoist the index when colouring a whole tree.
 */
export function resolveRowHue(
  docs: DocNode[],
  id: string,
  byId?: Map<string, DocNode>,
): { hue: number; depth: number } | null {
  const index = byId ?? new Map(docs.map((d) => [d.id, d]));
  let node = index.get(id);
  let depth = 0;
  // Guard against a malformed parent cycle so this can never spin forever.
  const seen = new Set<string>();
  while (node && !seen.has(node.id)) {
    seen.add(node.id);
    const own = coerceHue(node.hue);
    if (own !== null) return { hue: own, depth };
    if (!node.parentId) return null;
    node = index.get(node.parentId);
    depth += 1;
  }
  return null;
}
