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
  BOUNDS_MAX,
  BOUNDS_MIN,
  ROTATIONS,
  TILE_ROLES,
  asScene,
  cellKey,
  clampBounds,
  makeAnnotation,
  makeCell,
  makeTile,
  serializeScene,
  tileById,
  type Cell,
  type HexelScene,
  type PaletteTile,
  type Rotation,
  type SequenceOverlay,
  type SequenceStep,
  type TileRole,
  type Vec3,
} from '@/lib/hexel/types';
import { inferSemantics, type SpaceNode } from '@/lib/hexel/infer';
import { toOBJ, toPlanes, toSceneJSON } from '@/lib/hexel/scene';
import {
  appendSequenceStep,
  resolveSequence,
  diffAnnotations,
  diffCells,
  updateSequenceStep,
  updateSequenceStepPresentation,
} from '@/lib/hexel/sequence';
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

type Tool = 'brush' | 'erase' | 'raise' | 'fill' | 'eyedropper' | 'pan' | 'inspect' | 'route';
type OverlayTool = 'none' | 'pen' | 'arrow' | 'circle' | 'text' | 'eraser';
type PendingTileDelete = { id: string; affected: number };
type RouteDraft = { points: Vec3[]; name: string; kind: string; notes: string };
type OverlayDraft = { kind: Exclude<OverlayTool, 'none' | 'eraser'>; points: { x: number; y: number }[] };

