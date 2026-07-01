'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDocs } from '../DocsProvider';
import { pageHasStudio } from '@/lib/studio/card';
import { characterGlimpse, initials, type CharacterGlimpse } from '@/lib/timeline/glimpse';
import {
  CANVAS_W,
  canvasHeight,
  clampPos,
  momentColor,
  momentPoints,
  splinePath,
  splineSegments,
} from '@/lib/timeline/layout';
import {
  ACT_PALETTE,
  ENV_GLYPHS,
  TIMELINE_LAYOUTS,
  TIMELINE_LAYOUT_HINTS,
  TIMELINE_LAYOUT_LABELS,
  asTimeline,
  makeAct,
  makeEnv,
  makeMoment,
  serializeTimeline,
  type EnvToken,
  type Moment,
  type Timeline,
  type TimelineLayout,
} from '@/lib/timeline/types';
import { parseJson } from '../blocks/shared';
import type { WidgetProps } from './types';

// ── Narrative Timeline widget ────────────────────────────────────────────────
// A "state of the art" interactive story spine: acts and moments flow along a
// smooth, color-shifting ribbon (Prezi / Detroit: Become Human style). Moments
// carry character portraits and an environment token; both are dragged on from
// the built-in shelf. Hovering a portrait reveals a live glimpse pulled from that
// character page's Character Studio (the single source of truth), so the timeline
// never copies character data — it mirrors it.
//
// All spine data lives in one block prop (`dataJson`); the widget edits a local
// copy and commits on discrete actions / blur, the same convention as the other
// rich widgets, so a keystroke never round-trips through the document.

// ── Drag-and-drop payload (shelf → moment / act / canvas) ────────────────────
const DND_MIME = 'application/x-gamedoc-timeline';
type DragPayload = { kind: 'character'; id: string } | { kind: 'environment'; id: string };

function writePayload(e: React.DragEvent, p: DragPayload) {
  e.dataTransfer.setData(DND_MIME, JSON.stringify(p));
  e.dataTransfer.setData('text/plain', p.id);
  e.dataTransfer.effectAllowed = 'copy';
}
function readPayload(e: React.DragEvent): DragPayload | null {
  const raw = e.dataTransfer.getData(DND_MIME);
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as DragPayload;
    if (v && (v.kind === 'character' || v.kind === 'environment') && typeof v.id === 'string') return v;
  } catch {
    /* ignore */
  }
  return null;
}
/** During dragover the payload bytes are unreadable (browser security); only the
 *  MIME list is exposed, so accept-detection keys off the type alone. */
function hasPayload(e: React.DragEvent): boolean {
  return Array.from(e.dataTransfer.types).includes(DND_MIME);
}

// A resolved character reference: the page title, its studio glimpse (or null
// when the page lost / never had a studio), and whether the page still exists.
type Resolved = { title: string; glimpse: CharacterGlimpse | null; exists: boolean };

// ── Portrait ─────────────────────────────────────────────────────────────────
function Portrait({ glimpse, name, size }: { glimpse: CharacterGlimpse | null; name: string; size: number }) {
  const style = { width: size, height: size };
  if (glimpse?.portrait) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="tl-portrait-img" src={glimpse.portrait} alt={name} style={style} />;
  }
  return <span className="tl-portrait-mono" style={{ ...style, fontSize: size * 0.36 }}>{initials(name)}</span>;
}

