// Yjs peer client for writing to an *existing* page's live collab room —
// the only safe way to change a page's title/body once it's ever been opened
// (see mcp/src/data.ts's mode-switch comment for why REST/file writes are
// unsafe once a room exists). Mirrors the connect → wait-for-sync → transact
// → wait-for-write-back → disconnect shape already proven in
// scripts/fix-dupe-order.mjs, but drives the app's own real mutation helpers
// (yReconcileBlocks / ySetTitle) instead of hand-rolling Y.Doc edits, so a
// remote agent edit merges with concurrent human typing exactly the way two
// browser tabs merge with each other.
//
// yjs/y-websocket/ws are loaded via createRequire (forcing their CJS build)
// instead of a normal ESM `import`, even though this file is itself ESM
// (mcp/package.json has "type":"module"). Reason: yjs's package.json maps
// "import" and "require" to two DIFFERENT physical files
// (dist/yjs.mjs vs dist/yjs.cjs) — a real dual-package hazard, not a
// theoretical one. src/lib/docs/ydoc.ts (which this file calls into,
// unavoidably, to reuse the app's real CRDT merge logic) lives in the root
// project, which has no "type":"module" in its package.json, so Node/tsx
// load it as CommonJS — meaning it resolves yjs via the "require" condition.
// If this file used a normal ESM `import * as Y from 'yjs'`, it would get
// the *other* file (dist/yjs.mjs): two separate class hierarchies for
// Y.Doc/Y.Map/etc in the same process, so `instanceof` checks deep inside
// yjs (e.g. YMap.set's typeMapSet) throw "Unexpected content type" the
// moment a Y.Doc built from one copy is handed to a function built against
// the other. Forcing the CJS build here — the same one ydoc.ts gets — keeps
// every Yjs object in this process on one class hierarchy. (Root's
// package.json can't simply become "type":"module" either: its production
// build force-compiles server/index.ts to CJS via esbuild's --format=cjs
// and runs the output with plain `node`, which would break under "module".)
import { createRequire } from 'node:module';

import { parseBody } from '@/lib/docs/blocks';
import { getOrder, ySetTitle, yReconcileBlocks } from '@/lib/docs/ydoc';

const require = createRequire(import.meta.url);
const Y = require('yjs') as typeof import('yjs');
const { WebsocketProvider } = require('y-websocket') as typeof import('y-websocket');
const WS = require('ws') as typeof import('ws');

const SYNC_TIMEOUT_MS = 8000;
// Margin over collab-core.ts's 700ms debounced write-back to content.json —
// same constant fix-dupe-order.mjs uses for the identical reason.
const WRITEBACK_WAIT_MS = 2500;
// WebsocketProvider's 'sync' event fires on the first SyncStep2 message, but
// that does NOT guarantee the room's full state has actually landed in this
// doc yet — confirmed empirically: connecting to a room that another peer
// connection (e.g. an immediately-prior writeDocViaCollab call to the same
// docId) touched moments earlier can see 'sync' fire while getOrder(doc) is
// still transiently empty or partial, with the rest of the state arriving
// shortly after. Acting on doc state immediately at 'sync' — reading it in
// peekCollabRoom, or reconciling against it in writeDocViaCollab — risks a
// stale-base diff: yReconcileBlocks would see 0 existing blocks, so it
// inserts the target ids without deleting anything, and the *real* prior
// blocks that arrive moments later merge back in as CRDT-legitimate extra
// order entries — silently doubled/undeleted blocks, not a crash. Waiting
// this long after 'sync' before touching doc state gives the rest of the
// sync time to land first.
const SYNC_SETTLE_MS = 500;

export type CollabPatch = { title?: string; body?: string };

function connect(collabUrl: string, docId: string): { doc: InstanceType<typeof Y.Doc>; provider: InstanceType<typeof WebsocketProvider> } {
  const doc = new Y.Doc();
  const provider = new WebsocketProvider(collabUrl, docId, doc, {
    WebSocketPolyfill: WS as unknown as typeof WebSocket,
  });
  return { doc, provider };
}

/**
 * Apply `patch` to an existing page's live Yjs room and wait for the relay's
 * debounced write-back to content.json. Throws (never silently no-ops) on a
 * connection error or if the room never syncs within SYNC_TIMEOUT_MS — a
 * remote write that can't be confirmed must fail loudly, not report success.
 */
export function writeDocViaCollab(collabUrl: string, docId: string, patch: CollabPatch): Promise<void> {
  return new Promise((resolve, reject) => {
    const { doc, provider } = connect(collabUrl, docId);
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      provider.destroy();
      doc.destroy();
      fn();
    };
    provider.on('sync', (synced: boolean) => {
      if (!synced) return;
      setTimeout(() => {
        if (patch.title !== undefined) ySetTitle(doc, patch.title);
        if (patch.body !== undefined) yReconcileBlocks(doc, parseBody(patch.body));
        setTimeout(() => settle(resolve), WRITEBACK_WAIT_MS);
      }, SYNC_SETTLE_MS);
    });
    provider.on('connection-error', (event: unknown) => {
      settle(() => reject(new Error(`gamedoc-live: collab connection error for "${docId}": ${String(event)}`)));
    });
    setTimeout(() => {
      settle(() => reject(new Error(`gamedoc-live: sync timeout waiting for room "${docId}" (${SYNC_TIMEOUT_MS}ms)`)));
    }, SYNC_TIMEOUT_MS);
  });
}

/**
 * Non-mutating peek at a room's block count, used to warn (never block) a
 * delete of a page whose live room has content. Resolves to null instead of
 * throwing on sync timeout — a peek that can't complete just means "unknown",
 * it shouldn't fail the delete it's advising.
 */
export function peekCollabRoom(collabUrl: string, docId: string): Promise<{ blockCount: number } | null> {
  return new Promise((resolve) => {
    const { doc, provider } = connect(collabUrl, docId);
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      provider.destroy();
      doc.destroy();
      fn();
    };
    provider.on('sync', (synced: boolean) => {
      if (!synced) return;
      setTimeout(() => {
        // Read the block count *before* settle() destroys doc — destroying
        // first and reading through a closure after (the original shape of
        // this code) silently returns 0 for every room, since a destroyed
        // Y.Doc's getArray() no longer reflects real content.
        const blockCount = getOrder(doc).length;
        settle(() => resolve({ blockCount }));
      }, SYNC_SETTLE_MS);
    });
    provider.on('connection-error', () => settle(() => resolve(null)));
    setTimeout(() => settle(() => resolve(null)), SYNC_TIMEOUT_MS);
  });
}
