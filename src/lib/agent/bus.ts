import type { DocNode } from '@/lib/schema/doc';

// ── Agent live-edit bus ────────────────────────────────────────────────────
// An in-process pub/sub that bridges out-of-band doc writes (from the MCP
// server) to every connected browser via SSE. The MCP POSTs events to
// /api/agent/events, which calls publish(); each open tab holds an SSE stream
// from /api/agent/stream, which calls subscribe(). Next dev runs a single Node
// process, so route handlers share this module-level singleton.
//
// Presence ("an AI agent is editing this page") is tracked here with a TTL: a
// clean MCP shutdown sends edit.stop to clear immediately, and a TTL sweep is
// the fallback if the process is killed before it can. See PRESENCE_TTL_MS.

export type AgentEvent =
  | { type: 'edit.start'; docId: string; agent: string }
  | { type: 'edit.commit'; action: 'created' | 'updated' | 'deleted'; docId: string; doc?: DocNode; agent: string }
  | { type: 'edit.stop'; docId: string; agent: string };

/** One active editing presence, flattened for the wire. */
export type PresenceEntry = { docId: string; agent: string };

/** Snapshot sent to a client the moment it connects. */
export type PresenceSnapshot = { type: 'presence'; editing: PresenceEntry[] };

/** A structural change to the docs tree (create/delete/reparent) made via REST by
 *  any client — tells every open tab to refetch the tree. Carries no presence. */
export type TreeChanged = { type: 'tree.changed' };

export type ServerMessage = AgentEvent | PresenceSnapshot | TreeChanged;

type Client = (message: ServerMessage) => void;

// Presence older than this with no refreshing edit is auto-cleared, so a hard
// MCP crash can't leave a stuck "editing" banner. Sweep runs a few times within
// each window. A burst of edits keeps refreshing the timestamp, so the banner
// stays lit through an active session and fades a few seconds after the last edit.
const PRESENCE_TTL_MS = 12_000;
const SWEEP_INTERVAL_MS = 3_000;

class AgentBus {
  private clients = new Set<Client>();
  private presence = new Map<string, { agent: string; ts: number }>();
  private sweeper: ReturnType<typeof setInterval> | null = null;

  /** Register an SSE client; returns an unsubscribe fn. Sends a presence snapshot. */
  subscribe(client: Client): () => void {
    this.clients.add(client);
    client({ type: 'presence', editing: this.snapshot() });
    this.ensureSweeper();
    return () => {
      this.clients.delete(client);
    };
  }

  /** Record presence side-effects, then fan the event out to every client. */
  publish(event: AgentEvent): void {
    const now = Date.now();
    if (event.type === 'edit.start' || event.type === 'edit.commit') {
      this.presence.set(event.docId, { agent: event.agent, ts: now });
    } else if (event.type === 'edit.stop') {
      this.presence.delete(event.docId);
    }
    this.broadcast(event);
  }

  /** Broadcast a docs-tree change to every client (no presence side effects). */
  notifyTreeChanged(): void {
    this.broadcast({ type: 'tree.changed' });
  }

  private snapshot(): PresenceEntry[] {
    return [...this.presence].map(([docId, v]) => ({ docId, agent: v.agent }));
  }

  private broadcast(message: ServerMessage): void {
    for (const client of this.clients) {
      try {
        client(message);
      } catch {
        // A wedged client must never block the others; it'll be cleaned up on
        // its stream's cancel().
      }
    }
  }

  private ensureSweeper(): void {
    if (this.sweeper) return;
    this.sweeper = setInterval(() => {
      const now = Date.now();
      for (const [docId, v] of this.presence) {
        if (now - v.ts > PRESENCE_TTL_MS) {
          this.presence.delete(docId);
          this.broadcast({ type: 'edit.stop', docId, agent: v.agent });
        }
      }
      // Idle: nothing connected and no presence to expire — stop the timer.
      if (this.clients.size === 0 && this.presence.size === 0) {
        if (this.sweeper) clearInterval(this.sweeper);
        this.sweeper = null;
      }
    }, SWEEP_INTERVAL_MS);
    // Don't keep the process alive just for the sweep.
    this.sweeper.unref?.();
  }
}

// Stash on globalThis so the singleton survives dev HMR module re-evaluation;
// otherwise an edit to this file would orphan live SSE clients on the old instance.
const globalForBus = globalThis as unknown as { __gamedocAgentBus?: AgentBus };

export function agentBus(): AgentBus {
  return (globalForBus.__gamedocAgentBus ??= new AgentBus());
}
