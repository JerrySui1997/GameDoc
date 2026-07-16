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
import { canAccess } from '@/lib/workspaces/access';
import {
  blocksAreEffectivelyEmpty,
  isYDocEffectivelyEmpty,
  isYDocEmpty,
  readTitle,
  seedYDoc,
  serializeYDoc,
  yReconcileBlocks,
  ySetTitle,
} from '@/lib/docs/ydoc';
import { parseBody } from '@/lib/docs/blocks';
import { safeEqual } from '@/lib/auth/session';
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
// Three room-name shapes (plans/06-multi-workspace-dashboard.md Phase 3): a
// personal space is `user:{userId}:{docId}`; a custom workspace is
// `ws:{workspaceId}:{docId}`; every other room name is the legacy/flagship
// (owner) doc id, unchanged. DocNodeSchema's id regex
// (^[a-z0-9]+(?:-[a-z0-9]+)*$) structurally forbids colons, and both user ids
// and workspace ids (Auth.js UUIDs, or crypto.randomUUID() for custom
// workspaces) are colon-free, so all three cases are unambiguous.
const PERSONAL_ROOM_RE = /^user:([^:]+):(.+)$/;
const WORKSPACE_ROOM_RE = /^ws:([^:]+):(.+)$/;

function parseRoom(roomName: string): { docId: string; userId?: string; workspaceId?: string } {
  const personal = PERSONAL_ROOM_RE.exec(roomName);
  if (personal) return { docId: personal[2], userId: personal[1] };
  const custom = WORKSPACE_ROOM_RE.exec(roomName);
  if (custom) return { docId: custom[2], workspaceId: custom[1] };
  return { docId: roomName };
}

function storeScope(parsed: { userId?: string; workspaceId?: string }): DocsScope {
  if (parsed.userId) return { userId: parsed.userId };
  if (parsed.workspaceId) return { workspaceId: parsed.workspaceId };
  return undefined;
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
      const parsed = parseRoom(roomName);
      const { docId } = parsed;
      const scope = storeScope(parsed);
      const queueKey = parsed.userId
        ? `user:${parsed.userId}`
        : parsed.workspaceId
          ? `ws:${parsed.workspaceId}`
          : 'legacy';
      void enqueue(queueKey, async () => {
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
      //    per-user equivalent) node. If the room instead holds an
      //    editor-birthed stub (no widgets, all-empty prose — see
      //    isYDocEffectivelyEmpty's doc comment) and the store has since
      //    gained a real, non-empty body for it, reconcile the stub up to
      //    that body rather than leaving it to shadow the store forever.
      // Both branches transact under 'seed' origin, so this doesn't trip the
      // update listener's write-back below (step 3) — no-op by construction
      // when room and store already agree.
      if (isYDocEmpty(ydoc)) {
        try {
          const parsed = parseRoom(docName);
          const node = (await readDocs(storeScope(parsed))).find((d) => d.id === parsed.docId);
          if (node) seedYDoc(ydoc, node.body, node.title);
        } catch (err) {
          console.error(`[collab] seed failed for "${docName}":`, err);
        }
      } else if (isYDocEffectivelyEmpty(ydoc)) {
        try {
          const parsed = parseRoom(docName);
          const node = (await readDocs(storeScope(parsed))).find((d) => d.id === parsed.docId);
          const target = node ? parseBody(node.body) : [];
          if (!blocksAreEffectivelyEmpty(target)) {
            ydoc.transact(() => {
              yReconcileBlocks(ydoc, target);
              if (node?.title) ySetTitle(ydoc, node.title);
            }, 'seed');
          }
        } catch (err) {
          console.error(`[collab] stub-reconcile failed for "${docName}":`, err);
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
    const { userId, workspaceId } = parseRoom(roomName);

    // Cross-origin clients (a localhost dev browser pointed at the live relay,
    // scripts, proxies) can never present the same-origin session cookie.
    // Accept the shared agent secret instead — as an Authorization header
    // where the client can set one, or as an ?agent= query param since
    // browsers can't set headers on a WS handshake. Same secret that gates
    // the mutation REST routes (src/lib/auth/agentToken.ts); no-op when
    // GAMEDOC_AGENT_TOKEN isn't configured. Legacy (flagship) rooms only —
    // never lets a bearer-token holder into a *personal* or *custom-workspace*
    // room, which would blow the per-room access checks below wide open.
    const agentSecret = process.env.GAMEDOC_AGENT_TOKEN;
    if (agentSecret && !userId && !workspaceId) {
      const [scheme, bearer] = (req.headers.authorization ?? '').split(' ');
      const query = new URLSearchParams((req.url ?? '').split('?')[1] ?? '');
      if (
        (scheme === 'Bearer' && safeEqual(bearer, agentSecret)) ||
        safeEqual(query.get('agent'), agentSecret)
      ) {
        accept();
        return;
      }
    }

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

        if (!token?.sub) {
          reject();
          return;
        }

        // Personal-space room: the session's own user id must match the
        // room's {userId} exactly. Without that check, any signed-in user
        // could open ANY other user's room just by guessing/observing its id
        // — this comparison is the entire cross-user isolation boundary for
        // live collab.
        if (userId && token.sub !== userId) {
          reject();
          return;
        }
        // Custom workspace room: real membership check (owner or a resolved
        // editor/viewer row) — this is the first room kind with a live
        // canAccess() gate, since it has no pre-existing sessions to avoid
        // regressing. Legacy (flagship) rooms deliberately still accept any
        // signed-in session rather than canAccess(userId, 'flagship') here:
        // tightening that requires confirming the flagship workspace row
        // (plans/06 Phase 2.2) actually exists and is owned correctly in
        // every deployed environment first, or every editor — including the
        // real owner — locks out until it's seeded. Flip this once that's
        // confirmed in production; tracked in plans/06 Phase 3's QA notes.
        if (workspaceId && !(await canAccess(token.sub, workspaceId, 'viewer'))) {
          reject();
          return;
        }
        accept();
      } catch (err) {
        // Fail closed either way, but never silently — this gate is the
        // entire cross-user isolation boundary, so a bug that makes it throw
        // (e.g. a missing GAMEDOC_ACCOUNTS_SECRET) must be visible, not
        // indistinguishable from a routine rejection.
        console.error(`[collab] auth gate error for room "${roomName}":`, err);
        socket.destroy();
      }
    })();
  });
}
