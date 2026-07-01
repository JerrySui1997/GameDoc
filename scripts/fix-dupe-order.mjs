// One-off repair: connect to the live collab relay as a Yjs peer and de-duplicate
// each room's `order` Y.Array. A Y.Map can't hold duplicate keys, so the only way
// a block id appears twice in a rendered page is a doubled `order` array (which is
// what triggers React's "two children with the same key" error). Rewriting the
// order to its unique-in-first-occurrence sequence fixes the live clients, the
// relay's LevelDB cache, and (via the relay's debounced write-back) content.json —
// all in one transaction, no relay restart required.
//
// Usage: node scripts/fix-dupe-order.mjs <roomId> [<roomId> ...]
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import WS from 'ws';

const URL = process.env.NEXT_PUBLIC_COLLAB_URL || 'ws://localhost:1234';
const rooms = process.argv.slice(2);
if (rooms.length === 0) {
  console.error('usage: node scripts/fix-dupe-order.mjs <roomId> [<roomId> ...]');
  process.exit(1);
}

function fixRoom(room) {
  return new Promise((resolve) => {
    const doc = new Y.Doc();
    const provider = new WebsocketProvider(URL, room, doc, { WebSocketPolyfill: WS });
    const done = (result) => {
      provider.destroy();
      doc.destroy();
      resolve({ room, ...result });
    };
    provider.on('sync', (synced) => {
      if (!synced) return;
      const order = doc.getArray('order');
      const ids = order.toArray();
      const seen = new Set();
      const unique = [];
      for (const id of ids) {
        if (!seen.has(id)) { seen.add(id); unique.push(id); }
      }
      if (unique.length === ids.length) { done({ before: ids.length, after: ids.length, changed: false }); return; }
      doc.transact(() => {
        order.delete(0, order.length);
        order.insert(0, unique);
      }, 'local-edit');
      // Let the relay observe + persist (write-back is debounced ~700ms).
      setTimeout(() => done({ before: ids.length, after: unique.length, changed: true }), 2500);
    });
    // Safety timeout in case the room never syncs.
    setTimeout(() => done({ error: 'sync-timeout' }), 8000);
  });
}

for (const room of rooms) {
  const r = await fixRoom(room);
  if (r.error) console.log(`${room}: ERROR ${r.error}`);
  else if (r.changed) console.log(`${room}: order ${r.before} -> ${r.after} (deduped)`);
  else console.log(`${room}: ${r.before} ids, no duplicates`);
}
process.exit(0);
