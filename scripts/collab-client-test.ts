// A scripted second collaborator for the `world` room. Connects to the live relay
// like a browser would, inserts a marker at the START of the first prose block
// (the browser is editing the END), advertises presence, and stays connected a
// few seconds so the running browser can observe the merge + the remote cursor.
//
// Run while `npm run dev:collab` is up:  npx tsx scripts/collab-client-test.ts

import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import WS from 'ws';
import { getOrder, getBlocks, readDocBlocks } from '@/lib/docs/ydoc';

const ROOM = process.argv[2] || 'world';
const MARKER = process.argv[3] || '[FROM-CLIENT-B]';

const doc = new Y.Doc();
const provider = new WebsocketProvider('ws://localhost:1234', ROOM, doc, {
  WebSocketPolyfill: WS as unknown as typeof WebSocket,
});

provider.awareness.setLocalStateField('user', { name: 'Bot B', color: '#16a34a' });

provider.on('sync', (isSynced: boolean) => {
  if (!isSynced) return;
  const order = getOrder(doc);
  const blocks = getBlocks(doc);
  const firstId = order.get(0);
  const yb = firstId ? blocks.get(firstId) : undefined;
  const ytext = yb?.get('text');
  if (!(ytext instanceof Y.Text)) {
    console.log('[client-b] first block has no Y.Text; aborting');
    process.exit(1);
  }

  console.log(`[client-b] synced. first block before: "${ytext.toString().slice(0, 60)}…"`);

  // Insert at the very start — a different region than the browser's end-edit, so
  // a correct CRDT keeps BOTH.
  doc.transact(() => ytext.insert(0, MARKER + ' '), 'client-b');

  // Advertise a cursor in that block so the browser shows our presence badge.
  provider.awareness.setLocalStateField('cursor', { blockId: firstId, start: 0, end: 0 });

  setTimeout(() => {
    const merged = readDocBlocks(doc)[0];
    const text = merged && 'text' in merged ? merged.text : '(none)';
    console.log(`[client-b] first block after merge: "${text.slice(0, 90)}…"`);
    console.log(`[client-b] contains our marker: ${text.includes(MARKER)}`);
    console.log(`[client-b] contains browser marker: ${text.includes('EDIT-MARKER-7788')}`);
    provider.destroy();
    process.exit(0);
  }, 4000);
});

setTimeout(() => { console.log('[client-b] timed out waiting for sync'); process.exit(1); }, 15000);
