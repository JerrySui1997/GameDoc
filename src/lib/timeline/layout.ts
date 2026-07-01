// ── Narrative Timeline geometry ─────────────────────────────────────────────
// Pure, server-safe math for the timeline ribbon. The widget renders an SVG
// ribbon under HTML moment nodes; this module decides where each moment sits and
// emits the smooth path between them. Kept free of React / DOM so it can be unit-
// tested and reused by SSR, scripts, and the editor alike.
//
// All coordinates live in one fixed virtual canvas of CANVAS_W units wide by a
// computed height; the renderer maps those units to a relative box of the same
// aspect ratio, so positions and stroke widths stay undistorted at any size.

import type { Moment, Timeline, TimelineLayout } from './types';

export const CANVAS_W = 1000;
// The stage scales by aspect ratio (so the ribbon never distorts), which means
// these vertical canvas units must leave a full card's worth of room between
// rows: at the stage's minimum width (.tl-stage min-width in globals.css) the
// row pitch has to fit a below-card from the upper row *and* an above-card from
// the lower row without either touching the ribbon line. Hence the generous
// ROW_H / pads — undersizing them is exactly what made moments overlap.
const MARGIN_X = 120; // horizontal breathing room at the canvas edges
const ROW_H = 480; // vertical pitch between serpentine rows (room for two stacked cards)
const TOP_PAD = 110; // space above the first row
const BOT_PAD = 230; // space below the last row (holds the final row's below-cards)
const WAVE_H = 520; // single-row height used by the wave layout
const FREE_H = 680; // canvas height used by the free layout

export type Pt = { x: number; y: number };

/** How tall the virtual canvas is for a given spine — drives the stage's
 *  aspect-ratio so the SVG scales without distortion. */
export function canvasHeight(layout: TimelineLayout, count: number, density: number): number {
  if (layout === 'wave') return WAVE_H;
  if (layout === 'free') return FREE_H;
  const per = Math.max(2, density);
  const rows = Math.max(1, Math.ceil(Math.max(1, count) / per));
  return TOP_PAD + (rows - 1) * ROW_H + BOT_PAD;
}

/** The default arrangement for `free` moments that have no stored pos yet: a
 *  uniform horizontal line — a "wave" with zero flow — spread evenly across the
 *  canvas at its vertical middle. So switching to the free layout (or dropping a
 *  new node) starts from a clean, even spine the designer then drags nodes off
 *  of, instead of a scattered grid. */
function freeFallback(index: number, total: number, height: number): Pt {
  const innerW = CANVAS_W - 2 * MARGIN_X;
  const fx = total <= 1 ? 0.5 : index / (total - 1);
  return { x: MARGIN_X + fx * innerW, y: height / 2 };
}

/**
 * The on-canvas point for every moment, in spine order. `serpentine` lays beats
 * out in boustrophedon rows (left→right, then right→left) so a Catmull-Rom spline
 * through them reads as a single winding ribbon. `wave` rides one sine row.
 * `free` honors each moment's stored position, defaulting any un-placed moment
 * to a uniform horizontal line (a zero-flow wave) as its starting point.
 */
export function momentPoints(tl: Timeline): Pt[] {
  const { moments, layout, density, amplitude } = tl;
  const n = moments.length;
  const height = canvasHeight(layout, n, density);
  const innerW = CANVAS_W - 2 * MARGIN_X;
  const amp = amplitude / 100;

  if (layout === 'free') {
    return moments.map((mm, i) => {
      if (mm.pos) return { x: mm.pos.x * CANVAS_W, y: mm.pos.y * height };
      return freeFallback(i, n, height);
    });
  }

  if (layout === 'wave') {
    const mid = height / 2;
    return moments.map((mm, i) => {
      const fx = n === 1 ? 0.5 : i / (n - 1);
      const x = MARGIN_X + fx * innerW;
      const y = mid + Math.sin(i * 0.85) * amp * (height * 0.34);
      return { x, y };
    });
  }

  // serpentine
  const per = Math.max(2, density);
  return moments.map((mm, i) => {
    const row = Math.floor(i / per);
    const col = i % per;
    const ltr = row % 2 === 0;
    let fx = per === 1 ? 0.5 : col / (per - 1);
    if (!ltr) fx = 1 - fx;
    const x = MARGIN_X + fx * innerW;
    // A gentle arc across each row gives the ribbon its hand-drawn waviness.
    const arc = Math.sin(fx * Math.PI) * amp * 36;
    const y = TOP_PAD + row * ROW_H + arc;
    return { x, y };
  });
}

/**
 * One cubic-Bezier `d` string per segment between consecutive points, derived
 * from a Catmull-Rom spline (tangents from the neighbours). Returning a path
 * *per segment* lets the renderer stroke each leg in its starting moment's act
 * color, so the ribbon shifts hue as the story moves between acts.
 */
export function splineSegments(points: Pt[]): string[] {
  if (points.length < 2) return [];
  const segs: string[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? points[i + 1];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    segs.push(`M ${r(p1.x)},${r(p1.y)} C ${r(c1x)},${r(c1y)} ${r(c2x)},${r(c2y)} ${r(p2.x)},${r(p2.y)}`);
  }
  return segs;
}

/** The whole ribbon as a single smooth path — used for the soft under-shadow
 *  beneath the colored segments. */
export function splinePath(points: Pt[]): string {
  const segs = splineSegments(points);
  if (segs.length === 0) {
    const p = points[0];
    return p ? `M ${r(p.x)},${r(p.y)}` : '';
  }
  // Join: keep the first full move+curve, then append only the curve parts.
  return segs
    .map((s, i) => (i === 0 ? s : s.replace(/^M [^C]*/, '')))
    .join(' ');
}

/** Clamp a normalized free-layout position into the drawable canvas. */
export function clampPos(x: number, y: number): { x: number; y: number } {
  const mx = MARGIN_X / CANVAS_W;
  return {
    x: Math.min(1 - mx * 0.4, Math.max(mx * 0.4, x)),
    y: Math.min(0.94, Math.max(0.06, y)),
  };
}

function r(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Map a moment to its act color, falling back to a neutral ink. */
export function momentColor(moment: Moment, acts: Timeline['acts']): string {
  return acts.find((a) => a.id === moment.actId)?.color ?? '#9aa7ad';
}
