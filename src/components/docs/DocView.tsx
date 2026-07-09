'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { bodyHasChildPages } from '@/lib/docs/blocks';
import { useDocs } from './DocsProvider';
import { InlinePrompt, slugify } from './inline';
import { RelatedPanel } from './RelatedPanel';
import { StaticDocBody } from './StaticDocBody';

// The collaborative editor talks to the y-websocket relay from the browser only,
// so it must never run on the server. Loading it ssr:false keeps DocView (and the
// SSR pass) free of any Yjs/WebSocket imports.
const LiveEditor = dynamic(
  () => import('./LiveEditor').then((m) => m.LiveEditor),
  {
    ssr: false,
    loading: () => <div className="min-h-[50vh] animate-pulse rounded-lg bg-line-soft" aria-hidden />,
  },
);

/** The one page editor: prose + structured widget blocks, for every page.
 *  `initialBody` is the server-rendered body snapshot from docs/[id]/page.tsx —
 *  the provider's docs are body-less until its background hydration lands, so
 *  the static paint can't rely on `getById(docId).body`. */
export function DocView({
  docId,
  initialBody,
  basePath = '/docs',
  rootHref = '/',
  roomId,
}: {
  docId: string;
  initialBody: string | null;
  /** Personal spaces (src/app/(personal)/app) pass '/app/docs'. */
  basePath?: string;
  /** Where "delete a top-level page" and the parentless case send you.
   *  Personal spaces pass '/app'. */
  rootHref?: string;
  /** Yjs room name, forwarded to LiveEditor; defaults to the bare docId. */
  roomId?: string;
}) {
  const { getById, docs, createDoc, deleteDoc, editing } = useDocs();
  const router = useRouter();
  const doc = getById(docId);
  const agentLabel = editing[docId];

  const [error, setError] = useState<string | null>(null);
  const [addingChild, setAddingChild] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Paint the page's stored content instantly (server-rendered), then swap to the
  // live collaborative editor once its Yjs room has content to show. Kills the
  // "gray box → content pops in late" waterfall. Reset per page via the `key` on
  // DocView (see docs/[id]/page.tsx).
  const [live, setLive] = useState(false);
  const handleLive = useCallback(() => setLive(true), []);
  // A page with real saved content must never be force-swapped to an empty
  // live editor — the Yjs room is only ever seeded by the collab relay (see
  // useYDoc.ts), so if the relay is slow/unreachable the room really is empty,
  // not just "not synced yet". Blindly revealing it would replace good static
  // content with a blank page (exactly the "jumps to an empty page" bug).
  const hasStaticContent = Boolean((initialBody ?? doc?.body ?? '').trim());
  const [syncStalled, setSyncStalled] = useState(false);
  // Safety net: for a genuinely new/empty page there's nothing to lose, so
  // reveal the editor even if collab never signals ready (relay slow or
  // unreachable) rather than being stuck on an equally-empty read-only paint.
  // Pages with existing content instead wait indefinitely for a real `onLive`
  // signal, surfacing a non-destructive "still connecting" notice after a
  // longer grace period so the static content never silently disappears.
  useEffect(() => {
    if (live) return;
    if (!hasStaticContent) {
      const t = setTimeout(() => setLive(true), 5000);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setSyncStalled(true), 8000);
    return () => clearTimeout(t);
  }, [live, hasStaticContent]);
  useEffect(() => {
    if (live) setSyncStalled(false);
  }, [live]);
  // Whether the body already has an inline childPages widget, so the fallback
  // list below isn't a duplicate of it. Seeded from the static `body` (matching
  // what StaticDocBody paints, so there's no flash) and kept live thereafter by
  // the editor's own reactive block state, which sees same-session edits that
  // `doc.body` here does not (it only refreshes on reload/remote commits).
  const [inlineChildPages, setInlineChildPages] = useState(() => (doc ? bodyHasChildPages(doc.body) : false));

  if (!doc) {
    return (
      <div className="rounded-xl border border-line bg-surface p-8 text-muted">
        No documentation page found for <code className="text-ink">{docId}</code>.
      </div>
    );
  }

  const children = docs.filter((d) => d.parentId === doc.id);

  async function addChild(childTitle: string) {
    const id = slugify(childTitle);
    if (!id) { setError('Enter a title with at least one letter or number'); return; }
    try {
      const created = await createDoc({ id, title: childTitle, parentId: doc!.id, body: '' });
      setAddingChild(false);
      router.push(`${basePath}/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add child');
    }
  }

  async function remove() {
    try {
      const parentId = doc!.parentId;
      await deleteDoc(doc!.id);
      router.push(parentId ? `${basePath}/${parentId}` : rootHref);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    }
  }

  return (
    <article className="w-full space-y-4">
      {agentLabel && (
        <div
          className="flex items-center gap-2.5 rounded-lg border border-brass/40 bg-brass-soft px-3 py-2 text-sm font-medium text-brass"
          role="status"
          aria-live="polite"
        >
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brass opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-brass" />
          </span>
          <span>✨ {agentLabel} is editing this page…</span>
        </div>
      )}

      <div className="flex items-center justify-end gap-4">
        <div className="flex shrink-0 gap-2">
          <button
            onClick={() => { setAddingChild((v) => !v); setError(null); }}
            className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold text-ink hover:bg-canvas"
          >
            Add child
          </button>
          <button
            onClick={() => { setConfirmDelete(true); setError(null); }}
            className="rounded-lg border border-oxblood/30 px-3 py-1.5 text-sm font-semibold text-oxblood hover:bg-oxblood-soft"
          >
            Delete
          </button>
        </div>
      </div>

      {error && <p className="rounded-lg bg-oxblood-soft px-3 py-2 text-sm text-oxblood">{error}</p>}

      {addingChild && (
        <div className="rounded-xl border border-line bg-surface p-3">
          <p className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-wide text-muted">New child page</p>
          <InlinePrompt
            placeholder="Child page title"
            submitLabel="Create"
            onSubmit={addChild}
            onCancel={() => { setAddingChild(false); setError(null); }}
          />
        </div>
      )}

      {confirmDelete && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-oxblood/30 bg-oxblood-soft p-3">
          <p className="text-sm text-oxblood">
            Delete <span className="font-semibold">{doc.title}</span>? Child pages move up one level.
          </p>
          <div className="flex gap-2">
            <button
              onClick={remove}
              className="rounded-lg bg-oxblood px-3 py-1.5 text-sm font-semibold text-white hover:bg-oxblood/90"
            >
              Delete
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold text-ink hover:bg-canvas"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {!live && syncStalled && (
        <div
          className="rounded-lg border border-line bg-canvas/60 px-3 py-2 text-xs font-medium text-muted"
          role="status"
          aria-live="polite"
        >
          Live editing is taking longer than usual to connect — showing the last saved version below. It'll switch
          over automatically once it reconnects.
        </div>
      )}

      {/* Static paint and live editor share one grid cell so it sizes to the
          taller of the two; the editor stays mounted (connecting) but invisible
          until it's ready, then the static copy is dropped. */}
      <div className="grid">
        <div className={`col-start-1 row-start-1 ${live ? '' : 'invisible'}`}>
          <LiveEditor docId={doc.id} roomId={roomId} onLive={handleLive} onChildPagesWidgetChange={setInlineChildPages} />
        </div>
        {!live && (
          <div className="col-start-1 row-start-1">
            <StaticDocBody title={doc.title} body={initialBody ?? doc.body} />
          </div>
        )}
      </div>

      <RelatedPanel docId={doc.id} />

      {!inlineChildPages && children.length > 0 && (
        <section className="pt-6">
          <h2 className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-wide text-muted">Child pages</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {children
              .sort((a, b) => a.order - b.order)
              .map((child) => (
                <li key={child.id}>
                  <a
                    href={`${basePath}/${child.id}`}
                    className="block rounded-xl border border-line bg-surface px-4 py-3 text-sm font-medium text-ink hover:border-brass hover:bg-brass-soft"
                  >
                    {child.title}
                  </a>
                </li>
              ))}
          </ul>
        </section>
      )}
    </article>
  );
}
