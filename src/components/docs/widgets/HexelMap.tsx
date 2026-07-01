'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  cubeFaces,
  paintOrder,
  pick,
  polyPoints,
  project,
  unproject,
  type Pt,
} from '@/lib/hexel/layout';
import {
  ROTATIONS,
  TILE_ROLES,
  asScene,
  cellKey,
  makeAnnotation,
  makeCell,
  makeTile,
  serializeScene,
  tileById,
  type Cell,
  type HexelScene,
  type PaletteTile,
  type Rotation,
  type TileRole,
  type Vec3,
} from '@/lib/hexel/types';
import { inferSemantics, type SpaceNode } from '@/lib/hexel/infer';
import { toOBJ, toPlanes, toSceneJSON } from '@/lib/hexel/scene';
import { parseJson } from '../blocks/shared';
import type { WidgetProps } from './types';

/** Trigger a client-side file download of generated text. */
function download(name: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Hexel Map widget ─────────────────────────────────────────────────────────
// A rotatable isometric paint tool. You paint raw marks (materials, markers) onto
// a 3D voxel lattice; an inference engine reads the paint live and shows what it
// means (typed spaces, features, relations) as a tinted overlay. The scene yaws
// about the up axis in four 90° steps and exports as a real 3D scene. Only the
// paint + a few sparse annotations persist (in the `dataJson` block prop); the
// semantics are recomputed, never stored — the same convention as the other rich
// widgets (edit a local copy, commit on discrete actions / stroke-end).

type Tool = 'brush' | 'erase' | 'raise' | 'fill' | 'eyedropper' | 'pan' | 'inspect';

const TOOLS: { id: Tool; glyph: string; label: string }[] = [
  { id: 'brush', glyph: '✎', label: 'Brush — paint the active material' },
  { id: 'erase', glyph: '⌫', label: 'Erase the topmost voxel' },
  { id: 'raise', glyph: '⤒', label: 'Raise — stack a voxel to build height' },
  { id: 'fill', glyph: '▦', label: 'Fill a contiguous same-material region' },
  { id: 'eyedropper', glyph: '◇', label: 'Pick the material under the cursor' },
  { id: 'pan', glyph: '✋', label: 'Pan the view' },
  { id: 'inspect', glyph: '🔍', label: 'Inspect / annotate a space' },
];

const ZOOM_MIN = 0.35;
const ZOOM_MAX = 3;

// ── Colour helpers ───────────────────────────────────────────────────────────

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}
/** Multiply a hex colour's channels — used to shade the side faces of a cube. */
function shade(hex: string, factor: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = clampByte(((n >> 16) & 255) * factor);
  const g = clampByte(((n >> 8) & 255) * factor);
  const b = clampByte((n & 255) * factor);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}
/** A stable hue for a space id, for the live segmentation tint. */
function hueFor(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % 360;
}

// ── View framing ─────────────────────────────────────────────────────────────

/** A stable SVG viewBox from the lattice bounds projected at a yaw, so the frame
 *  doesn't jump as you paint (we fit the whole bounds, not the current cells). */
function frameFor(bounds: Vec3, rot: Rotation): string {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const x of [0, bounds.x]) {
    for (const y of [0, bounds.y]) {
      for (const z of [0, bounds.z]) {
        const p = project(x, y, z, rot);
        minX = Math.min(minX, p.sx); maxX = Math.max(maxX, p.sx);
        minY = Math.min(minY, p.sy); maxY = Math.max(maxY, p.sy);
      }
    }
  }
  const pad = 40;
  return `${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`;
}

