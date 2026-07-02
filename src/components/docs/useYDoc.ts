'use client';

import { useEffect, useState } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

// One Y.Doc + WebSocket connection per page room. The collab relay seeds the
// room from content.json and persists it back, so the client never seeds — it
// just renders whatever syncs down. The room name is the doc id.

// Where the browser reaches the Yjs relay:
//   1. NEXT_PUBLIC_COLLAB_URL if set (local dev sets ws://localhost:1234).
//   2. else same-origin /collab — the production server hosts the relay there,
//      so this inlined value never needs a per-domain rebuild.
//   3. else ws://localhost:1234 (dev fallback when the var is unset).
function collabUrl(): string {
  const env = process.env.NEXT_PUBLIC_COLLAB_URL;
  if (env) return env;
  if (typeof window !== 'undefined') {
    const { protocol, host, hostname } = window.location;
    const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
    if (!isLocal) return `${protocol === 'https:' ? 'wss' : 'ws'}://${host}/collab`;
  }
  return 'ws://localhost:1234';
}

export type Awareness = WebsocketProvider['awareness'];

export type Collab = {
  doc: Y.Doc;
  provider: WebsocketProvider;
  awareness: Awareness;
  /** True once the initial state has synced from the server. */
  synced: boolean;
};

/** Connect to the collab room for `roomId`. Returns null until the doc exists. */
export function useYDoc(roomId: string): Collab | null {
  const [collab, setCollab] = useState<Omit<Collab, 'synced'> | null>(null);
  const [synced, setSynced] = useState(false);

  useEffect(() => {
    const doc = new Y.Doc();
    const provider = new WebsocketProvider(collabUrl(), roomId, doc);
    const onSync = (isSynced: boolean) => setSynced(isSynced);
    provider.on('sync', onSync);
    setCollab({ doc, provider, awareness: provider.awareness });
    setSynced(provider.synced);

    return () => {
      provider.off('sync', onSync);
      provider.destroy(); // also disconnects + clears this client's awareness
      doc.destroy();
      setCollab(null);
      setSynced(false);
    };
  }, [roomId]);

  return collab ? { ...collab, synced } : null;
}
