// ── Collaboration core ─────────────────────────────────────────────────────
// Shared Yjs relay wiring: LevelDB durability, content.json seed + write-back,
// and WebSocket upgrade handling. Used two ways:
//   • server/collab.ts  — standalone relay process (dev, on its own port)
//   • server/index.ts    — production server, mounted on /collab beside Next
//
// Each editable page is one Yjs room keyed by the doc id. Two persistence
// concerns: (1) CRDT durability across restarts (LevelDB), and (2) content.json
// stays the canonical format for SSR/search/scripts — we seed a room from it on
// first open and debounce-serialize edits back.

import os from 'os';
import path from 'path';
import type { Server } from 'http';
import { WebSocketServer } from 'ws';
// y-websocket@1.5's bundled server utils (CJS) — the proven yjs-13 relay, paired
// with y-leveldb. Deep import is allowed via the package's exports map.
import { setupWSConnection, setPersistence } from 'y-websocket/bin/utils';
import * as Y from 'yjs';
import { LeveldbPersistence } from 'y-leveldb';
import { readDocs, writeDocs } from '@/lib/docs/store';
import { isYDocEmpty, readTitle, seedYDoc, serializeYDoc } from '@/lib/docs/ydoc';
import { AUTH_COOKIE, authEnabled, parseCookies, safeEqual, sessionToken } from '@/lib/auth/session';

// Store the LevelDB outside the project root so Turbopack's directory scanner
// never hits the LevelDB LOCK file (which it can't read, causing a fatal panic).
const DB_DIR = process.env.COLLAB_DB_DIR || path.join(os.homedir(), '.gamedoc', 'collab-db');
const WRITE_DEBOUNCE_MS = 700; // match the editor's old autosave feel

/** The resolved LevelDB directory (handy for startup logging). */
export function collabDbDir(): string {
  return DB_DIR;
}

// ── content.json write-back, globally serialized ───────────────────────────
// Every room's write-back is a read-modify-write of the single content.json
// collection. Chaining them through one promise queue (this process owns the
// file) means two rooms saving at once can never clobber each other's node.
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
// y-websocket keeps a single global persistence provider, so install it once.
let persistenceInstalled = false;

function installCollabPersistence(): void {
  if (persistenceInstalled) return;
  persistenceInstalled = true;
  const ldb = new LeveldbPersistence(DB_DIR);
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
        // Skip our own seed/load transactions — no user intent, already on disk.
        if (origin === 'load' || origin === 'seed') return;
        persistToContentJson(docName, ydoc);
      });
    },
    writeState: async (docName, ydoc) => {
      // Connection drained: flush a final snapshot to LevelDB.
      await ldb.storeUpdate(docName, Y.encodeStateAsUpdate(ydoc));
    },
  });
}

// ── WebSocket wiring ────────────────────────────────────────────────────────
// Attach the Yjs relay to an existing HTTP server. When `path` is given (the
// production server shares one port with Next), only upgrades under that prefix
// are handled — the prefix is stripped so the remainder is the room name — and
// other upgrades are rejected. With no prefix (the standalone dev relay) every
// upgrade is a collab connection.
export function attachCollab(server: Server, opts: { path?: string } = {}): void {
  const prefix = opts.path ?? '';
  installCollabPersistence();

  const wss = new WebSocketServer({ noServer: true });
  wss.on('connection', setupWSConnection);

  server.on('upgrade', (req, socket, head) => {
    const url = req.url || '/';
    if (prefix) {
      const matches =
        url === prefix || url.startsWith(`${prefix}/`) || url.startsWith(`${prefix}?`);
      if (!matches) {
        socket.destroy();
        return;
      }
      // Strip the prefix so setupWSConnection derives the room from the rest.
      req.url = url.slice(prefix.length) || '/';
    }

    const accept = () =>
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));

    // Same site-password gate as the HTTP surfaces. Same-origin browsers send
    // the gd_session cookie on the WS handshake, so live editing needs the
    // password too. Only enforced when the gate is on (SITE_PASSWORD set), so
    // the standalone dev relay stays open.
    if (!authEnabled()) {
      accept();
      return;
    }
    void (async () => {
      try {
        const cookies = parseCookies(req.headers.cookie);
        if (safeEqual(cookies[AUTH_COOKIE], await sessionToken())) {
          accept();
        } else {
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
        }
      } catch {
        socket.destroy();
      }
    })();
  });
}
