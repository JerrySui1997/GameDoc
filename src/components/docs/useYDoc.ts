'use client';

import { useEffect, useState } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

// One Y.Doc + WebSocket connection per page room. The collab relay seeds the
// room from content.json and persists it back, so the client never seeds — it
// just renders whatever syncs down. The room name is the doc id.

// The deployed relay. The live store is the single source of truth whenever it
// is reachable — the repo's content.json is a passive disaster-recovery backup
// (refresh via `npm run backup-live`), never an automatic fallback.
const LIVE_COLLAB_URL = 'wss://gamedoc-production.up.railway.app/collab';

// Where the browser reaches the Yjs relay:
//   1. NEXT_PUBLIC_COLLAB_URL if set — a deliberate override, e.g.
//      ws://localhost:1234 when developing the relay/serialization code itself
//      against a local `npm run dev:collab`.
//   2. else same-origin /collab — the production server hosts the relay there,
//      so this inlined value never needs a per-domain rebuild.
//   3. else (localhost) the LIVE relay: local browsing edits the live store,
//      not a local copy.
function collabUrl(): string {
  const env = process.env.NEXT_PUBLIC_COLLAB_URL;
  if (env) return env;
  if (typeof window !== 'undefined') {
    const { protocol, host, hostname } = window.location;
    const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
    if (!isLocal) return `${protocol === 'https:' ? 'wss' : 'ws'}://${host}/collab`;
  }
  return LIVE_COLLAB_URL;
}

// Handshake credentials for a cross-origin relay. A localhost browser can
// never present the live site's gd_session cookie on the WS upgrade, so the
// relay's gate (server/collab-core.ts) also accepts the shared agent secret as
// an ?agent= query param — browsers can't set headers on a WS handshake. Set
// NEXT_PUBLIC_COLLAB_AGENT_TOKEN (= GAMEDOC_AGENT_TOKEN) in .env.local only:
// the deployed build must never inline it, or the publicly downloadable
// bundle would leak the secret.
function collabParams(): Record<string, string> {
  const token = process.env.NEXT_PUBLIC_COLLAB_AGENT_TOKEN;
  return token ? { agent: token } : {};
}

export type Awareness = WebsocketProvider['awareness'];

export type Collab = {
  doc: Y.Doc;
  provider: WebsocketProvider;
  awareness: Awareness;
  /** True once the initial state has synced from the server. */
  synced: boolean;
};

// ── Warm Y.Doc pool ─────────────────────────────────────────────────────────
// The CRDT document for a room is kept alive across navigations so returning to
// a page shows its content *instantly* — no waiting for a fresh socket to
// reconnect and re-sync. Only the doc (the content) is pooled; a new
// WebsocketProvider is created per mount and destroyed on unmount, which keeps
// presence correct — leaving a page immediately clears this client from its
// peers, no lingering ghost. A short eviction grace bounds memory across a long
// session that visits many pages.
type PooledDoc = { doc: Y.Doc; refs: number; evict?: ReturnType<typeof setTimeout> };
const docPool = new Map<string, PooledDoc>();
const EVICT_MS = 60_000;

function acquireDoc(roomId: string): Y.Doc {
  let entry = docPool.get(roomId);
  if (!entry) {
    entry = { doc: new Y.Doc(), refs: 0 };
    docPool.set(roomId, entry);
  }
  if (entry.evict) { clearTimeout(entry.evict); entry.evict = undefined; }
  entry.refs += 1;
  return entry.doc;
}

function releaseDoc(roomId: string): void {
  const entry = docPool.get(roomId);
  if (!entry) return;
  entry.refs -= 1;
  if (entry.refs > 0) return;
  // Unused for now — keep it warm briefly for a quick return, then destroy.
  entry.evict = setTimeout(() => {
    if (entry.refs <= 0) {
      entry.doc.destroy();
      docPool.delete(roomId);
    }
  }, EVICT_MS);
}

/** Connect to the collab room for `roomId`. Returns null until the doc exists. */
export function useYDoc(roomId: string): Collab | null {
  const [collab, setCollab] = useState<Omit<Collab, 'synced'> | null>(null);
  const [synced, setSynced] = useState(false);

  useEffect(() => {
    const doc = acquireDoc(roomId);
    const provider = new WebsocketProvider(collabUrl(), roomId, doc, { params: collabParams() });
    const onSync = (isSynced: boolean) => setSynced(isSynced);
    provider.on('sync', onSync);
    setCollab({ doc, provider, awareness: provider.awareness });
    setSynced(provider.synced);

    return () => {
      provider.off('sync', onSync);
      provider.destroy(); // disconnects + clears THIS client's awareness (no ghost)
      releaseDoc(roomId); // keep the doc (content) warm briefly, then evict
      setCollab(null);
      setSynced(false);
    };
  }, [roomId]);

  return collab ? { ...collab, synced } : null;
}
