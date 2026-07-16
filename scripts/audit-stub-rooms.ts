/**
 * audit-stub-rooms.ts
 * Run: npx tsx scripts/audit-stub-rooms.ts [--repair] [--room <docId> ...]
 *
 * Finds pages whose live Yjs room is an editor-birthed stub (see
 * isYDocEffectivelyEmpty in src/lib/docs/ydoc.ts) while the JSON store holds a
 * real, non-empty body for the same page. This happens when a page's room was
 * first opened before its body ever reached the store: the editor inserts one
 * empty paragraph and persists that to LevelDB, and a body written later via
 * REST/curl never touches the room — it's permanently shadowed. Left alone,
 * the shadow gets *worse*: if anyone types on the blank page, the relay's
 * debounced write-back overwrites the good JSON body with the stub.
 *
 * `server/collab-core.ts`'s bindState now self-heals this shape on every
 * fresh room bind (a Railway restart rebinds every room), but that only fires
 * on deploy/restart — this script finds (and, with --repair, fixes live)
 * shadowed rooms immediately, without waiting on a deploy.
 *
 * Auth: REST reads use GAMEDOC_AGENT_TOKEN (Bearer). The collab WebSocket
 * accepts the same token as a `?agent=` query param (see
 * server/collab-core.ts's agent-secret bypass) — cross-origin scripts can't
 * rely on a browser's same-origin session cookie, so this is the only path
 * that works here.
 *
 * Env:
 *   GAMEDOC_LIVE_URL     base URL (default https://gamedoc-production.up.railway.app)
 *   GAMEDOC_AGENT_TOKEN  Bearer token for REST + WS ?agent= param
 */
import WS from 'ws';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { parseBody } from '../src/lib/docs/blocks';
import {
  blocksAreEffectivelyEmpty,
  isYDocEffectivelyEmpty,
  readDocBlocks,
  ySetTitle,
  yReconcileBlocks,
} from '../src/lib/docs/ydoc';
import { DocCollectionSchema, type DocNode } from '../src/lib/schema/doc';

const SITE_URL = (process.env.GAMEDOC_LIVE_URL || 'https://gamedoc-production.up.railway.app').replace(/\/$/, '');
const COLLAB_URL = `${SITE_URL.replace(/^http/, 'ws')}/collab`;
const AGENT_TOKEN = process.env.GAMEDOC_AGENT_TOKEN;

const args = process.argv.slice(2);
const REPAIR = args.includes('--repair');
const roomFilter = (() => {
  const i = args.indexOf('--room');
  return i === -1 ? null : new Set(args.slice(i + 1).filter((a) => !a.startsWith('--')));
})();

const SYNC_TIMEOUT_MS = 8000;
// Same margin over collab-core.ts's 700ms debounced write-back that
// fix-dupe-order.mjs and mcp/src/collab.ts use, for the same reason.
const WRITEBACK_WAIT_MS = 2500;
const SYNC_SETTLE_MS = 500;

async function fetchDocs(): Promise<DocNode[]> {
  const res = await fetch(`${SITE_URL}/api/docs`, {
    headers: AGENT_TOKEN ? { Authorization: `Bearer ${AGENT_TOKEN}` } : {},
  });
  if (!res.ok) throw new Error(`GET /api/docs -> ${res.status}`);
  return DocCollectionSchema.parse(await res.json());
}

type Finding = { id: string; title: string; roomBlocks: number; targetBlocks: number };

function auditRoom(
  node: DocNode,
  targetBlocks: ReturnType<typeof parseBody>,
): Promise<{ finding: Finding | null; repaired: boolean; error?: string }> {
  return new Promise((resolve) => {
    const doc = new Y.Doc();
    const provider = new WebsocketProvider(COLLAB_URL, node.id, doc, {
      WebSocketPolyfill: WS as unknown as typeof WebSocket,
      params: AGENT_TOKEN ? { agent: AGENT_TOKEN } : {},
    });
    let settled = false;
    const settle = (result: { finding: Finding | null; repaired: boolean; error?: string }) => {
      if (settled) return;
      settled = true;
      provider.destroy();
      doc.destroy();
      resolve(result);
    };
    provider.on('sync', (synced: boolean) => {
      if (!synced) return;
      setTimeout(() => {
        // targetBlocks is already known non-empty (candidates are pre-filtered
        // by blocksAreEffectivelyEmpty), so a shadow is just an empty room.
        const shadowed = isYDocEffectivelyEmpty(doc);
        if (!shadowed) {
          settle({ finding: null, repaired: false });
          return;
        }
        const finding: Finding = {
          id: node.id,
          title: node.title,
          roomBlocks: readDocBlocks(doc).length,
          targetBlocks: targetBlocks.length,
        };
        if (!REPAIR) {
          settle({ finding, repaired: false });
          return;
        }
        doc.transact(() => {
          yReconcileBlocks(doc, targetBlocks);
          if (node.title) ySetTitle(doc, node.title);
        });
        setTimeout(() => settle({ finding, repaired: true }), WRITEBACK_WAIT_MS);
      }, SYNC_SETTLE_MS);
    });
    provider.on('connection-error', (event: unknown) => {
      settle({ finding: null, repaired: false, error: `connection-error: ${String(event)}` });
    });
    setTimeout(() => settle({ finding: null, repaired: false, error: 'sync-timeout' }), SYNC_TIMEOUT_MS);
  });
}

async function main() {
  if (!AGENT_TOKEN) {
    console.warn('⚠ No GAMEDOC_AGENT_TOKEN — proceeding unauthenticated (will fail against a live deploy).');
  }

  const docs = await fetchDocs();
  const candidates = docs.filter((d) => {
    if (roomFilter && !roomFilter.has(d.id)) return false;
    return !blocksAreEffectivelyEmpty(parseBody(d.body));
  });
  console.log(`Checking ${candidates.length} page(s) with non-empty stored content against their live rooms...\n`);

  const findings: Finding[] = [];
  let repairedCount = 0;
  for (const node of candidates) {
    const target = parseBody(node.body);
    const { finding, repaired, error } = await auditRoom(node, target);
    if (error) {
      console.log(`  ${node.id.padEnd(28)} ERROR ${error}`);
      continue;
    }
    if (finding) {
      findings.push(finding);
      const tag = repaired ? 'REPAIRED' : 'SHADOWED';
      console.log(
        `  ${node.id.padEnd(28)} ${tag}  room had ${finding.roomBlocks} block(s), store has ${finding.targetBlocks} — "${finding.title}"`,
      );
      if (repaired) repairedCount++;
    }
  }

  console.log('');
  if (findings.length === 0) {
    console.log('No shadowed rooms found.');
  } else if (REPAIR) {
    console.log(`${repairedCount}/${findings.length} shadowed room(s) repaired.`);
  } else {
    console.log(`${findings.length} shadowed room(s) found. Re-run with --repair to fix them.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