// ── Character chip (portrait + hover glimpse) ────────────────────────────────
function CharacterChip({
  id,
  resolve,
  size = 28,
  onRemove,
}: {
  id: string;
  resolve: (id: string) => Resolved;
  size?: number;
  onRemove?: () => void;
}) {
  const r = resolve(id);
  const g = r.glimpse;
  return (
    <span className="tl-chip">
      <Portrait glimpse={g} name={r.title} size={size} />
      {onRemove && (
        <button type="button" className="tl-chip-x" title="Remove character" onClick={onRemove}>×</button>
      )}
      {/* Live glimpse — additional detail pulled from the character page. */}
      <span className="tl-glimpse" role="tooltip">
        <span className="tl-glimpse-head">
          <Portrait glimpse={g} name={r.title} size={46} />
          <span className="tl-glimpse-id">
            <span className="tl-glimpse-name">{r.title}</span>
            {g?.tier && <span className="tl-glimpse-tier">{g.tier}</span>}
            {!r.exists && <span className="tl-glimpse-missing">page not found</span>}
            {r.exists && !g && <span className="tl-glimpse-missing">no studio on page</span>}
          </span>
        </span>
        {g?.blurb && <span className="tl-glimpse-blurb">{g.blurb}</span>}
        {g && g.stats.length > 0 && (
          <span className="tl-glimpse-stats">
            {g.stats.map((s, i) => (
              <span key={i} className="tl-glimpse-stat"><b>{s.label}</b><i>{s.read}</i></span>
            ))}
          </span>
        )}
        {r.exists && <a className="tl-glimpse-link" href={`/docs/${id}`}>open page ↗</a>}
      </span>
    </span>
  );
}

// ── A single moment node on the ribbon ───────────────────────────────────────
type NodeProps = {
  moment: Moment;
  index: number;
  color: string;
  xPct: number;
  yPct: number;
  placeAbove: boolean;
  draggable: boolean;
  acts: Timeline['acts'];
  env: EnvToken | null;
  resolve: (id: string) => Resolved;
  onField: (patch: Partial<Moment>) => void;
  onCommit: () => void;
  onRemoveSelf: () => void;
  onMove: (dir: -1 | 1) => void;
  onRemoveChar: (charId: string) => void;
  onClearEnv: () => void;
  onDropPayload: (p: DragPayload) => void;
  onPointerDownGrip: (e: React.PointerEvent) => void;
  onPointerMoveGrip: (e: React.PointerEvent) => void;
  onPointerUpGrip: (e: React.PointerEvent) => void;
};