export function HexelMap({ props, onChange }: WidgetProps) {
  const [scene, setScene] = useState<HexelScene>(() => asScene(parseJson(props.dataJson, {})));
  const sceneRef = useRef(scene);
  sceneRef.current = scene;
  useEffect(() => setScene(asScene(parseJson(props.dataJson, {}))), [props.dataJson]);

  const live = (next: HexelScene) => setScene(next);
  const commit = useCallback(
    (next: HexelScene) => {
      setScene(next);
      onChange({ dataJson: serializeScene(next) });
    },
    [onChange],
  );

  const [tool, setTool] = useState<Tool>('brush');
  const [activeTileId, setActiveTileId] = useState<string>(() => scene.palette[0]?.id ?? '');
  const [rot, setRot] = useState<Rotation>(scene.defaultRot);
  const [floorZ, setFloorZ] = useState(0);
  const [showSemantics, setShowSemantics] = useState(true);
  const [selectedSpace, setSelectedSpace] = useState<string | null>(null);
  const [view, setView] = useState({ zoom: 1, tx: 0, ty: 0 });

  useEffect(() => {
    if (!scene.palette.some((p) => p.id === activeTileId)) setActiveTileId(scene.palette[0]?.id ?? '');
  }, [scene.palette, activeTileId]);

  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement>(null);
  const painting = useRef(false);
  const lastCell = useRef<string>('');
  const panRef = useRef<{ sx: number; sy: number; tx: number; ty: number } | null>(null);

  // ── Derived state ────────────────────────────────────────────────────────────
  const cellsByKey = useMemo(() => {
    const m = new Map<string, Cell>();
    for (const c of scene.cells) m.set(cellKey(c), c);
    return m;
  }, [scene.cells]);
  const graph = useMemo(() => inferSemantics(scene), [scene]);
  const columnSpace = useMemo(() => {
    const m = new Map<string, SpaceNode>();
    for (const s of graph.spaces) for (const k of s.columns) m.set(k, s);
    return m;
  }, [graph]);
  const ordered = useMemo(() => paintOrder(scene.cells, rot), [scene.cells, rot]);
  const viewBox = useMemo(() => frameFor(scene.bounds, rot), [scene.bounds, rot]);
  const activeTile = tileById(scene, activeTileId);

  const topZAt = useCallback(
    (x: number, y: number): number => {
      let z = -1;
      for (const c of scene.cells) if (c.x === x && c.y === y) z = Math.max(z, c.z);
      return z;
    },
    [scene.cells],
  );

  // ── Pointer ↔ world ──────────────────────────────────────────────────────────
  const clientToLocal = useCallback((clientX: number, clientY: number, el: SVGGraphicsElement | null): Pt | null => {
    const m = el?.getScreenCTM();
    if (!m) return null;
    const p = new DOMPoint(clientX, clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  }, []);

  const inBounds = (x: number, y: number, z: number) =>
    x >= 0 && y >= 0 && z >= 0 && x < scene.bounds.x && y < scene.bounds.y && z < scene.bounds.z;

  // ── Paint operations (return the next scene, or null for a no-op) ─────────────
  const setCellAt = (s: HexelScene, x: number, y: number, z: number, t: string): HexelScene => {
    const key = cellKey({ x, y, z });
    const cells = s.cells.filter((c) => cellKey(c) !== key);
    cells.push(makeCell(x, y, z, t));
    return { ...s, cells };
  };
  const removeCell = (s: HexelScene, x: number, y: number, z: number): HexelScene => {
    const key = cellKey({ x, y, z });
    return { ...s, cells: s.cells.filter((c) => cellKey(c) !== key) };
  };

  const applyAt = (world: Pt, s: HexelScene): HexelScene | null => {
    if (tool === 'brush') {
      if (!activeTile) return null;
      const { x, y } = unproject(world.x, world.y, rot, floorZ);
      const z = activeTile.role === 'marker' ? floorZ + 1 : floorZ;
      if (!inBounds(x, y, z)) return null;
      const k = cellKey({ x, y, z });
      if (k === lastCell.current) return null; // already painted this cell in the stroke
      lastCell.current = k;
      return setCellAt(s, x, y, z, activeTile.id);
    }
    if (tool === 'erase') {
      const hit = pick(world.x, world.y, rot, s.cells);
      const target = hit ?? { ...unproject(world.x, world.y, rot, floorZ), z: floorZ };
      const k = cellKey(target);
      if (k === lastCell.current) return null;
      lastCell.current = k;
      return removeCell(s, target.x, target.y, target.z);
    }
    if (tool === 'raise') {
      if (!activeTile) return null;
      const hit = pick(world.x, world.y, rot, s.cells);
      const col = hit ?? unproject(world.x, world.y, rot, floorZ);
      const z = topZAt(col.x, col.y) + 1;
      if (!inBounds(col.x, col.y, z)) return null;
      const k = cellKey({ x: col.x, y: col.y, z });
      if (k === lastCell.current) return null;
      lastCell.current = k;
      return setCellAt(s, col.x, col.y, z, activeTile.id);
    }
    return null;
  };

  const floodFill = (world: Pt) => {
    if (!activeTile) return;
    const { x, y } = unproject(world.x, world.y, rot, floorZ);
    const start = cellsByKey.get(cellKey({ x, y, z: floorZ }));
    const fromTile = start?.t ?? '';
    if (fromTile === activeTile.id) return;
    const next = { ...scene, cells: scene.cells.map((c) => ({ ...c })) };
    const at = (cx: number, cy: number) => next.cells.find((c) => c.x === cx && c.y === cy && c.z === floorZ);
    const stack: [number, number][] = [[x, y]];
    const seen = new Set<string>();
    while (stack.length) {
      const [cx, cy] = stack.pop()!;
      const pk = `${cx},${cy}`;
      if (seen.has(pk) || !inBounds(cx, cy, floorZ)) continue;
      seen.add(pk);
      const cell = at(cx, cy);
      if ((cell?.t ?? '') !== fromTile) continue;
      if (cell) cell.t = activeTile.id;
      else next.cells.push(makeCell(cx, cy, floorZ, activeTile.id));
      stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
    }
    commit(next);
  };

  const selectSpaceAt = (world: Pt) => {
    const hit = pick(world.x, world.y, rot, scene.cells) ?? unproject(world.x, world.y, rot, floorZ);
    const sp = columnSpace.get(`${hit.x},${hit.y}`);
    setSelectedSpace(sp ? sp.id : null);
  };

  // ── Pointer handlers ─────────────────────────────────────────────────────────
  const onPointerDown = (e: React.PointerEvent) => {
    const world = clientToLocal(e.clientX, e.clientY, gRef.current);
    if (!world) return;
    const isPan = tool === 'pan' || e.button === 1 || e.button === 2;
    if (isPan) {
      const localVB = clientToLocal(e.clientX, e.clientY, svgRef.current);
      if (!localVB) return;
      panRef.current = { sx: localVB.x, sy: localVB.y, tx: view.tx, ty: view.ty };
      svgRef.current?.setPointerCapture(e.pointerId);
      return;
    }
    if (e.button !== 0) return;
    if (tool === 'eyedropper') {
      const hit = pick(world.x, world.y, rot, scene.cells);
      if (hit) setActiveTileId(hit.t);
      return;
    }
    if (tool === 'inspect') { selectSpaceAt(world); return; }
    if (tool === 'fill') { floodFill(world); return; }
    // Stroke tools: brush / erase / raise.
    painting.current = true;
    lastCell.current = '';
    svgRef.current?.setPointerCapture(e.pointerId);
    const next = applyAt(world, sceneRef.current);
    if (next) live(next);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (panRef.current) {
      const localVB = clientToLocal(e.clientX, e.clientY, svgRef.current);
      if (!localVB) return;
      const p = panRef.current;
      setView((v) => ({ ...v, tx: p.tx + (localVB.x - p.sx), ty: p.ty + (localVB.y - p.sy) }));
      return;
    }
    if (!painting.current) return;
    const world = clientToLocal(e.clientX, e.clientY, gRef.current);
    if (!world) return;
    const next = applyAt(world, sceneRef.current);
    if (next) live(next);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (panRef.current) {
      panRef.current = null;
      svgRef.current?.releasePointerCapture?.(e.pointerId);
      return;
    }
    if (painting.current) {
      painting.current = false;
      svgRef.current?.releasePointerCapture?.(e.pointerId);
      commit(sceneRef.current); // persist the whole stroke once
    }
  };

  // ctrl/⌘ + wheel zooms toward the cursor; a plain wheel scrolls the page.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const m = svg.getScreenCTM();
      if (!m) return;
      const c = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
      setView((v) => {
        const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
        const k = zoom / v.zoom;
        return { zoom, tx: c.x - k * (c.x - v.tx), ty: c.y - k * (c.y - v.ty) };
      });
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, []);

  // ── Discrete actions ─────────────────────────────────────────────────────────
  const rotate = (dir: -1 | 1) => {
    const i = (ROTATIONS.indexOf(rot) + dir + ROTATIONS.length) % ROTATIONS.length;
    setRot(ROTATIONS[i]);
  };
  const zoomBy = (f: number) =>
    setView((v) => ({ ...v, zoom: Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v.zoom * f)) }));
  const resetView = () => setView({ zoom: 1, tx: 0, ty: 0 });

  const addTile = () => {
    const t = makeTile(scene.palette.length, 'floor');
    commit({ ...scene, palette: [...scene.palette, t] });
    setActiveTileId(t.id);
  };
  const patchTile = (id: string, patch: Partial<PaletteTile>) =>
    commit({ ...scene, palette: scene.palette.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
  const deleteTile = (id: string) => {
    if (scene.palette.length <= 1) return;
    commit({ ...scene, palette: scene.palette.filter((p) => p.id !== id), cells: scene.cells.filter((c) => c.t !== id) });
  };

  const selected = selectedSpace ? graph.spaces.find((s) => s.id === selectedSpace) ?? null : null;
  const pinAnnotation = (patch: { kind?: string; name?: string; confirm?: boolean }) => {
    if (!selected) return;
    const ann = makeAnnotation(selected.seed, 'space');
    if (patch.kind) ann.kind = patch.kind;
    if (patch.name) ann.name = patch.name;
    if (patch.confirm) ann.op = 'confirm';
    // Replace any existing annotation on the same anchor so pins don't pile up.
    const annotations = scene.annotations.filter(
      (a) => !(a.anchor.x === ann.anchor.x && a.anchor.y === ann.anchor.y && a.scope === 'space' && a.op !== 'merge'),
    );
    commit({ ...scene, annotations: [...annotations, ann] });
  };

  // ── Render helpers ───────────────────────────────────────────────────────────
  const centroidPt = (s: SpaceNode): Pt => {
    const cx = (s.bbox.minX + s.bbox.maxX) / 2 + 0.5;
    const cy = (s.bbox.minY + s.bbox.maxY) / 2 + 0.5;
    const pr = project(cx, cy, s.bbox.maxZ + 1, rot);
    return { x: pr.sx, y: pr.sy };
  };

  return (
    <div className="hx-root" onContextMenu={(e) => e.preventDefault()}>
      {/* Header: title, rotation, floor, zoom, semantics toggle */}
      <header className="hx-bar">
        <input
          className="hx-title"
          value={scene.title}
          onChange={(e) => live({ ...scene, title: e.target.value })}
          onBlur={() => commit(sceneRef.current)}
          placeholder="Map title"
        />
        <div className="hx-bar-group" title="Rotate the view about the up axis">
          <button type="button" className="hx-btn" onClick={() => rotate(-1)}>⟲</button>
          <span className="hx-readout">{rot}°</span>
          <button type="button" className="hx-btn" onClick={() => rotate(1)}>⟳</button>
        </div>
        <div className="hx-bar-group" title="Active floor (z level) you paint on">
          <span className="hx-readout-label">floor</span>
          <button type="button" className="hx-btn" onClick={() => setFloorZ((z) => Math.max(0, z - 1))}>−</button>
          <span className="hx-readout">{floorZ}</span>
          <button type="button" className="hx-btn" onClick={() => setFloorZ((z) => Math.min(scene.bounds.z - 1, z + 1))}>+</button>
        </div>
        <div className="hx-bar-group">
          <button type="button" className="hx-btn" onClick={() => zoomBy(1 / 1.2)}>−</button>
          <button type="button" className="hx-btn" onClick={resetView}>{Math.round(view.zoom * 100)}%</button>
          <button type="button" className="hx-btn" onClick={() => zoomBy(1.2)}>+</button>
        </div>
        <label className="hx-toggle" title="Show the inferred spaces overlay">
          <input type="checkbox" checked={showSemantics} onChange={(e) => setShowSemantics(e.target.checked)} />
          semantics
        </label>
        <div className="hx-bar-group" title="Export the painted scene as 3D planes">
          <span className="hx-readout-label">export</span>
          <button type="button" className="hx-btn" onClick={() => download(`${scene.title || 'scene'}.obj`, toOBJ(toPlanes(scene)), 'text/plain')}>OBJ</button>
          <button type="button" className="hx-btn" onClick={() => download(`${scene.title || 'scene'}.json`, JSON.stringify(toSceneJSON(scene), null, 2), 'application/json')}>JSON</button>
        </div>
      </header>

      <div className="hx-main">
        {/* Left rail: tools + palette */}
        <aside className="hx-rail">
          <div className="hx-tools">
            {TOOLS.map((t) => (
              <button
                key={t.id}
                type="button"
                title={t.label}
                className={`hx-tool${tool === t.id ? ' is-active' : ''}`}
                onClick={() => setTool(t.id)}
              >
                {t.glyph}
              </button>
            ))}
          </div>

          <div className="hx-palette">
            {scene.palette.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`hx-swatch${activeTileId === p.id ? ' is-active' : ''}`}
                style={{ ['--fill' as string]: p.color }}
                title={`${p.label} (${p.role})`}
                onClick={() => setActiveTileId(p.id)}
              >
                <span className="hx-swatch-dot" />
                <span className="hx-swatch-label">{p.glyph ? `${p.glyph} ` : ''}{p.label}</span>
              </button>
            ))}
            <button type="button" className="hx-add" onClick={addTile}>+ tile</button>
          </div>

          {activeTile && (
            <div className="hx-tileedit">
              <input
                className="hx-input"
                value={activeTile.label}
                onChange={(e) => patchTile(activeTile.id, { label: e.target.value })}
                placeholder="Tile name"
              />
              <div className="hx-tilerow">
                <input
                  type="color"
                  value={/^#[0-9a-f]{6}$/i.test(activeTile.color) ? activeTile.color : '#888888'}
                  onChange={(e) => patchTile(activeTile.id, { color: e.target.value })}
                  title="Tile colour"
                />
                <select
                  className="hx-input"
                  value={activeTile.role}
                  onChange={(e) => patchTile(activeTile.id, { role: e.target.value as TileRole })}
                  title="Role hint for the inference"
                >
                  {TILE_ROLES.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
                <button type="button" className="hx-btn" title="Delete tile" onClick={() => deleteTile(activeTile.id)}>🗑</button>
              </div>
            </div>
          )}
        </aside>

        {/* Stage */}
        <div className="hx-stagewrap">
          <svg
            ref={svgRef}
            className="hx-stage"
            viewBox={viewBox}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
            style={{ cursor: tool === 'pan' ? 'grab' : 'crosshair' }}
          >
            <g ref={gRef} transform={`translate(${view.tx} ${view.ty}) scale(${view.zoom})`}>
              {ordered.map((c) => {
                const tile = tileById(scene, c.t);
                const color = tile?.color ?? '#888888';
                if (tile?.role === 'marker') {
                  const pr = project(c.x + 0.5, c.y + 0.5, c.z + 1, rot);
                  return (
                    <g key={cellKey(c)}>
                      <circle cx={pr.sx} cy={pr.sy} r={6} fill={color} stroke={shade(color, 0.6)} />
                      {tile.glyph && (
                        <text className="hx-glyph" x={pr.sx} y={pr.sy + 3} textAnchor="middle">{tile.glyph}</text>
                      )}
                    </g>
                  );
                }
                const f = cubeFaces(c.x, c.y, c.z, rot);
                const sp = columnSpace.get(`${c.x},${c.y}`);
                const tint = showSemantics && sp ? `hsl(${hueFor(sp.id)} 70% 55% / 0.34)` : null;
                return (
                  <g key={cellKey(c)} className="hx-cube">
                    {f.sides.map((s, i) => (
                      <polygon key={i} points={polyPoints(s.quad)} fill={shade(color, s.dir.x !== 0 ? 0.72 : 0.55)} />
                    ))}
                    <polygon points={polyPoints(f.top)} fill={color} stroke={shade(color, 0.55)} strokeWidth={0.5} />
                    {tint && <polygon points={polyPoints(f.top)} fill={tint} />}
                  </g>
                );
              })}

              {/* Semantic overlay: relations + space labels */}
              {showSemantics && (
                <g className="hx-overlay">
                  {graph.relations
                    .filter((r) => r.kind === 'connects' || r.viaSpaceId)
                    .map((r) => {
                      const a = graph.spaces.find((s) => s.id === r.from);
                      const b = graph.spaces.find((s) => s.id === r.to);
                      if (!a || !b) return null;
                      const pa = centroidPt(a);
                      const pb = centroidPt(b);
                      return <line key={r.id} className="hx-rel" x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} />;
                    })}
                  {graph.spaces.map((s) => {
                    const p = centroidPt(s);
                    const pinned = s.source === 'annotated';
                    return (
                      <text
                        key={s.id}
                        className={`hx-label${pinned ? ' is-pinned' : ''}${selectedSpace === s.id ? ' is-selected' : ''}`}
                        x={p.x}
                        y={p.y}
                        textAnchor="middle"
                      >
                        {s.name} · {s.kind}
                      </text>
                    );
                  })}
                </g>
              )}
            </g>
          </svg>
        </div>

        {/* Right rail: inspect / annotate, or the live legend */}
        <aside className="hx-inspect">
          {selected ? (
            <SpaceInspector
              key={selected.id}
              space={selected}
              features={graph.features.filter((f) => f.spaceId === selected.id)}
              onClose={() => setSelectedSpace(null)}
              onPin={pinAnnotation}
            />
          ) : (
            <div className="hx-legend">
              <p className="hx-legend-head">Inferred</p>
              {graph.spaces.length === 0 && <p className="hx-empty">Paint to see structure appear.</p>}
              {graph.spaces.map((s) => (
                <button key={s.id} type="button" className="hx-legend-row" onClick={() => setSelectedSpace(s.id)}>
                  <span className="hx-legend-dot" style={{ ['--dot' as string]: `hsl(${hueFor(s.id)} 70% 55%)` }} />
                  <span className="hx-legend-name">{s.name}</span>
                  <span className="hx-legend-meta">{s.kind} · {s.cellCount}</span>
                </button>
              ))}
              {graph.features.length > 0 && (
                <p className="hx-legend-foot">
                  {graph.features.map((f) => `${f.count}× ${f.kind}`).join(', ')}
                </p>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

// ── Inspector (the "annotate only when necessary" panel) ─────────────────────

function SpaceInspector({
  space,
  features,
  onClose,
  onPin,
}: {
  space: SpaceNode;
  features: { kind: string; count: number }[];
  onClose: () => void;
  onPin: (patch: { kind?: string; name?: string; confirm?: boolean }) => void;
}) {
  const [name, setName] = useState(space.name);
  const [kind, setKind] = useState(space.kind);
  return (
    <div className="hx-inspector">
      <div className="hx-inspector-bar">
        <span className="hx-inspector-title">Space</span>
        <button type="button" className="hx-btn" onClick={onClose}>×</button>
      </div>
      <label className="hx-field">
        <span>name</span>
        <input className="hx-input" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name !== space.name && onPin({ name })} />
      </label>
      <label className="hx-field">
        <span>kind</span>
        <input className="hx-input" value={kind} onChange={(e) => setKind(e.target.value)} onBlur={() => kind !== space.kind && onPin({ kind })} />
      </label>
      <p className="hx-why">
        {space.source === 'annotated' ? 'pinned' : `inferred · ${Math.round(space.confidence * 100)}%`} — {space.why}
      </p>
      <p className="hx-stat">{space.cellCount} cells · {space.bbox.maxX - space.bbox.minX + 1}×{space.bbox.maxY - space.bbox.minY + 1}</p>
      {features.length > 0 && <p className="hx-stat">holds {features.map((f) => `${f.count}× ${f.kind}`).join(', ')}</p>}
      {space.source !== 'annotated' && (
        <button type="button" className="hx-confirm" onClick={() => onPin({ confirm: true })}>Confirm this guess</button>
      )}
    </div>
  );
}
