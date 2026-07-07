// ── Collaboration core ─────────────────────────────────────────────────────
// Shared Yjs relay wiring: LevelDB durability, content.json seed + write-back,
// and WebSocket upgrade handling. Used two ways:
//   • server/collab.ts  — standalone relay process (dev, on its own port)
//   • server/index.ts    — production server, mounted on /collab beside Next
//
// Each editable page is one Yjs room keyed by the doc id — or, for a personal
// space, `user:{userId}:{docId}` (see parseRoom below). Two persistence
// concerns: (1) CRDT durability across restarts (LevelDB), and (2) the
// relevant content.json (owner's or a per-user one) stays the canonical
// format for SSR/search/scripts — we seed a room from it on first open and
// debounce-serialize edits back.

import os from 'os';
import path from 'path';
import type { Server } from 'http';
import { WebSocketServer } from 'ws';
// y-websocket@1.5's bundled server utils (CJS) — the proven yjs-13 relay, paired
// with y-leveldb. Deep import is allowed via the package's exports map.
import { setupWSConnection, setPersistence } from 'y-websocket/bin/utils';
import * as Y from 'yjs';
import { LeveldbPersistence } from 'y-leveldb';
import { getToken } from 'next-auth/jwt';
import { readDocs, writeDocs, type DocsScope } from '@/lib/docs/store';
import { isYDocEmpty, readTitle, seedYDoc, serializeYDoc } from '@/lib/docs/ydoc';
import { AUTH_COOKIE, authEnabled, parseCookies, safeEqual, sessionToken } from '@/lib/auth/session';
import { enqueue } from '@/lib/store/json';

// Store the LevelDB outside the project root so Turbopack's directory scanner
// never hits the LevelDB LOCK file (which it can't read, causing a fatal panic).
const DB_DIR = process.env.COLLAB_DB_DIR || path.join(os.homedir(), '.gamedoc', 'collab-db');
const WRITE_DEBOUNCE_MS = 700; // match the editor's old autosave feel

/** The resolved LevelDB directory (handy for startup logging). */
export function collabDbDir(): string {
  return DB_DIR;
}

// ── Room name → store scope ─────────────────────────────────────────────────
// A personal space's rooms are named `user:{userId}:{docId}`; every other
// room name is a legacy (owner) doc id, unchanged. DocNodeSchema's id regex
// (^[a-z0-9]+(?:-[a-z0-9]+)*$) structurally forbids colons, and Auth.js's
// default user ids are colon-free UUIDs, so this split is unambiguous — a
// legacy id can never be misread as a personal room or vice versa.
const ROOM_RE = /^user:([^:]+):(.+)$/;

function parseRoom(roomName: string): { docId: string; userId?: string } {
  const m = ROOM_RE.exec(roomName);
  return m ? { docId: m[2], userId: m[1] } : { docId: roomName };
}

function storeScope(userId: string | undefined): DocsScope {
  return userId ? { userId } : undefined;
}

// ── content.json write-back, serialized per scope ──────────────────────────
// Every room's write-back is a read-modify-write of one collection file, so
// two rooms under the *same* scope (the owner's two legacy docs, or one
// user's two personal docs) must never save concurrently — reusing the json
// store's own per-key queue chains them so a later read always sees an
// earlier write. Keying by scope rather than one global chain means two
// *different* users' (or the owner's vs. a user's) autosaves touch different
// files and never queue behind each other.
const pendingTimers = new Map<string, NodeJS.Timeout>();

function persistToContentJson(roomName: string, doc: Y.Doc): void {
  const existing = pendingTimers.get(roomName);
  if (existing) clearTimeout(existing);
  pendingTimers.set(
    roomName,
    setTimeout(() => {
      pendingTimers.delete(roomName);
      const body = serializeYDoc(doc);
      const title = readTitle(doc);
      const { docId, userId } = parseRoom(roomName);
      const scope = storeScope(userId);
      void enqueue(userId ? `user:${userId}` : 'legacy', async () => {
        try {
          const docs = await readDocs(scope);
          const idx = docs.findIndex((d) => d.id === docId);
          // Don't resurrect a node deleted out-of-band via the REST API.
          if (idx === -1) return;
          const next = [...docs];
          next[idx] = {
            ...next[idx],
            body,
            title: title && title.trim() ? title : next[idx].title,
          };
          await writeDocs(next, scope);
        } catch (err) {
          console.error(`[collab] write-back failed for "${roomName}":`, err);
        }
      });
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

      // 2. If nothing was persisted, seed from the canonical content.json (or
      //    per-user equivalent) node.
      if (isYDocEmpty(ydoc)) {
        try {
          const { docId, userId } = parseRoom(docName);
          const node = (await readDocs(storeScope(userId))).find((d) => d.id === docId);
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
    const reject = () => {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
    };

    // Same room-name parsing setupWSConnection does internally
    // (req.url.slice(1).split('?')[0]) — done here too so the gate can branch
    // on whether this is a personal-space room before accepting the upgrade.
    const roomName = (req.url || '/').slice(1).split('?')[0];
    const { userId } = parseRoom(roomName);

    if (userId) {
      // Personal-space room — gated by an Auth.js session regardless of the
      // legacy SITE_PASSWORD switch, and the session's own user id must match
      // the room's {userId} exactly. Without that second check, any signed-in
      // user could open ANY other user's room just by guessing/observing its
      // id — this comparison is the entire cross-user isolation boundary for
      // live collab.
      void (async () => {
        try {
          // Best-effort HTTPS detection so the cookie name/salt we look up
          // matches what Auth.js used when it set the session (the
          // __Secure- prefix + secure flag depend on it). Prefer the
          // x-forwarded-proto a reverse proxy (Railway) sets; NODE_ENV is a
          // fallback for direct/local connections. Getting this wrong fails
          // closed (getToken returns null, not a false accept) — but verify
          // it against a real HTTPS deploy, not just local HTTP.
          const forwardedProto = req.headers['x-forwarded-proto'];
          const proto = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
          const secureCookie = proto ? proto === 'https' : process.env.NODE_ENV === 'production';

          const token = await getToken({
            req: { headers: req.headers as unknown as Record<string, string> },
            secret: process.env.GAMEDOC_ACCOUNTS_SECRET,
            secureCookie,
          });
          if (token?.sub === userId) {
            accept();
          } else {
            reject();
          }
        } catch (err) {
          // Fail closed either way, but never silently — this gate is the
          // entire cross-user isolation boundary, so a bug that makes it
          // throw (e.g. a missing GAMEDOC_ACCOUNTS_SECRET) must be visible,
          // not indistinguishable from a routine rejection.
          console.error(`[collab] auth gate error for room "${roomName}":`, err);
          socket.destroy();
        }
      })();
      return;
    }

    // Legacy room — unchanged from before personal spaces existed. Same
    // site-password gate as the HTTP surfaces. Same-origin browsers send the
    // gd_session cookie on the WS handshake, so live editing needs the
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
          reject();
        }
      } catch {
        socket.destroy();
      }
    })();
  });
}
