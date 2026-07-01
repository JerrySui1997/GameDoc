// ── Collaboration server ──────────────────────────────────────────────────
// A standalone WebSocket relay for Yjs documents — one shared instance the whole
// team's browsers connect to. Next.js (Turbopack dev) can't host a long-lived
// WebSocket, so this runs as its own process alongside it (see `dev:all`).
//
// Each editable page is one Yjs room, keyed by the doc id (the WebsocketProvider
// room name → the URL path → docName here). Two persistence concerns:
//
//   1. Durability across restarts — CRDT state is stored in LevelDB so a server
//      bounce never loses in-flight edits or merge history.
//   2. Canonical format — content.json stays the source of truth for SSR, search,
//      scripts and the MCP server. We seed a room from content.json the first
//      time it's opened (when LevelDB has nothing yet), and debounce-serialize
//      the live doc back to content.json on every change.

import http from 'http';
import os from 'os';
import { WebSocketServer } from 'ws';
// y-websocket@1.5's bundled server utils (CJS) — the proven yjs-13 relay, paired
// here with y-leveldb. Deep import is allowed via the package's exports map.
import { setupWSConnection, setPersistence } from 'y-websocket/bin/utils';
import * as Y from 'yjs';
import { LeveldbPersistence } from 'y-leveldb';
import path from 'path';
import { readDocs, writeDocs } from '@/lib/docs/store';
import { isYDocEmpty, readTitle, seedYDoc, serializeYDoc } from '@/lib/docs/ydoc';

const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.COLLAB_PORT || 1234);
// Store the LevelDB outside the project root so Turbopack's directory scanner
// never hits the LevelDB LOCK file (which it can't read, causing a fatal panic).
const DB_DIR = process.env.COLLAB_DB_DIR || path.join(os.homedir(), '.gamedoc', 'collab-db');
const WRITE_DEBOUNCE_MS = 700; // match the editor's old autosave feel

const ldb = new LeveldbPersistence(DB_DIR);

// ── content.json write-back, globally serialized ───────────────────────────
// Every room's write-back is a read-modify-write of the single content.json
// collection. Chaining them through one promise queue (this process owns the
// file) means two rooms saving at once can never clobber each other's node — the
// per-path queue inside the json store only serializes the final write, not the
// surrounding read+mutate.
let writeChain: Promise<unknown> = Promise.resolve();
const pendingTimers = new Map<string, NodeJS.Timeout>();

function persistToContentJson(docId: string, doc: Y.Doc): void {
  const existing = pendingTimers.get(docId);
  if (existing) clearTimeout(existing);
  pendingTimers.set(
    docId,
    setTimeout(() => {
      pendingTimers.delete(docId);
      const body = serializeYDoc(doc);
      const title = readTitle(doc);
      writeChain = writeChain.then(async () => {
        try {
          const docs = await readDocs();
          const idx = docs.findIndex((d) => d.id === docId);
          // Don't resurrect a node deleted out-of-band via the REST API.
          if (idx === -1) return;
          const next = [...docs];
          next[idx] = {
            ...next[idx],
            body,
            title: title && title.trim() ? title : next[idx].title,
          };
          await writeDocs(next);
        } catch (err) {
          console.error(`[collab] write-back failed for "${docId}":`, err);
        }
      }, () => {});
    }, WRITE_DEBOUNCE_MS),
  );
}

// ── Persistence: LevelDB load + content.json seed + change subscriptions ────
setPersistence({
  provider: ldb,
  bindState: async (docName, ydoc) => {
    // 1. Load any durable CRDT state from LevelDB into the live doc.
    const persisted = await ldb.getYDoc(docName);
    Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(persisted), 'load');

    // 2. If nothing was persisted, seed from the canonical content.json node.
    if (isYDocEmpty(ydoc)) {
      try {
        const node = (await readDocs()).find((d) => d.id === docName);
        if (node) seedYDoc(ydoc, node.body, node.title);
      } catch (err) {
        console.error(`[collab] seed failed for "${docName}":`, err);
      }
    }

    // 3. Persist whatever we ended up with, then mirror every future update to
    //    LevelDB and (debounced) back to content.json.
    ldb.storeUpdate(docName, Y.encodeStateAsUpdate(ydoc));
    ydoc.on('update', (update: Uint8Array, origin: unknown) => {
      ldb.storeUpdate(docName, update);
      // Skip our own seed/load transactions — they carry no user intent and the
      // content is already what's on disk.
      if (origin === 'load' || origin === 'seed') return;
      persistToContentJson(docName, ydoc);
    });
  },
  writeState: async (docName, ydoc) => {
    // Connection drained: flush a final snapshot to LevelDB.
    await ldb.storeUpdate(docName, Y.encodeStateAsUpdate(ydoc));
  },
});

// ── HTTP + WebSocket server ────────────────────────────────────────────────
const server = http.createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('gamedoc collab server: ok');
});

const wss = new WebSocketServer({ noServer: true });
wss.on('connection', setupWSConnection);

server.on('upgrade', (req, socket, head) => {
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
});

server.listen(PORT, HOST, () => {
  console.log(`[collab] Yjs relay on ws://${HOST}:${PORT}  (LevelDB: ${DB_DIR})`);
});
