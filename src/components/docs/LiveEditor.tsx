'use client';

import { useEffect, useState } from 'react';
import { useDocs } from './DocsProvider';
import { useYDoc } from './useYDoc';
import { getMeta, isYDocEmpty, ySetTitle } from '@/lib/docs/ydoc';
import { PageEditor } from './PageEditor';
import { useIdentity } from './identity';
import { NamePrompt, PresenceAvatars, useRemoteUsers } from './Presence';

// The collaborative editing surface for one page: title + body, both bound to the
// page's Yjs room. Loaded client-only (ssr:false) by DocView so the browser-only
// y-websocket connection never touches the server render.

export function LiveEditor({
  docId,
  roomId,
  onLive,
  onReadyChange,
  onChildPagesWidgetChange,
}: {
  docId: string;
  /** Yjs room name; defaults to the bare docId. Personal spaces pass
   *  `user:{userId}:{docId}` so their rooms live in a separate namespace
   *  (see server/collab-core.ts's parseRoom). */
  roomId?: string;
  onLive?: () => void;
  /** Reports whether this editor currently has real content to show (room synced,
   *  or the pooled Y.Doc already carries blocks) — see DocView's failsafe, which
   *  must not swap away from a good static paint onto this editor's own empty/
   *  loading state. */
  onReadyChange?: (ready: boolean) => void;
  /** Forwarded to PageEditor — see its own doc for why DocView needs this live. */
  onChildPagesWidgetChange?: (has: boolean) => void;
}) {
  const collab = useYDoc(roomId ?? docId);
  const { getById, patchLocalDoc } = useDocs();
  const { identity, ready: identityReady, save: saveIdentity } = useIdentity();
  const remoteUsers = useRemoteUsers(collab?.awareness ?? null);
  const snapshot = getById(docId);
  const [title, setTitle] = useState(snapshot?.title ?? '');

  // Keep the title input in sync with the collaborative meta map.
  useEffect(() => {
    if (!collab) return;
    const meta = getMeta(collab.doc);
    const update = () => {
      const t = meta.get('title');
      if (typeof t === 'string') setTitle(t);
    };
    meta.observe(update);
    update();
    return () => meta.unobserve(update);
  }, [collab]);

  // Tell DocView it can drop the static placeholder once this editor has content
  // to show — either the room has synced, or the (pooled) Y.Doc already carries
  // blocks from a prior visit. The doc's own update stream is the fallback so the
  // first content flips it even before the provider's `synced` flag settles.
  useEffect(() => {
    const c = collab;
    if (!c) { onReadyChange?.(false); return; }
    const fireIfReady = () => {
      const ready = c.synced || !isYDocEmpty(c.doc);
      onReadyChange?.(ready);
      if (ready) onLive?.();
      return ready;
    };
    if (fireIfReady()) return;
    c.doc.on('update', fireIfReady);
    return () => c.doc.off('update', fireIfReady);
  }, [collab, onLive, onReadyChange]);

  function onTitle(value: string) {
    setTitle(value);
    if (collab) ySetTitle(collab.doc, value);
    patchLocalDoc(docId, { title: value }); // reflect in this client's sidebar now
  }

  const connectionLabel = !collab ? 'Connecting…' : collab.synced ? 'Live' : 'Connecting…';
  const live = !!collab?.synced;

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <span className={`flex items-center gap-1.5 font-mono text-[11px] font-medium ${live ? 'text-teal' : 'text-muted'}`}>
          <span className={`inline-block h-2 w-2 rounded-full ${live ? 'bg-teal' : 'bg-line'}`} />
          {connectionLabel}
        </span>
        <PresenceAvatars users={remoteUsers} />
      </div>

      {identityReady && !identity && <NamePrompt onSave={saveIdentity} />}

      <input
        value={title}
        onChange={(e) => onTitle(e.target.value)}
        placeholder="Untitled"
        className="w-full border-none bg-transparent text-4xl font-bold tracking-tight text-ink placeholder:text-muted/55 focus:outline-none focus:ring-0"
      />

      {collab ? (
        <PageEditor
          key={docId}
          doc={collab.doc}
          docId={docId}
          awareness={collab.awareness}
          identity={identity}
          onChildPagesWidgetChange={onChildPagesWidgetChange}
        />
      ) : (
        <div className="min-h-[40vh] animate-pulse rounded-lg bg-line-soft" aria-hidden />
      )}
    </>
  );
}
