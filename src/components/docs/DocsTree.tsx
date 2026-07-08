'use client';

import { createContext, useCallback, useContext, useRef, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useDocs } from './DocsProvider';
import { ancestorIds, type DocTreeNode } from '@/lib/schema/doc';
import { NodeCreator } from '@/components/templates/NodeCreator';
import {
  HUE_STOPS,
  coerceHue,
  hueSwatch,
  resolveRowHue,
  rowColors,
  spectrumGradient,
} from '@/lib/docs/hierarchyColor';

// ── Drag-and-drop context ─────────────────────────────────────────────────

type DragContextValue = {
  draggedId: string | null;
  dropTargetId: string | null;
  startDrag: (id: string) => void;
  endDrag: () => void;
  setDropTarget: (id: string | null) => void;
  commitDrop: (targetId: string) => void;
  isValidDrop: (targetId: string) => boolean;
};

const DragContext = createContext<DragContextValue | null>(null);

function useDragContext() {
  const ctx = useContext(DragContext);
  if (!ctx) throw new Error('DragContext missing');
  return ctx;
}

// ── Components ────────────────────────────────────────────────────────────

function TreeNode({ node, activeId, depth }: { node: DocTreeNode; activeId: string | null; depth: number }) {
  const { docs, editing } = useDocs();
  const agentEditing = node.id in editing;
  const { draggedId, dropTargetId, startDrag, endDrag, setDropTarget, commitDrop, isValidDrop } = useDragContext();

  const hasChildren = node.children.length > 0;
  const onActivePath = activeId === node.id || ancestorIds(docs, activeId ?? '').includes(node.id);
  const [open, setOpen] = useState(onActivePath || depth === 0);
  const [picking, setPicking] = useState(false);

  const isActive = activeId === node.id;
  const isDropTarget = dropTargetId === node.id;
  const isDragging = draggedId === node.id;

  // Resolve the hue colouring this row: the page's own, else the nearest coloured
  // ancestor's (softened by how far below the owner it sits). The drop-target
  // highlight always wins so a move is unambiguous.
  const resolved = resolveRowHue(docs, node.id);
  const colors = resolved ? rowColors(resolved.hue, resolved.depth) : null;
  const ownsHue = coerceHue(node.hue) !== null;

  // Compose the row's look. Tinted idle rows lean on the .doc-row class (for a
  // real CSS :hover off the --row-* vars); everything else keeps utilities.
  let rowClass: string;
  let rowStyle: CSSProperties = { paddingLeft: `${depth * 12 + 4}px` };
  if (isDropTarget) {
    rowClass = 'bg-teal-soft text-ink ring-2 ring-teal';
  } else if (isActive) {
    rowClass = colors ? 'text-white' : 'bg-ink text-white';
    if (colors) {
      rowStyle = { ...rowStyle, backgroundColor: colors.activeBg, color: colors.activeInk, boxShadow: `inset 3px 0 0 ${colors.rail}` };
    }
  } else if (colors) {
    rowClass = 'doc-row text-ink';
    rowStyle = {
      ...rowStyle,
      ['--row-fill']: colors.fill,
      ['--row-fill-hover']: colors.fillHover,
      ['--row-rail']: colors.rail,
    } as CSSProperties;
  } else {
    rowClass = 'text-ink hover:bg-coffee-soft';
  }

  return (
    <li>
      <div
        draggable
        onDragStart={(e) => {
          e.stopPropagation();
          startDrag(node.id);
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', node.id);
        }}
        onDragEnd={endDrag}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (isValidDrop(node.id)) {
            e.dataTransfer.dropEffect = 'move';
            setDropTarget(node.id);
          } else {
            e.dataTransfer.dropEffect = 'none';
          }
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            setDropTarget(null);
          }
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (isValidDrop(node.id)) {
            commitDrop(node.id);
          }
        }}
        className={[
          'group relative flex items-center gap-1 rounded-lg pr-1 transition-colors select-none',
          isDragging ? 'cursor-grabbing opacity-40' : 'cursor-grab',
          rowClass,
        ].join(' ')}
        style={rowStyle}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? 'Collapse' : 'Expand'}
            className={[
              'flex h-5 w-5 shrink-0 items-center justify-center rounded text-xs',
              isActive ? 'text-white/60 hover:text-white' : 'text-muted hover:text-ink',
            ].join(' ')}
          >
            <span className={`transition-transform ${open ? 'rotate-90' : ''}`}>▸</span>
          </button>
        ) : (
          <span className="h-5 w-5 shrink-0" />
        )}

        <Link href={`/docs/${node.id}`} className="flex min-w-0 flex-1 items-center gap-1.5 py-1.5 text-sm font-medium">
          <span className="truncate">{node.title}</span>
          {agentEditing && (
            <span
              className="relative flex h-2 w-2 shrink-0"
              title="An AI agent is editing this page"
              aria-label="An AI agent is editing this page"
            >
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brass opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-brass" />
            </span>
          )}
        </Link>

        <HuePicker
          node={node}
          isActive={isActive}
          ownsHue={ownsHue}
          inheritedHue={resolved?.hue ?? null}
          open={picking}
          onOpenChange={setPicking}
        />
      </div>

      {hasChildren && open && (
        <ul className="mt-0.5 space-y-0.5">
          {node.children.map((child) => (
            <TreeNode key={child.id} node={child} activeId={activeId} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

// ── Per-row hue picker ────────────────────────────────────────────────────
// The colour control on a sidebar row: a small dot that opens a popover to set
// this page's hierarchy hue. Curated swatches cover the comfortable spectrum at
// a click; the slider opens the full wheel; "Inherit" clears the page's own hue
// so it falls back to its ancestor's. Edits go through the body-preserving
// patchDoc; the slider previews live via patchLocalDoc and only persists on
// release, so dragging it doesn't hammer the store.
function HuePicker({
  node,
  isActive,
  ownsHue,
  inheritedHue,
  open,
  onOpenChange,
}: {
  node: DocTreeNode;
  isActive: boolean;
  ownsHue: boolean;
  inheritedHue: number | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { patchDoc, patchLocalDoc } = useDocs();
  const ownHue = coerceHue(node.hue);
  // Slider draft seeds from the page's own hue, else whatever it inherits, else a calm teal.
  const draftHue = ownHue ?? inheritedHue ?? 210;

  const commit = useCallback(
    (hue: number | null) => {
      patchDoc(node.id, { hue }).catch((err) => console.error('Failed to set page colour:', err));
    },
    [patchDoc, node.id],
  );

  // The dot button: solid when this page owns its hue (so colour "sources" are
  // visible at rest), otherwise a faint outline shown on row hover.
  const dotStyle = ownsHue && ownHue !== null ? { backgroundColor: hueSwatch(ownHue) } : undefined;

  return (
    <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        draggable={false}
        onDragStart={(e) => e.preventDefault()}
        onClick={() => onOpenChange(!open)}
        aria-label="Set row colour"
        title="Set row colour"
        className={[
          'flex h-5 w-5 items-center justify-center rounded transition-opacity',
          ownsHue || open ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus:opacity-100',
        ].join(' ')}
      >
        {ownsHue && ownHue !== null ? (
          <span className="h-3 w-3 rounded-full ring-1 ring-inset ring-black/15" style={dotStyle} />
        ) : (
          <span
            className={[
              'h-3 w-3 rounded-full border border-dashed',
              isActive ? 'border-white/60' : 'border-muted',
            ].join(' ')}
          />
        )}
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close colour picker"
            className="fixed inset-0 z-20 cursor-default"
            onClick={() => onOpenChange(false)}
          />
          <div className="absolute right-0 top-full z-30 mt-1 w-56 rounded-xl border border-line bg-raised p-2 text-ink shadow-lg">
            <div className="mb-1.5 px-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-muted">
              Row colour
            </div>

            <div className="grid grid-cols-6 gap-1">
              {HUE_STOPS.map((s) => (
                <button
                  key={s.hue}
                  type="button"
                  title={s.name}
                  onClick={() => commit(s.hue)}
                  className={[
                    'h-6 w-full rounded-md ring-1 ring-inset ring-black/10 transition-transform hover:scale-105',
                    ownHue === s.hue ? 'outline outline-2 outline-offset-1 outline-ink' : '',
                  ].join(' ')}
                  style={{ backgroundColor: hueSwatch(s.hue) }}
                />
              ))}
            </div>

            <label className="mt-2.5 block">
              <span className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-muted">Hue</span>
              <input
                type="range"
                min={0}
                max={359}
                value={draftHue}
                onChange={(e) => patchLocalDoc(node.id, { hue: Number(e.target.value) })}
                onPointerUp={(e) => commit(Number((e.target as HTMLInputElement).value))}
                onKeyUp={(e) => commit(Number((e.target as HTMLInputElement).value))}
                className="hue-slider h-3 w-full cursor-pointer appearance-none rounded-full"
                style={{ background: spectrumGradient() }}
                aria-label="Row hue"
              />
            </label>

            <button
              type="button"
              onClick={() => {
                commit(null);
                onOpenChange(false);
              }}
              disabled={!ownsHue}
              className={[
                'mt-2 flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left text-xs transition-colors',
                ownsHue ? 'text-muted hover:bg-canvas' : 'cursor-default text-muted/50',
              ].join(' ')}
            >
              <span className="flex h-3 w-3 items-center justify-center">∅</span>
              {inheritedHue !== null && !ownsHue ? 'Inheriting from parent' : 'Inherit (clear colour)'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── DocsTree ──────────────────────────────────────────────────────────────

export function DocsTree() {
  const { docs, tree, patchDoc } = useDocs();
  const pathname = usePathname();
  const activeId = pathname.startsWith('/docs/') ? decodeURIComponent(pathname.slice('/docs/'.length)) : null;
  const [adding, setAdding] = useState(false);

  const draggedIdRef = useRef<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [detachHover, setDetachHover] = useState(false);

  const startDrag = useCallback((id: string) => {
    draggedIdRef.current = id;
    setDraggedId(id);
    setDropTargetId(null);
  }, []);

  const endDrag = useCallback(() => {
    draggedIdRef.current = null;
    setDraggedId(null);
    setDropTargetId(null);
    setDetachHover(false);
  }, []);

  const setDropTarget = useCallback((id: string | null) => {
    setDropTargetId(id);
  }, []);

  const isValidDrop = useCallback(
    (targetId: string): boolean => {
      const did = draggedIdRef.current;
      if (!did) return false;
      if (did === targetId) return false;
      if (ancestorIds(docs, targetId).includes(did)) return false;
      const dragged = docs.find((d) => d.id === did);
      if (dragged?.parentId === targetId) return false;
      return true;
    },
    [docs],
  );

  const commitDrop = useCallback(
    async (targetId: string) => {
      const did = draggedIdRef.current;
      draggedIdRef.current = null;
      setDraggedId(null);
      setDropTargetId(null);
      if (!did || did === targetId) return;

      const siblingCount = docs.filter((d) => d.parentId === targetId).length;
      try {
        // patchDoc (PATCH), not a full PUT: a move must never write this
        // client's body snapshot over a page someone is live-editing.
        await patchDoc(did, { parentId: targetId, order: siblingCount });
      } catch (err) {
        console.error('Failed to move page:', err);
      }
    },
    [docs, patchDoc],
  );

  // Detach: drop onto the left strip to make a page top-level (parentId null)
  const commitDetach = useCallback(async () => {
    const did = draggedIdRef.current;
    draggedIdRef.current = null;
    setDraggedId(null);
    setDropTargetId(null);
    setDetachHover(false);
    if (!did) return;

    const dragged = docs.find((d) => d.id === did);
    if (!dragged || dragged.parentId === null) return; // already root

    const rootCount = docs.filter((d) => d.parentId === null).length;
    try {
      await patchDoc(did, { parentId: null, order: rootCount });
    } catch (err) {
      console.error('Failed to detach page:', err);
    }
  }, [docs, patchDoc]);

  const dragContextValue: DragContextValue = {
    draggedId,
    dropTargetId,
    startDrag,
    endDrag,
    setDropTarget,
    commitDrop,
    isValidDrop,
  };

  // Whether the currently dragged page can be detached (has a parent)
  const canDetach = draggedId !== null && docs.find((d) => d.id === draggedId)?.parentId !== null;

  return (
    <DragContext.Provider value={dragContextValue}>
      <nav aria-label="Documentation navigation">
        <div className="mb-2 flex items-center justify-between px-1">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">Documentation</p>
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            className="rounded px-1.5 text-base leading-none text-muted hover:text-brass"
            title="Add top-level page"
          >
            +
          </button>
        </div>
        {adding && (
          <div className="mb-2 px-1">
            <NodeCreator parentId={null} onDone={() => setAdding(false)} onCancel={() => setAdding(false)} />
          </div>
        )}

        {/* Tree + detach strip side by side */}
        <div className="flex items-stretch gap-1">
          {/* Detach strip: drag a nested page here to make it top-level */}
          <div
            onDragOver={(e) => {
              if (!canDetach) return;
              e.preventDefault();
              e.stopPropagation();
              e.dataTransfer.dropEffect = 'move';
              setDetachHover(true);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                setDetachHover(false);
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (canDetach) commitDetach();
            }}
            title="Drop here to make top-level"
            className={[
              'w-3 shrink-0 rounded transition-colors',
              detachHover && canDetach
                ? 'bg-brass'
                : canDetach
                ? 'bg-brass-soft hover:bg-brass/40'
                : 'bg-canvas',
            ].join(' ')}
          />

          <ul className="min-w-0 flex-1 space-y-0.5">
            {tree.map((node) => (
              <TreeNode key={node.id} node={node} activeId={activeId} depth={0} />
            ))}
          </ul>
        </div>
      </nav>
    </DragContext.Provider>
  );
}
