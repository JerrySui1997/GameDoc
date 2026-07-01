// ── Hexel Map geometry ──────────────────────────────────────────────────────
// Pure, server-safe isometric math for the voxel scene. The widget renders SVG
// cubes under an HTML overlay; this module decides where each voxel projects, in
// what order to paint them, which voxel sits under the cursor, and the screen
// polygons of a cube's visible faces. Kept free of React / DOM so it can be
// unit-tested and reused by SSR, scripts, and the editor alike.
//
// Coordinates: (x, y) is the ground plane, z is up (height). The view yaws about
// the up axis in 90° steps (Rotation), and the classic 2:1 isometric projection
// flattens the rotated lattice to the screen. Screen units are abstract — the
// renderer scales the whole stage by zoom — so the constants below are just a
// convenient base tile size.

import type { Rotation } from './types';

export const TILE_W = 32; // projected width of a unit cell (screen units at zoom 1)
export const TILE_H = 16; // projected height of a unit cell (2:1 isometric)
export const LEVEL_H = 16; // vertical screen rise per z level

export type Pt = { x: number; y: number };
export type Cell3 = { x: number; y: number; z: number };

// ── Yaw rotation about the up axis ──────────────────────────────────────────
// A 90°-stepped rotation of the ground-plane coordinates. Rotating the world
// opposite to the camera lets the same projection serve all four views; the only
// thing that changes per yaw is which corners/faces face front, which falls out
// of the rotated coordinates and the depth sort.

/** Rotate a planar point by the given yaw (CCW). */
export function rotateXY(x: number, y: number, rot: Rotation): Pt {
  switch (rot) {
    case 90: return { x: -y, y: x };
    case 180: return { x: -x, y: -y };
    case 270: return { x: y, y: -x };
    default: return { x, y };
  }
}

/** The inverse of {@link rotateXY} — recover world coords from rotated ones. */
export function unrotateXY(x: number, y: number, rot: Rotation): Pt {
  switch (rot) {
    case 90: return { x: y, y: -x };
    case 180: return { x: -x, y: -y };
    case 270: return { x: -y, y: x };
    default: return { x, y };
  }
}

// ── Projection ──────────────────────────────────────────────────────────────

export type Projected = { sx: number; sy: number; depth: number };

/** Project a (possibly fractional) lattice point to the screen for a yaw. The
 *  returned `depth` (rotated x+y) is the primary painter's-order key; height is
 *  the tie-breaker, applied by {@link paintOrder}. */
export function project(x: number, y: number, z: number, rot: Rotation): Projected {
  const r = rotateXY(x, y, rot);
  return {
    sx: (r.x - r.y) * (TILE_W / 2),
    sy: (r.x + r.y) * (TILE_H / 2) - z * LEVEL_H,
    depth: r.x + r.y,
  };
}

/** Inverse projection at a fixed height: the integer ground cell under a screen
 *  point on the z-plane. Used to paint onto empty floor. */
export function unproject(sx: number, sy: number, rot: Rotation, z = 0): Pt {
  const syTop = sy + z * LEVEL_H;
  const a = sx / (TILE_W / 2); // = rx - ry
  const b = syTop / (TILE_H / 2); // = rx + ry
  const rx = (a + b) / 2;
  const ry = (b - a) / 2;
  const w = unrotateXY(rx, ry, rot);
  return { x: Math.floor(w.x + 0.5), y: Math.floor(w.y + 0.5) };
}

// ── Paint order ──────────────────────────────────────────────────────────────

/** Sort cells back-to-front for the current yaw: by projected depth (rotated
 *  x+y) ascending, then by height ascending, so nearer / higher voxels overdraw
 *  the ones behind and below them. Returns a new array. */
export function paintOrder<T extends Cell3>(cells: T[], rot: Rotation): T[] {
  return [...cells].sort((a, b) => {
    const da = rotateXY(a.x, a.y, rot);
    const db = rotateXY(b.x, b.y, rot);
    const sa = da.x + da.y;
    const sb = db.x + db.y;
    if (sa !== sb) return sa - sb;
    return a.z - b.z;
  });
}