function TimelineNode(props: NodeProps) {
  const { moment, index, color, xPct, yPct, placeAbove, draggable, acts, env, resolve } = props;
  const [over, setOver] = useState(false);

  return (
    <div className="tl-node" style={{ left: `${xPct}%`, top: `${yPct}%` }}>
      <span
        className={draggable ? 'tl-anchor tl-anchor-grab' : 'tl-anchor'}
        style={{ background: color, borderColor: color }}
        title={draggable ? 'Drag to reposition' : undefined}
        onPointerDown={draggable ? props.onPointerDownGrip : undefined}
        onPointerMove={draggable ? props.onPointerMoveGrip : undefined}
        onPointerUp={draggable ? props.onPointerUpGrip : undefined}
      >
        {index + 1}
      </span>

      <div
        className={`tl-card ${placeAbove ? 'is-above' : 'is-below'}${over ? ' is-over' : ''}`}
        style={{ ['--act' as string]: color }}
        onDragOver={(e) => { if (hasPayload(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setOver(true); } }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          const p = readPayload(e);
          if (p) { e.preventDefault(); e.stopPropagation(); props.onDropPayload(p); }
          setOver(false);
        }}
      >
        <div className="tl-card-top">
          <input
            className="tl-beat"
            value={moment.beat}
            placeholder="beat"
            onChange={(e) => props.onField({ beat: e.target.value })}
            onBlur={props.onCommit}
          />
          <div className="tl-card-tools">
            <button type="button" title="Move earlier" onClick={() => props.onMove(-1)}>◂</button>
            <button type="button" title="Move later" onClick={() => props.onMove(1)}>▸</button>
            <button type="button" className="tl-x" title="Delete moment" onClick={props.onRemoveSelf}>×</button>
          </div>
        </div>

        <input
          className="tl-title"
          value={moment.title}
          placeholder="Moment title"
          onChange={(e) => props.onField({ title: e.target.value })}
          onBlur={props.onCommit}
        />

        <textarea
          className="tl-summary"
          value={moment.summary}
          placeholder="What happens here…"
          rows={2}
          onChange={(e) => props.onField({ summary: e.target.value })}
          onBlur={props.onCommit}
        />

        <div className="tl-card-meta">
          <select
            className="tl-act-pick"
            value={moment.actId}
            onChange={(e) => { props.onField({ actId: e.target.value }); props.onCommit(); }}
            style={{ color }}
          >
            <option value="">— no act —</option>
            {acts.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
          </select>
          {env && (
            <span className="tl-envtag" style={{ ['--env' as string]: env.color }}>
              <i>{env.glyph}</i>{env.label}
              <button type="button" className="tl-envtag-x" title="Clear environment" onClick={props.onClearEnv}>×</button>
            </span>
          )}
        </div>

        {moment.characters.length > 0 && (
          <div className="tl-castrow">
            {moment.characters.map((cid) => (
              <CharacterChip key={cid} id={cid} resolve={resolve} onRemove={() => props.onRemoveChar(cid)} />
            ))}
          </div>
        )}

        {over && <div className="tl-drop-hint">drop to attach</div>}
      </div>
    </div>
  );
}

// ── Main widget ──────────────────────────────────────────────────────────────
export function NarrativeTimeline({ props, onChange }: WidgetProps) {
  const { docs } = useDocs();
  const [tl, setTl] = useState<Timeline>(() => asTimeline(parseJson(props.dataJson, {})));
  const tlRef = useRef(tl);
  tlRef.current = tl;
  useEffect(() => setTl(asTimeline(parseJson(props.dataJson, {}))), [props.dataJson]);

  // Local-only update (no document round-trip) vs. commit (persist current).
  const update = (next: Timeline) => setTl(next);
  const persist = (next: Timeline) => { setTl(next); onChange({ dataJson: serializeTimeline(next) }); };
  const commit = () => onChange({ dataJson: serializeTimeline(tlRef.current) });

  // Character sources: every page carrying a Character Studio is a draggable
  // character; re-derived whenever a doc body changes (cheap — a handful of pages).
  const characters = useMemo(
    () =>
      docs
        .filter((d) => pageHasStudio(d.body))
        .map((d) => ({ id: d.id, title: d.title, glimpse: characterGlimpse(d.body) })),
    [docs],
  );
  const charById = useMemo(() => new Map(characters.map((c) => [c.id, c])), [characters]);
  const resolve = (id: string): Resolved => {
    const c = charById.get(id);
    if (c) return { title: c.title, glimpse: c.glimpse, exists: true };
    const d = docs.find((x) => x.id === id);
    return { title: d?.title ?? id, glimpse: null, exists: !!d };
  };
  const envById = useMemo(() => new Map(tl.environments.map((e) => [e.id, e])), [tl.environments]);

  // Geometry.
  const height = canvasHeight(tl.layout, tl.moments.length, tl.density);
  const points = useMemo(() => momentPoints(tl), [tl]);
  const segments = useMemo(() => splineSegments(points), [points]);
  const fullPath = useMemo(() => splinePath(points), [points]);

  // Free-layout pointer dragging.
  const stageRef = useRef<HTMLDivElement>(null);
  const dragId = useRef<string | null>(null);
  const beginDrag = (e: React.PointerEvent, id: string) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragId.current = id;
    e.preventDefault();
  };
  const dragTo = (e: React.PointerEvent, id: string) => {
    if (dragId.current !== id) return;
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const pos = clampPos((e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height);
    update({ ...tlRef.current, moments: tlRef.current.moments.map((m) => (m.id === id ? { ...m, pos } : m)) });
  };
  const endDrag = (id: string) => {
    if (dragId.current !== id) return;
    dragId.current = null;
    commit();
  };

  // ── View transform: pan + zoom over the whole board ──────────────────────────
  // Ephemeral viewport state (never persisted — it's how you're *looking* at the
  // spine, not part of it). The transform lives on .tl-stage, so the SVG ribbon and
  // the HTML moment nodes pan/zoom together; the node-drag + drop math reads the
  // stage's getBoundingClientRect, which already reflects the transform, so those
  // coordinates stay correct under any pan/zoom with no extra math.
  const ZOOM_MIN = 0.4;
  const ZOOM_MAX = 2.5;
  const [view, setView] = useState({ zoom: 1, tx: 0, ty: 0 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const viewportRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const [panning, setPanning] = useState(false);

  // Keep the board from being flung entirely out of the window (slack lets it go a
  // little past the edge so corners are reachable, but never fully off-screen).
  const clampView = useCallback((zoom: number, tx: number, ty: number) => {
    const vp = viewportRef.current;
    const st = stageRef.current;
    if (!vp || !st) return { zoom, tx, ty };
    const cW = st.offsetWidth * zoom;
    const cH = st.offsetHeight * zoom;
    const slack = 140;
    const clamp = (val: number, fit: number) =>
      Math.min(Math.max(0, fit) + slack, Math.max(Math.min(0, fit) - slack, val));
    return { zoom, tx: clamp(tx, vp.clientWidth - cW), ty: clamp(ty, vp.clientHeight - cH) };
  }, []);

  // Zoom by `factor`, keeping the point (cx, cy) (viewport-relative px) fixed.
  const zoomAt = useCallback(
    (factor: number, cx: number, cy: number) => {
      setView((v) => {
        const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v.zoom * factor));
        const k = zoom / v.zoom;
        return clampView(zoom, cx - k * (cx - v.tx), cy - k * (cy - v.ty));
      });
    },
    [clampView],
  );

  // ctrl/⌘ + wheel zooms toward the cursor; a plain wheel is left alone so the page
  // still scrolls past the widget. Bound natively (non-passive) so preventDefault works.
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const rect = vp.getBoundingClientRect();
      zoomAt(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX - rect.left, e.clientY - rect.top);
    };
    vp.addEventListener('wheel', onWheel, { passive: false });
    return () => vp.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  const zoomButton = (factor: number) => {
    const vp = viewportRef.current;
    if (vp) zoomAt(factor, vp.clientWidth / 2, vp.clientHeight / 2);
  };
  const resetView = () => setView({ zoom: 1, tx: 0, ty: 0 });

  // Drag empty board → pan. Ignore drags starting on a moment node or the zoom
  // controls (those own their gestures: node repositioning, button clicks).
  const beginPan = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const t = e.target as HTMLElement;
    if (t.closest('.tl-node') || t.closest('.tl-zoom')) return;
    panRef.current = { x: e.clientX, y: e.clientY, tx: viewRef.current.tx, ty: viewRef.current.ty };
    setPanning(true);
    viewportRef.current?.setPointerCapture(e.pointerId);
  };
  const movePan = (e: React.PointerEvent) => {
    const p = panRef.current;
    if (!p) return;
    setView((v) => clampView(v.zoom, p.tx + (e.clientX - p.x), p.ty + (e.clientY - p.y)));
  };
  const endPan = (e: React.PointerEvent) => {
    if (!panRef.current) return;
    panRef.current = null;
    setPanning(false);
    viewportRef.current?.releasePointerCapture?.(e.pointerId);
  };

  // ── Moment mutations ───────────────────────────────────────────────────────
  const patchMoment = (id: string, patch: Partial<Moment>, doCommit = false) => {
    const next = { ...tl, moments: tl.moments.map((m) => (m.id === id ? { ...m, ...patch } : m)) };
    doCommit ? persist(next) : update(next);
  };
  const addMoment = () => {
    const lastAct = tl.acts[tl.acts.length - 1]?.id ?? '';
    persist({ ...tl, moments: [...tl.moments, makeMoment(lastAct)] });
  };
  const removeMoment = (id: string) => persist({ ...tl, moments: tl.moments.filter((m) => m.id !== id) });
  const moveMoment = (id: string, dir: -1 | 1) => {
    const i = tl.moments.findIndex((m) => m.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= tl.moments.length) return;
    const moments = [...tl.moments];
    [moments[i], moments[j]] = [moments[j], moments[i]];
    persist({ ...tl, moments });
  };
  const dropOnMoment = (id: string, p: DragPayload) =>
    persist({
      ...tl,
      moments: tl.moments.map((m) => {
        if (m.id !== id) return m;
        if (p.kind === 'character') return m.characters.includes(p.id) ? m : { ...m, characters: [...m.characters, p.id] };
        return { ...m, environment: p.id };
      }),
    });
  const removeChar = (id: string, charId: string) =>
    patchMoment(id, { characters: tl.moments.find((m) => m.id === id)!.characters.filter((c) => c !== charId) }, true);

  // Drop on empty canvas → append a moment seeded with the dropped thing
  // (positioned at the cursor in free layout).
  const canvasDrop = (e: React.DragEvent) => {
    const p = readPayload(e);
    if (!p) return;
    e.preventDefault();
    let pos = null as Moment['pos'];
    const rect = stageRef.current?.getBoundingClientRect();
    if (tl.layout === 'free' && rect && rect.width) {
      pos = clampPos((e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height);
    }
    const mm = makeMoment(tl.acts[tl.acts.length - 1]?.id ?? '', pos);
    if (p.kind === 'character') { mm.characters = [p.id]; mm.title = resolve(p.id).title; }
    else mm.environment = p.id;
    persist({ ...tl, moments: [...tl.moments, mm] });
  };

  // ── Act mutations ──────────────────────────────────────────────────────────
  const patchAct = (id: string, patch: Partial<Timeline['acts'][number]>, doCommit = false) => {
    const next = { ...tl, acts: tl.acts.map((a) => (a.id === id ? { ...a, ...patch } : a)) };
    doCommit ? persist(next) : update(next);
  };
  const addAct = () => persist({ ...tl, acts: [...tl.acts, makeAct(tl.acts.length)] });
  const removeAct = (id: string) =>
    persist({
      ...tl,
      acts: tl.acts.filter((a) => a.id !== id),
      moments: tl.moments.map((m) => (m.actId === id ? { ...m, actId: '' } : m)),
    });
  const cycleActColor = (id: string) => {
    const a = tl.acts.find((x) => x.id === id);
    if (!a) return;
    const next = ACT_PALETTE[(ACT_PALETTE.indexOf(a.color as (typeof ACT_PALETTE)[number]) + 1) % ACT_PALETTE.length];
    patchAct(id, { color: next }, true);
  };
  const dropOnAct = (id: string, p: DragPayload) => {
    if (p.kind !== 'character') return;
    persist({
      ...tl,
      acts: tl.acts.map((a) => (a.id === id && !a.characters.includes(p.id) ? { ...a, characters: [...a.characters, p.id] } : a)),
    });
  };
  const removeActChar = (id: string, charId: string) =>
    patchAct(id, { characters: tl.acts.find((a) => a.id === id)!.characters.filter((c) => c !== charId) }, true);

  // ── Environment mutations ──────────────────────────────────────────────────
  const patchEnv = (id: string, patch: Partial<EnvToken>, doCommit = false) => {
    const next = { ...tl, environments: tl.environments.map((e) => (e.id === id ? { ...e, ...patch } : e)) };
    doCommit ? persist(next) : update(next);
  };
  const addEnv = () => persist({ ...tl, environments: [...tl.environments, makeEnv(tl.environments.length)] });
  const removeEnv = (id: string) =>
    persist({
      ...tl,
      environments: tl.environments.filter((e) => e.id !== id),
      moments: tl.moments.map((m) => (m.environment === id ? { ...m, environment: '' } : m)),
    });
  const cycleEnvGlyph = (id: string) => {
    const e = tl.environments.find((x) => x.id === id);
    if (!e) return;
    const next = ENV_GLYPHS[(ENV_GLYPHS.indexOf(e.glyph as (typeof ENV_GLYPHS)[number]) + 1) % ENV_GLYPHS.length];
    patchEnv(id, { glyph: next }, true);
  };

  // ── Spine settings ─────────────────────────────────────────────────────────
  const setLayout = (layout: TimelineLayout) => persist({ ...tl, layout });

  // Card placement: alternate above/below to scatter the cards (reference look),
  // but never above the first serpentine row where it would clip off-canvas.
  const placeAbove = (i: number, y: number) => y > height * 0.28 && i % 2 === 1;

  return (
    <div className="tl-root" onPointerLeave={() => { if (dragId.current) { dragId.current = null; commit(); } }}>
      {/* ── Title bar ── */}
      <header className="tl-bar">
        <span className="tl-kicker">Narrative timeline</span>
        <input
          className="tl-spine-title"
          value={tl.title}
          placeholder="Story spine"
          onChange={(e) => update({ ...tl, title: e.target.value })}
          onBlur={commit}
        />
        <input
          className="tl-spine-sub"
          value={tl.subtitle}
          placeholder="A short throughline…"
          onChange={(e) => update({ ...tl, subtitle: e.target.value })}
          onBlur={commit}
        />
        <div className="tl-bar-spacer" />
        <div className="tl-segment" title={TIMELINE_LAYOUT_HINTS[tl.layout]}>
          {TIMELINE_LAYOUTS.map((l) => (
            <button key={l} type="button" className={l === tl.layout ? 'is-on' : ''} onClick={() => setLayout(l)}>
              {TIMELINE_LAYOUT_LABELS[l]}
            </button>
          ))}
        </div>
        {tl.layout === 'serpentine' && (
          <label className="tl-slider">density
            <input type="range" min={2} max={6} value={tl.density}
              onChange={(e) => persist({ ...tl, density: Number(e.target.value) })} />
          </label>
        )}
        {tl.layout !== 'free' && (
          <label className="tl-slider">flow
            <input type="range" min={0} max={100} value={tl.amplitude}
              onChange={(e) => update({ ...tl, amplitude: Number(e.target.value) })}
              onPointerUp={commit} />
          </label>
        )}
      </header>

      {/* ── Acts legend / editor (also a drop target for recurring cast) ── */}
      <div className="tl-acts">
        {tl.acts.map((a) => (
          <div
            key={a.id}
            className="tl-actpill"
            style={{ ['--act' as string]: a.color }}
            onDragOver={(e) => { if (hasPayload(e)) e.preventDefault(); }}
            onDrop={(e) => { const p = readPayload(e); if (p) { e.preventDefault(); dropOnAct(a.id, p); } }}
          >
            <button type="button" className="tl-actdot" title="Cycle color" onClick={() => cycleActColor(a.id)} />
            <input className="tl-actname" value={a.title} onChange={(e) => patchAct(a.id, { title: e.target.value })} onBlur={commit} />
            {a.characters.length > 0 && (
              <span className="tl-actcast">
                {a.characters.map((cid) => (
                  <CharacterChip key={cid} id={cid} resolve={resolve} size={20} onRemove={() => removeActChar(a.id, cid)} />
                ))}
              </span>
            )}
            <button type="button" className="tl-actrm" title="Remove act" onClick={() => removeAct(a.id)}>×</button>
            <span className="tl-act-summary">
              <textarea value={a.summary} placeholder="Act summary…" rows={3}
                onChange={(e) => patchAct(a.id, { summary: e.target.value })} onBlur={commit} />
            </span>
          </div>
        ))}
        <button type="button" className="tl-addact" onClick={addAct}>+ act</button>
      </div>

      <div className="tl-main">
        {/* ── Shelf: drag characters & environments onto the ribbon ── */}
        <aside className="tl-shelf">
          <p className="tl-shelf-head">Characters</p>
          <div className="tl-shelf-list">
            {characters.length === 0 && (
              <p className="tl-shelf-empty">No character pages yet. Add a <b>Character Studio</b> to a page and it appears here.</p>
            )}
            {characters.map((c) => (
              <div
                key={c.id}
                className="tl-shelf-char"
                draggable
                onDragStart={(e) => writePayload(e, { kind: 'character', id: c.id })}
                title={`Drag ${c.title} onto a moment`}
              >
                <Portrait glimpse={c.glimpse} name={c.title} size={30} />
                <span className="tl-shelf-name">{c.title}</span>
              </div>
            ))}
          </div>

          <p className="tl-shelf-head">Environments</p>
          <div className="tl-shelf-list">
            {tl.environments.map((e) => (
              <div
                key={e.id}
                className="tl-shelf-env"
                draggable
                onDragStart={(ev) => writePayload(ev, { kind: 'environment', id: e.id })}
                style={{ ['--env' as string]: e.color }}
                title="Drag onto a moment"
              >
                <button type="button" className="tl-envglyph" title="Cycle glyph" onClick={() => cycleEnvGlyph(e.id)}>{e.glyph}</button>
                <input className="tl-envlabel" value={e.label} onChange={(ev) => patchEnv(e.id, { label: ev.target.value })} onBlur={commit} />
                <button type="button" className="tl-envrm" title="Remove" onClick={() => removeEnv(e.id)}>×</button>
              </div>
            ))}
            <button type="button" className="tl-addenv" onClick={addEnv}>+ place</button>
          </div>
        </aside>

        {/* ── Stage: a pan/zoom viewport over the flowing ribbon + moment nodes ── */}
        <div className="tl-stagewrap">
          <div
            className={`tl-viewport${panning ? ' is-panning' : ''}`}
            ref={viewportRef}
            onPointerDown={beginPan}
            onPointerMove={movePan}
            onPointerUp={endPan}
            onPointerCancel={endPan}
          >
          <div
            className="tl-stage"
            ref={stageRef}
            style={{
              aspectRatio: `${CANVAS_W} / ${height}`,
              transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.zoom})`,
              transformOrigin: '0 0',
            }}
            onDragOver={(e) => { if (hasPayload(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } }}
            onDrop={canvasDrop}
          >
            <svg className="tl-ribbon" viewBox={`0 0 ${CANVAS_W} ${height}`} preserveAspectRatio="none" aria-hidden>
              <path className="tl-ribbon-shadow" d={fullPath} />
              <path className="tl-ribbon-base" d={fullPath} />
              {segments.map((d, i) => (
                <path key={i} className="tl-ribbon-seg" d={d} stroke={momentColor(tl.moments[i], tl.acts)} />
              ))}
            </svg>

            {tl.moments.length === 0 && (
              <div className="tl-stage-empty">Add a moment, or drop a character here to begin the spine.</div>
            )}

            {tl.moments.map((m, i) => {
              const pt = points[i];
              if (!pt) return null;
              return (
                <TimelineNode
                  key={m.id}
                  moment={m}
                  index={i}
                  color={momentColor(m, tl.acts)}
                  xPct={(pt.x / CANVAS_W) * 100}
                  yPct={(pt.y / height) * 100}
                  placeAbove={placeAbove(i, pt.y)}
                  draggable={tl.layout === 'free'}
                  acts={tl.acts}
                  env={m.environment ? envById.get(m.environment) ?? null : null}
                  resolve={resolve}
                  onField={(patch) => patchMoment(m.id, patch)}
                  onCommit={commit}
                  onRemoveSelf={() => removeMoment(m.id)}
                  onMove={(dir) => moveMoment(m.id, dir)}
                  onRemoveChar={(cid) => removeChar(m.id, cid)}
                  onClearEnv={() => patchMoment(m.id, { environment: '' }, true)}
                  onDropPayload={(p) => dropOnMoment(m.id, p)}
                  onPointerDownGrip={(e) => beginDrag(e, m.id)}
                  onPointerMoveGrip={(e) => dragTo(e, m.id)}
                  onPointerUpGrip={() => endDrag(m.id)}
                />
              );
            })}
          </div>
            <div className="tl-zoom">
              <button type="button" onClick={() => zoomButton(1 / 1.2)} title="Zoom out">−</button>
              <button type="button" className="tl-zoom-pct" onClick={resetView} title="Reset view">{Math.round(view.zoom * 100)}%</button>
              <button type="button" onClick={() => zoomButton(1.2)} title="Zoom in">+</button>
            </div>
          </div>
        </div>
      </div>

      <div className="tl-foot">
        <button type="button" className="tl-addmoment" onClick={addMoment}>+ moment</button>
        <span className="tl-foot-hint">{TIMELINE_LAYOUT_HINTS[tl.layout]}</span>
      </div>
    </div>
  );
}
