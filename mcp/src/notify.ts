// Live-edit notifier: tells the running website that this MCP is editing docs,
// so open pages can show an "AI agent is editing" banner and update in real time.
//
// Everything here is best-effort and fire-and-forget — if the website isn't
// running, notifications fail silently and doc writes still succeed. The app's
// /api/agent/events endpoint validates and fans these out to browser tabs over
// SSE. See src/lib/agent/bus.ts.

import type { DocNode } from './data.js';

const APP_URL = (process.env.GAMEDOC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const AGENT_LABEL = process.env.GAMEDOC_AGENT_LABEL ?? 'AI Agent';
const AGENT_TOKEN = process.env.GAMEDOC_AGENT_TOKEN;

// Docs this process has touched, so we can send a clean edit.stop for each on
// shutdown. The website also TTL-expires presence as a fallback if we're killed
// before this runs.
const touched = new Set<string>();

type Payload =
  | { type: 'edit.start'; docId: string; agent: string }
  | { type: 'edit.commit'; action: 'created' | 'updated' | 'deleted'; docId: string; doc?: DocNode; agent: string }
  | { type: 'edit.stop'; docId: string; agent: string };

async function post(payload: Payload): Promise<void> {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (AGENT_TOKEN) headers.Authorization = `Bearer ${AGENT_TOKEN}`;
    await fetch(`${APP_URL}/api/agent/events`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      // Don't let a hung dev server stall an MCP tool call.
      signal: AbortSignal.timeout(1500),
    });
  } catch {
    // App not running / unreachable — non-fatal by design.
  }
}

/** Signal that the agent has begun editing a page (shows the live banner). */
export function notifyStart(docId: string): Promise<void> {
  touched.add(docId);
  return post({ type: 'edit.start', docId, agent: AGENT_LABEL });
}

/** Push a committed change so open tabs update live. `doc` omitted for deletes. */
export function notifyCommit(action: 'created' | 'updated' | 'deleted', docId: string, doc?: DocNode): Promise<void> {
  if (action === 'deleted') touched.delete(docId);
  else touched.add(docId);
  return post({ type: 'edit.commit', action, docId, doc, agent: AGENT_LABEL });
}

let stopHooked = false;

/** Register process-exit handlers that clear presence for every touched doc. */
export function installStopOnExit(): void {
  if (stopHooked) return;
  stopHooked = true;
  const flush = () => {
    for (const docId of touched) {
      // Best-effort beacon; we can't await during a synchronous exit.
      void post({ type: 'edit.stop', docId, agent: AGENT_LABEL });
    }
  };
  process.once('SIGINT', () => { flush(); process.exit(0); });
  process.once('SIGTERM', () => { flush(); process.exit(0); });
  process.once('beforeExit', flush);
}