// ── Cube faces (screen polygons) ─────────────────────────────────────────────

const SIDE_DIRS: ReadonlyArray<Pt> = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

/** A cube's visible faces in screen space for a yaw: the top quad plus the (up
 *  to two) side quads whose outward normal faces the viewer. Each side carries
 *  the world direction of its neighbour so the renderer can cull interior faces.
 *  Voxel (x,y,z) occupies the unit cube [x,x+1]×[y,y+1]×[z,z+1]. */
export type CubeFaces = {
  top: Pt[];
  sides: { dir: Pt; quad: Pt[] }[];
};

function p(x: number, y: number, z: number, rot: Rotation): Pt {
  const pr = project(x, y, z, rot);
  return { x: pr.sx, y: pr.sy };
}

export function cubeFaces(x: number, y: number, z: number, rot: Rotation): CubeFaces {
  const top: Pt[] = [
    p(x, y, z + 1, rot),
    p(x + 1, y, z + 1, rot),
    p(x + 1, y + 1, z + 1, rot),
    p(x, y + 1, z + 1, rot),
  ];

  const sides: { dir: Pt; quad: Pt[] }[] = [];
  for (const dir of SIDE_DIRS) {
    // A face is front-facing when its rotated outward normal points toward the
    // viewer (positive depth contribution, rx+ry > 0).
    const rn = rotateXY(dir.x, dir.y, rot);
    if (rn.x + rn.y <= 0) continue;

    let quad: Pt[];
    if (dir.x === 1) {
      quad = [p(x + 1, y, z, rot), p(x + 1, y + 1, z, rot), p(x + 1, y + 1, z + 1, rot), p(x + 1, y, z + 1, rot)];
    } else if (dir.x === -1) {
      quad = [p(x, y, z, rot), p(x, y + 1, z, rot), p(x, y + 1, z + 1, rot), p(x, y, z + 1, rot)];
    } else if (dir.y === 1) {
      quad = [p(x, y + 1, z, rot), p(x + 1, y + 1, z, rot), p(x + 1, y + 1, z + 1, rot), p(x, y + 1, z + 1, rot)];
    } else {
      quad = [p(x, y, z, rot), p(x + 1, y, z, rot), p(x + 1, y, z + 1, rot), p(x, y, z + 1, rot)];
    }
    sides.push({ dir, quad });
  }
  return { top, sides };
}

/** Screen polygon `points` attribute for an SVG `<polygon>`. */
export function polyPoints(quad: Pt[]): string {
  return quad.map((pt) => `${r1(pt.x)},${r1(pt.y)}`).join(' ');
}

function r1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ── Picking ───────────────────────────────────────────────────────────────────

/** Whether a screen point lies inside a convex screen quad (winding test). */
export function pointInQuad(px: number, py: number, quad: Pt[]): boolean {
  let sign = 0;
  for (let i = 0; i < quad.length; i++) {
    const a = quad[i];
    const b = quad[(i + 1) % quad.length];
    const cross = (b.x - a.x) * (py - a.y) - (b.y - a.y) * (px - a.x);
    if (cross !== 0) {
      const s = cross > 0 ? 1 : -1;
      if (sign === 0) sign = s;
      else if (s !== sign) return false;
    }
  }
  return true;
}

/** The topmost voxel whose top face is under the cursor — front-to-back, so a
 *  raised cell wins over the floor beneath it. Null when the cursor hits no top
 *  face (the caller then falls back to {@link unproject} to paint empty floor). */
export function pick<T extends Cell3>(sx: number, sy: number, rot: Rotation, cells: T[]): T | null {
  const ordered = paintOrder(cells, rot);
  for (let i = ordered.length - 1; i >= 0; i--) {
    const c = ordered[i];
    const { top } = cubeFaces(c.x, c.y, c.z, rot);
    if (pointInQuad(sx, sy, top)) return c;
  }
  return null;
}
