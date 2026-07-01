'use client';

import { useEffect, useState } from 'react';
import { useDocs } from './DocsProvider';
import { useYDoc } from './useYDoc';
import { getMeta, ySetTitle } from '@/lib/docs/ydoc';
import { PageEditor } from './PageEditor';
import { useIdentity } from './identity';
import { NamePrompt, PresenceAvatars, useRemoteUsers } from './Presence';

// The collaborative editing surface for one page: title + body, both bound to the
// page's Yjs room. Loaded client-only (ssr:false) by DocView so the browser-only
// y-websocket connection never touches the server render.

export function LiveEditor({ docId }: { docId: string }) {
  const collab = useYDoc(docId);
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
        />
      ) : (
        <div className="min-h-[40vh] animate-pulse rounded-lg bg-line-soft" aria-hidden />
      )}
    </>
  );
}