const TOOLS: { id: Tool; glyph: string; label: string }[] = [
  { id: 'brush', glyph: '✎', label: 'Brush — paint the active material' },
  { id: 'erase', glyph: '⌫', label: 'Erase the topmost voxel' },
  { id: 'raise', glyph: '⤒', label: 'Raise — stack a voxel to build height' },
  { id: 'fill', glyph: '▦', label: 'Fill a contiguous same-material region' },
  { id: 'eyedropper', glyph: '◇', label: 'Pick the material under the cursor' },
  { id: 'pan', glyph: '✋', label: 'Pan the view' },
  { id: 'inspect', glyph: '🔍', label: 'Inspect / annotate a space' },
  { id: 'route', glyph: '↝', label: 'Route — click movement points across lanes and elevations' },
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

function parseViewBox(viewBox: string): { x: number; y: number; width: number; height: number } {
  const [x, y, width, height] = viewBox.split(' ').map(Number);
  return { x, y, width, height };
}

function sequenceStepCount(step: SequenceStep): number {
  return step.cellChanges.length + step.annotationChanges.length + step.overlays.length;
}

export function HexelMap({ props, onChange }: WidgetProps) {
  const initialScene = asScene(parseJson(props.dataJson, {}));
  const [scene, setScene] = useState<HexelScene>(() => initialScene.sequence.length ? resolveSequence(initialScene, 0) : initialScene);
  const [sourceScene, setSourceScene] = useState<HexelScene>(initialScene);
  const [activeStep, setActiveStep] = useState<number>(initialScene.sequence.length ? 0 : -1);
  const [presenting, setPresenting] = useState(false);
  const sceneRef = useRef(scene);
  const sourceRef = useRef(sourceScene);
  const historyRef = useRef<{ past: HexelScene[]; future: HexelScene[] }>({ past: [], future: [] });
  sceneRef.current = scene;
  sourceRef.current = sourceScene;
  useEffect(() => {
    const incoming = asScene(parseJson(props.dataJson, {}));
    const nextIndex = activeStep >= 0 && incoming.sequence[activeStep]
      ? activeStep
      : incoming.sequence.length ? 0 : -1;
    setSourceScene(incoming);
    setActiveStep(nextIndex);
    setScene(nextIndex >= 0 ? resolveSequence(incoming, nextIndex) : incoming);
  }, [props.dataJson]); // eslint-disable-line react-hooks/exhaustive-deps

  const live = (next: HexelScene) => setScene(next);
  const remember = (source: HexelScene) => {
    historyRef.current.past.push(source);
    historyRef.current.future = [];
    if (historyRef.current.past.length > 50) historyRef.current.past.shift();
  };
  const commit = useCallback(
    (next: HexelScene) => {
      const source = sourceRef.current;
      remember(source);
      if (activeStep >= 0 && source.sequence[activeStep]) {
        const updatedSource = updateSequenceStep(source, activeStep, next);
        setSourceScene(updatedSource);
        const resolved = { ...next, sequence: updatedSource.sequence };
        setScene(resolved);
        onChange({ dataJson: serializeScene(updatedSource) });
      } else {
        setSourceScene(next);
        setScene(next);
        onChange({ dataJson: serializeScene(next) });
      }
    },
    [activeStep, onChange],
  );

  const persistPresentation = useCallback(
    (patch: Parameters<typeof updateSequenceStepPresentation>[2]) => {
      if (activeStep < 0) return;
      remember(sourceRef.current);
      const updatedSource = updateSequenceStepPresentation(sourceRef.current, activeStep, patch);
      setSourceScene(updatedSource);
      setScene((current) => ({ ...current, sequence: updatedSource.sequence }));
      onChange({ dataJson: serializeScene(updatedSource) });
    },
    [activeStep, onChange],
  );

  const restoreHistory = (next: HexelScene) => {
    const nextIndex = activeStep >= 0 && next.sequence[activeStep]
      ? activeStep
      : next.sequence.length ? Math.min(Math.max(activeStep, 0), next.sequence.length - 1) : -1;
    setSourceScene(next);
    setActiveStep(nextIndex);
    setScene(nextIndex >= 0 ? resolveSequence(next, nextIndex) : next);
    loadStepPresentation(nextIndex >= 0 ? next.sequence[nextIndex] : null);
    onChange({ dataJson: serializeScene(next) });
  };

  const undo = () => {
    const previous = historyRef.current.past.pop();
    if (!previous) return;
    historyRef.current.future.push(sourceRef.current);
    restoreHistory(previous);
  };

  const redo = () => {
    const next = historyRef.current.future.pop();
    if (!next) return;
    historyRef.current.past.push(sourceRef.current);
    restoreHistory(next);
  };

  const [tool, setTool] = useState<Tool>('brush');
  const [activeTileId, setActiveTileId] = useState<string>(() => scene.palette[0]?.id ?? '');
  const [rot, setRot] = useState<Rotation>(scene.defaultRot);
  const [floorZ, setFloorZ] = useState(0);
  const [showSemantics, setShowSemantics] = useState(true);
  const [showRoutes, setShowRoutes] = useState(true);
  const [selectedSpace, setSelectedSpace] = useState<string | null>(null);
  const [view, setView] = useState({ zoom: 1, tx: 0, ty: 0 });
  const [pendingTileDelete, setPendingTileDelete] = useState<PendingTileDelete | null>(null);
  const [routeDraft, setRouteDraft] = useState<RouteDraft | null>(null);
  const [overlayTool, setOverlayTool] = useState<OverlayTool>('none');
  const [overlayColor, setOverlayColor] = useState('#b44f3b');
  const [overlayWidth, setOverlayWidth] = useState(2);
  const [overlayText, setOverlayText] = useState('');
  const [overlayDraft, setOverlayDraft] = useState<OverlayDraft | null>(null);
  const [overlayCount, setOverlayCount] = useState(0);

  useEffect(() => {
    if (!scene.palette.some((p) => p.id === activeTileId)) setActiveTileId(scene.palette[0]?.id ?? '');
  }, [scene.palette, activeTileId]);
  useEffect(() => {
    setFloorZ((z) => Math.max(0, Math.min(scene.bounds.z - 1, z)));
  }, [scene.bounds.z]);

  const loadStepPresentation = useCallback((step: SequenceStep | null) => {
    if (!step) {
      setRot(sourceRef.current.defaultRot);
      setFloorZ(0);
      setView({ zoom: 1, tx: 0, ty: 0 });
      setShowSemantics(true);
      setShowRoutes(true);
      return;
    }
    setRot(step.camera.rotation);
    setFloorZ(Math.min(sceneRef.current.bounds.z - 1, Math.max(0, step.camera.floorZ)));
    setView({ zoom: step.camera.zoom, tx: step.camera.tx, ty: step.camera.ty });
    setShowSemantics(step.layers.semantics);
    setShowRoutes(step.layers.routes);
    setOverlayCount(step.overlays.length);
  }, []);

  useEffect(() => {
    const step = activeStep >= 0 ? sourceScene.sequence[activeStep] ?? null : null;
    loadStepPresentation(step);
  }, [activeStep, loadStepPresentation, sourceScene.sequence]);

  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement>(null);
  const painting = useRef(false);
  const lastCell = useRef<string>('');
  const panRef = useRef<{ sx: number; sy: number; tx: number; ty: number } | null>(null);
  const overlayDraftRef = useRef<OverlayDraft | null>(null);

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
  const activeSequenceStep = activeStep >= 0 ? sourceScene.sequence[activeStep] ?? null : null;
  const activeOverlays = activeSequenceStep?.overlays ?? [];
  const overlayViewBox = useMemo(() => parseViewBox(viewBox), [viewBox]);

  const startSequence = () => {
    const source = sourceRef.current;
    remember(source);
    const created = appendSequenceStep(source, 'Base level', {
      rotation: rot,
      floorZ,
      zoom: view.zoom,
      tx: view.tx,
      ty: view.ty,
    }, { semantics: showSemantics, routes: showRoutes, routeId: null, routeProgress: 0 });
    setSourceScene(created.scene);
    setScene(resolveSequence(created.scene, created.index));
    setActiveStep(created.index);
    onChange({ dataJson: serializeScene(created.scene) });
  };

  const addSequenceStep = () => {
    const source = sourceRef.current;
    remember(source);
    const created = appendSequenceStep(source, `Step ${source.sequence.length + 1}`, {
      rotation: rot,
      floorZ,
      zoom: view.zoom,
      tx: view.tx,
      ty: view.ty,
    }, { semantics: showSemantics, routes: showRoutes, routeId: null, routeProgress: 0 });
    setSourceScene(created.scene);
    setScene(resolveSequence(created.scene, created.index));
    setActiveStep(created.index);
    onChange({ dataJson: serializeScene(created.scene) });
  };

  const goToStep = (index: number) => {
    const steps = sourceRef.current.sequence;
    if (index < 0 || index >= steps.length) return;
    setActiveStep(index);
    setScene(resolveSequence(sourceRef.current, index));
  };

  const updateStepText = (patch: { title?: string; narration?: string }) => {
    persistPresentation(patch);
  };

  const duplicateSequenceStep = () => {
    const source = sourceRef.current;
    const current = source.sequence[activeStep];
    if (!current) return;
    remember(source);
    const duplicate: SequenceStep = {
      ...current,
      id: `step-${Date.now().toString(36)}-${source.sequence.length + 1}`,
      title: `${current.title || `Step ${activeStep + 1}`} copy`,
      cellChanges: current.cellChanges.map((change) => ({ ...change })),
      annotationChanges: current.annotationChanges.map((change) => ({
        ...change,
        annotation: change.annotation ? { ...change.annotation, anchor: { ...change.annotation.anchor } } : null,
      })),
      overlays: current.overlays.map((overlay) => ({
        ...overlay,
        points: overlay.points.map((point) => ({ ...point })),
      })),
    };
    const sequence = [...source.sequence];
    sequence.splice(activeStep + 1, 0, duplicate);
    const nextSource = { ...source, sequence };
    setSourceScene(nextSource);
    setActiveStep(activeStep + 1);
    setScene(resolveSequence(nextSource, activeStep + 1));
    onChange({ dataJson: serializeScene(nextSource) });
  };

  const deleteSequenceStep = () => {
    const source = sourceRef.current;
    if (activeStep < 0 || !source.sequence[activeStep]) return;
    remember(source);
    const sequence = source.sequence.filter((_, index) => index !== activeStep);
    const nextSource = { ...source, sequence };
    const nextIndex = sequence.length ? Math.min(activeStep, sequence.length - 1) : -1;
    setSourceScene(nextSource);
    setActiveStep(nextIndex);
    setScene(nextIndex >= 0 ? resolveSequence(nextSource, nextIndex) : nextSource);
    onChange({ dataJson: serializeScene(nextSource) });
  };

  const moveSequenceStep = (direction: -1 | 1) => {
    const source = sourceRef.current;
    const target = activeStep + direction;
    if (activeStep < 0 || target < 0 || target >= source.sequence.length) return;
    remember(source);
    const snapshots = source.sequence.map((_, index) => resolveSequence(source, index));
    const sequence = source.sequence.map((step) => ({ ...step }));
    [sequence[activeStep], sequence[target]] = [sequence[target], sequence[activeStep]];
    const snapshotOrder = snapshots.map((_, index) => index);
    [snapshotOrder[activeStep], snapshotOrder[target]] = [snapshotOrder[target], snapshotOrder[activeStep]];
    let prior = source;
    const rebased = sequence.map((step, index) => {
      const snapshot = snapshots[snapshotOrder[index]];
      const previous = index === 0 ? source : resolveSequence(prior, index - 1);
      const rebasedStep = {
        ...step,
        cellChanges: diffCells(previous.cells, snapshot.cells),
        annotationChanges: diffAnnotations(previous.annotations, snapshot.annotations),
      };
      prior = { ...prior, sequence: [...(prior.sequence ?? []).slice(0, index), rebasedStep] };
      return rebasedStep;
    });
    const nextSource = { ...source, sequence: rebased };
    setSourceScene(nextSource);
    setActiveStep(target);
    setScene(resolveSequence(nextSource, target));
    onChange({ dataJson: serializeScene(nextSource) });
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        redo();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goToStep(activeStep - 1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        goToStep(activeStep + 1);
      } else if (event.key === 'Escape' && presenting) {
        setPresenting(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeStep, presenting]);

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

  const screenPoint = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const local = clientToLocal(clientX, clientY, svgRef.current);
    if (!local) return null;
    const vb = parseViewBox(viewBox);
    return {
      x: Math.max(0, Math.min(1, (local.x - vb.x) / vb.width)),
      y: Math.max(0, Math.min(1, (local.y - vb.y) / vb.height)),
    };
  };

  const finishOverlay = () => {
    const draft = overlayDraftRef.current;
    if (!draft || activeStep < 0 || draft.points.length === 0) return;
    const overlay: SequenceOverlay = {
      id: `overlay-${Date.now().toString(36)}-${overlayCount + 1}`,
      kind: draft.kind,
      points: draft.points,
      color: overlayColor,
      width: overlayWidth,
      text: draft.kind === 'text' ? overlayText.trim() : '',
    };
    const current = sourceRef.current.sequence[activeStep];
    if (!current) return;
    persistPresentation({ overlays: [...current.overlays, overlay] });
    setOverlayCount(current.overlays.length + 1);
    overlayDraftRef.current = null;
    setOverlayDraft(null);
  };

  const eraseOverlayAt = (point: { x: number; y: number }) => {
    if (activeStep < 0) return;
    const current = sourceRef.current.sequence[activeStep];
    if (!current) return;
    const nearest = current.overlays.findIndex((overlay) => overlay.points.some((p) => {
      const dx = p.x - point.x;
      const dy = p.y - point.y;
      return Math.sqrt(dx * dx + dy * dy) < 0.05;
    }));
    if (nearest < 0) return;
    persistPresentation({ overlays: current.overlays.filter((_, index) => index !== nearest) });
    setOverlayCount(Math.max(0, current.overlays.length - 1));
  };

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

  const addRoutePoint = (world: Pt) => {
    const hit = pick(world.x, world.y, rot, scene.cells);
    const point = hit
      ? { x: hit.x, y: hit.y, z: hit.z }
      : { ...unproject(world.x, world.y, rot, floorZ), z: floorZ };
    if (!inBounds(point.x, point.y, point.z)) return;
    setRouteDraft((draft) => draft
      ? draft.points.some((p) => p.x === point.x && p.y === point.y && p.z === point.z)
        ? draft
        : { ...draft, points: [...draft.points, point] }
      : { points: [point], name: 'Movement Route', kind: 'movement', notes: '' });
  };

  const finishRoute = () => {
    if (!routeDraft || routeDraft.points.length < 2) return;
    const ann = makeAnnotation(routeDraft.points[0], 'route');
    ann.name = routeDraft.name.trim() || 'Movement Route';
    ann.kind = routeDraft.kind.trim() || 'movement';
    ann.notes = routeDraft.notes;
    ann.path = routeDraft.points;
    commit({ ...scene, annotations: [...scene.annotations, ann] });
    setRouteDraft(null);
  };

  // ── Pointer handlers ─────────────────────────────────────────────────────────
  const onPointerDown = (e: React.PointerEvent) => {
    if (overlayTool !== 'none') {
      if (e.button !== 0) return;
      const point = screenPoint(e.clientX, e.clientY);
      if (!point) return;
      if (overlayTool === 'eraser') {
        eraseOverlayAt(point);
        return;
      }
      const draft: OverlayDraft = {
        kind: overlayTool,
        points: [point],
      };
      overlayDraftRef.current = draft;
      setOverlayDraft(draft);
      svgRef.current?.setPointerCapture(e.pointerId);
      return;
    }
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
    if (tool === 'route') { addRoutePoint(world); return; }
    if (tool === 'fill') { floodFill(world); return; }
    // Stroke tools: brush / erase / raise.
    painting.current = true;
    lastCell.current = '';
    svgRef.current?.setPointerCapture(e.pointerId);
    const next = applyAt(world, sceneRef.current);
    if (next) live(next);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (overlayDraftRef.current) {
      const point = screenPoint(e.clientX, e.clientY);
      if (!point) return;
      const current = overlayDraftRef.current;
      const next = current.kind === 'text'
        ? current
        : { ...current, points: [...current.points, point] };
      overlayDraftRef.current = next;
      setOverlayDraft(next);
      return;
    }
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
    if (overlayDraftRef.current) {
      svgRef.current?.releasePointerCapture?.(e.pointerId);
      finishOverlay();
      return;
    }
    if (panRef.current) {
      panRef.current = null;
      svgRef.current?.releasePointerCapture?.(e.pointerId);
      persistPresentation({ camera: { tx: view.tx, ty: view.ty } });
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
    const next = ROTATIONS[i];
    setRot(next);
    persistPresentation({ camera: { rotation: next } });
  };
  const zoomBy = (f: number) => {
    const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, view.zoom * f));
    setView((v) => ({ ...v, zoom }));
    persistPresentation({ camera: { zoom } });
  };
  const resetView = () => {
    setView({ zoom: 1, tx: 0, ty: 0 });
    persistPresentation({ camera: { zoom: 1, tx: 0, ty: 0 } });
  };

  const addTile = () => {
    const t = makeTile(scene.palette.length, 'floor');
    commit({ ...scene, palette: [...scene.palette, t] });
    setActiveTileId(t.id);
  };
  const patchTile = (id: string, patch: Partial<PaletteTile>) =>
    commit({ ...scene, palette: scene.palette.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
  const setBoundsAxis = (axis: keyof Vec3, raw: number) => {
    if (!Number.isFinite(raw)) return;
    const bounds = clampBounds({ ...scene.bounds, [axis]: raw });
    commit({ ...scene, bounds });
  };
  const deleteTile = (id: string) => {
    if (scene.palette.length <= 1) return;
    const affected = scene.cells.filter((c) => c.t === id).length;
    if (affected > 0) {
      setPendingTileDelete({ id, affected });
      return;
    }
    setPendingTileDelete(null);
    commit({ ...scene, palette: scene.palette.filter((p) => p.id !== id), cells: scene.cells.filter((c) => c.t !== id) });
  };
  const confirmTileDelete = () => {
    if (!pendingTileDelete || scene.palette.length <= 1) return;
    const { id } = pendingTileDelete;
    setPendingTileDelete(null);
    commit({ ...scene, palette: scene.palette.filter((p) => p.id !== id), cells: scene.cells.filter((c) => c.t !== id) });
  };

  const selected = selectedSpace ? graph.spaces.find((s) => s.id === selectedSpace) ?? null : null;
  const pendingTile = pendingTileDelete ? scene.palette.find((p) => p.id === pendingTileDelete.id) : null;
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
    <div className={`hx-root${presenting ? ' is-presenting' : ''}`} onContextMenu={(e) => e.preventDefault()}>
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
          <button type="button" className="hx-btn" onClick={() => {
            const next = Math.max(0, floorZ - 1);
            setFloorZ(next);
            persistPresentation({ camera: { floorZ: next } });
          }}>−</button>
          <span className="hx-readout">{floorZ}</span>
          <button type="button" className="hx-btn" onClick={() => {
            const next = Math.min(scene.bounds.z - 1, floorZ + 1);
            setFloorZ(next);
            persistPresentation({ camera: { floorZ: next } });
          }}>+</button>
        </div>
        <div className="hx-bar-group" title={`Lattice bounds (${BOUNDS_MIN.x}–${BOUNDS_MAX.x} × ${BOUNDS_MIN.y}–${BOUNDS_MAX.y} × ${BOUNDS_MIN.z}–${BOUNDS_MAX.z})`}>
          <span className="hx-readout-label">bounds</span>
          <input
            type="number"
            className="hx-bounds-input"
            min={BOUNDS_MIN.x}
            max={BOUNDS_MAX.x}
            value={scene.bounds.x}
            onChange={(e) => setBoundsAxis('x', Number(e.target.value))}
          />
          <span className="hx-readout-label">×</span>
          <input
            type="number"
            className="hx-bounds-input"
            min={BOUNDS_MIN.y}
            max={BOUNDS_MAX.y}
            value={scene.bounds.y}
            onChange={(e) => setBoundsAxis('y', Number(e.target.value))}
          />
          <span className="hx-readout-label">×</span>
          <input
            type="number"
            className="hx-bounds-input"
            min={BOUNDS_MIN.z}
            max={BOUNDS_MAX.z}
            value={scene.bounds.z}
            onChange={(e) => setBoundsAxis('z', Number(e.target.value))}
          />
        </div>
        <div className="hx-bar-group">
          <button type="button" className="hx-btn" onClick={() => zoomBy(1 / 1.2)}>−</button>
          <button type="button" className="hx-btn" onClick={resetView}>{Math.round(view.zoom * 100)}%</button>
          <button type="button" className="hx-btn" onClick={() => zoomBy(1.2)}>+</button>
        </div>
        <label className="hx-toggle" title="Show the inferred spaces overlay">
          <input type="checkbox" checked={showSemantics} onChange={(e) => {
            setShowSemantics(e.target.checked);
            persistPresentation({ layers: { semantics: e.target.checked } });
          }} />
          semantics
        </label>
        <label className="hx-toggle" title="Show movement routes">
          <input type="checkbox" checked={showRoutes} onChange={(e) => {
            setShowRoutes(e.target.checked);
            persistPresentation({ layers: { routes: e.target.checked } });
          }} />
          routes
        </label>
        <button type="button" className={`hx-btn${tool === 'route' ? ' is-active' : ''}`} onClick={() => setTool('route')} title="Author a movement route">
          route
        </button>
        <div className="hx-bar-group" title="Export the painted scene as 3D planes">
          <span className="hx-readout-label">export</span>
          <button type="button" className="hx-btn" onClick={() => download(`${scene.title || 'scene'}.obj`, toOBJ(toPlanes(scene)), 'text/plain')}>OBJ</button>
          <button type="button" className="hx-btn" onClick={() => download(`${scene.title || 'scene'}.json`, JSON.stringify(toSceneJSON(scene), null, 2), 'application/json')}>JSON</button>
        </div>
        <button type="button" className="hx-btn" onClick={undo} title="Undo last edit">undo</button>
        <button type="button" className="hx-btn" onClick={redo} title="Redo last edit">redo</button>
        <button type="button" className="hx-btn" onClick={() => setPresenting((value) => !value)}>{presenting ? 'edit' : 'present'}</button>
      </header>

      <section className="hx-sequence" aria-label="Level sequence">
        <div className="hx-sequence-head">
          <div>
            <strong>Level sequence</strong>
            <span className="hx-sequence-rule">Edits flow forward until a later step overrides them.</span>
          </div>
          <div className="hx-sequence-actions">
            {activeStep >= 0 && <button type="button" className="hx-btn" onClick={() => goToStep(activeStep - 1)} disabled={activeStep === 0}>←</button>}
            {activeStep >= 0 && <button type="button" className="hx-btn" onClick={() => goToStep(activeStep + 1)} disabled={activeStep >= sourceScene.sequence.length - 1}>→</button>}
            {activeStep < 0 ? (
              <button type="button" className="hx-confirm" onClick={startSequence}>Start sequence</button>
            ) : (
              <>
                <button type="button" className="hx-btn" onClick={addSequenceStep}>+ step</button>
                <button type="button" className="hx-btn" onClick={duplicateSequenceStep}>duplicate</button>
                <button type="button" className="hx-btn" onClick={() => moveSequenceStep(-1)} disabled={activeStep === 0}>← move</button>
                <button type="button" className="hx-btn" onClick={() => moveSequenceStep(1)} disabled={activeStep === sourceScene.sequence.length - 1}>move →</button>
                <button type="button" className="hx-btn" onClick={deleteSequenceStep}>delete</button>
                <button type="button" className="hx-btn" onClick={() => download(`${scene.title || 'level'}-sequence.json`, JSON.stringify(sourceRef.current, null, 2), 'application/json')}>export sequence</button>
              </>
            )}
          </div>
        </div>
        {activeStep >= 0 && (
          <>
            <div className="hx-sequence-steps">
              {sourceScene.sequence.map((step, index) => (
                <button
                  key={step.id}
                  type="button"
                  className={`hx-sequence-step${index === activeStep ? ' is-active' : ''}`}
                  onClick={() => goToStep(index)}
                >
                  <span>{index + 1}</span>
                  <strong>{step.title || `Step ${index + 1}`}</strong>
                  <small>{sequenceStepCount(step)} changes</small>
                </button>
              ))}
            </div>
            <div className="hx-sequence-edit">
              <input
                className="hx-input"
                value={activeSequenceStep?.title ?? ''}
                onChange={(e) => updateStepText({ title: e.target.value })}
                placeholder="Step title"
                aria-label="Step title"
              />
              <textarea
                className="hx-input hx-sequence-narration"
                value={activeSequenceStep?.narration ?? ''}
                onChange={(e) => updateStepText({ narration: e.target.value })}
                placeholder="Narration or design intent for this step"
                aria-label="Step narration"
              />
              <div className="hx-overlay-tools" aria-label="Presentation overlay tools">
                <span className="hx-readout-label">overlay</span>
                {(['none', 'pen', 'arrow', 'circle', 'text', 'eraser'] as OverlayTool[]).map((kind) => (
                  <button key={kind} type="button" className={`hx-btn${overlayTool === kind ? ' is-active' : ''}`} onClick={() => setOverlayTool(kind)}>
                    {kind}
                  </button>
                ))}
                <input type="color" value={overlayColor} onChange={(e) => setOverlayColor(e.target.value)} title="Overlay colour" />
                <input type="number" min={1} max={12} value={overlayWidth} onChange={(e) => setOverlayWidth(Math.max(1, Math.min(12, Number(e.target.value))))} title="Overlay width" />
                <input className="hx-input hx-overlay-text" value={overlayText} onChange={(e) => setOverlayText(e.target.value)} placeholder="Text overlay" aria-label="Text overlay" />
              </div>
            </div>
          </>
        )}
      </section>

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
          {pendingTileDelete && (
            <div className="hx-tileedit" role="alertdialog" aria-label="Confirm tile deletion">
              <p className="hx-stat">
                Delete <strong>{pendingTile?.label || 'this tile'}</strong>? {pendingTileDelete.affected} placed{' '}
                {pendingTileDelete.affected === 1 ? 'cell' : 'cells'} using it will be removed.
              </p>
              <div className="hx-tilerow">
                <button type="button" className="hx-btn" onClick={() => setPendingTileDelete(null)}>Cancel</button>
                <button type="button" className="hx-confirm" onClick={confirmTileDelete}>Delete tile</button>
              </div>
            </div>
          )}
          {tool === 'route' && (
            <div className="hx-tileedit" aria-label="Movement route editor">
              <p className="hx-stat"><strong>Movement route</strong> · {routeDraft?.points.length ?? 0} points</p>
              <input className="hx-input" value={routeDraft?.name ?? 'Movement Route'} onChange={(e) => setRouteDraft((d) => ({ points: d?.points ?? [], name: e.target.value, kind: d?.kind ?? 'movement', notes: d?.notes ?? '' }))} placeholder="Route name" />
              <input className="hx-input" value={routeDraft?.kind ?? 'movement'} onChange={(e) => setRouteDraft((d) => ({ points: d?.points ?? [], name: d?.name ?? 'Movement Route', kind: e.target.value, notes: d?.notes ?? '' }))} placeholder="Route kind" />
              <input className="hx-input" value={routeDraft?.notes ?? ''} onChange={(e) => setRouteDraft((d) => ({ points: d?.points ?? [], name: d?.name ?? 'Movement Route', kind: d?.kind ?? 'movement', notes: e.target.value }))} placeholder="Action / pacing notes" />
              <div className="hx-tilerow">
                <button type="button" className="hx-btn" onClick={() => setRouteDraft(null)}>Cancel</button>
                <button type="button" className="hx-confirm" disabled={!routeDraft || routeDraft.points.length < 2} onClick={finishRoute}>Save route</button>
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
                    {tile?.role === 'ramp' && <line x1={f.top[0].x} y1={f.top[0].y} x2={f.top[2].x} y2={f.top[2].y} stroke="#fff3c4" strokeWidth={1.5} />}
                    {tint && <polygon points={polyPoints(f.top)} fill={tint} />}
                  </g>
                );
              })}

              {/* Semantic overlay: relations + space labels */}
              {(showSemantics || showRoutes) && (
                <g className="hx-overlay">
                  {showSemantics && graph.relations
                    .filter((r) => r.kind === 'connects' || r.viaSpaceId)
                    .map((r) => {
                      const a = graph.spaces.find((s) => s.id === r.from);
                      const b = graph.spaces.find((s) => s.id === r.to);
                      if (!a || !b) return null;
                      const pa = centroidPt(a);
                      const pb = centroidPt(b);
                      return <line key={r.id} className="hx-rel" x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} />;
                    })}
                  {showRoutes && graph.routes.map((route) => {
                    const points = route.points.map((point) => {
                      const p = project(point.x + 0.5, point.y + 0.5, point.z + 1.05, rot);
                      return `${p.sx},${p.sy}`;
                    }).join(' ');
                    return (
                      <g key={route.id}>
                        <polyline className="hx-route" points={points} />
                        {route.points.map((point, index) => {
                          const p = project(point.x + 0.5, point.y + 0.5, point.z + 1.05, rot);
                          return <circle key={`${route.id}:${index}`} className="hx-route-point" cx={p.sx} cy={p.sy} r={2.8} />;
                        })}
                      </g>
                    );
                  })}
                  {showSemantics && graph.spaces.map((s) => {
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
            <g
              className="hx-screen-overlays"
              transform={`translate(${overlayViewBox.x} ${overlayViewBox.y}) scale(${overlayViewBox.width} ${overlayViewBox.height})`}
            >
              {[...activeOverlays, ...(overlayDraft ? [{
                id: 'draft',
                kind: overlayDraft.kind,
                points: overlayDraft.points,
                color: overlayColor,
                width: overlayWidth,
                text: overlayDraft.kind === 'text' ? overlayText : '',
              } satisfies SequenceOverlay] : [])].map((overlay) => {
                const points = overlay.points.map((point) => `${point.x},${point.y}`).join(' ');
                const strokeWidth = overlay.width / 100;
                if (overlay.kind === 'text') {
                  const point = overlay.points[0];
                  return point ? (
                    <text key={overlay.id} x={point.x} y={point.y} fill={overlay.color} fontSize={strokeWidth * 8} fontWeight="700">
                      {overlay.text || 'Text'}
                    </text>
                  ) : null;
                }
                if (overlay.kind === 'circle') {
                  const xs = overlay.points.map((point) => point.x);
                  const ys = overlay.points.map((point) => point.y);
                  if (!xs.length || !ys.length) return null;
                  const minX = Math.min(...xs);
                  const minY = Math.min(...ys);
                  return (
                    <ellipse
                      key={overlay.id}
                      cx={(minX + Math.max(...xs)) / 2}
                      cy={(minY + Math.max(...ys)) / 2}
                      rx={Math.max(0.01, (Math.max(...xs) - minX) / 2)}
                      ry={Math.max(0.01, (Math.max(...ys) - minY) / 2)}
                      fill="none"
                      stroke={overlay.color}
                      strokeWidth={strokeWidth}
                      vectorEffect="non-scaling-stroke"
                    />
                  );
                }
                return (
                  <g key={overlay.id}>
                    <polyline
                      points={points}
                      fill="none"
                      stroke={overlay.color}
                      strokeWidth={strokeWidth}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      vectorEffect="non-scaling-stroke"
                    />
                    {overlay.kind === 'arrow' && overlay.points.length > 1 && (
                      <circle
                        cx={overlay.points[overlay.points.length - 1].x}
                        cy={overlay.points[overlay.points.length - 1].y}
                        r={strokeWidth * 2}
                        fill={overlay.color}
                      />
                    )}
                  </g>
                );
              })}
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
              {graph.routes.length > 0 && (
                <p className="hx-legend-foot">
                  Routes: {graph.routes.map((route) => `${route.name} (${route.points.length} points)`).join(', ')}
                </p>
              )}
              {graph.relations.some((relation) => relation.kind === 'ramp') && (
                <p className="hx-legend-foot">
                  Elevation: {graph.relations.filter((relation) => relation.kind === 'ramp').length} ramp transition(s)
                </p>
              )}
            </div>
          )}
        </aside>
      </div>
      {presenting && activeSequenceStep && (
        <div className="hx-presenter-caption" aria-live="polite">
          <div>
            <strong>{activeStep + 1}. {activeSequenceStep.title || 'Untitled step'}</strong>
            {activeSequenceStep.narration && <p>{activeSequenceStep.narration}</p>}
          </div>
          <div className="hx-presenter-controls">
            <button type="button" className="hx-btn" onClick={() => goToStep(activeStep - 1)} disabled={activeStep === 0}>previous</button>
            <span>{activeStep + 1} / {sourceScene.sequence.length}</span>
            <button type="button" className="hx-btn" onClick={() => goToStep(activeStep + 1)} disabled={activeStep >= sourceScene.sequence.length - 1}>next</button>
          </div>
        </div>
      )}
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
