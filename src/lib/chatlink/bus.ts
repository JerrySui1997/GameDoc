import type { ChatLinkEvent, ChatSessionMeta, ChatTurn } from '@/lib/chatlink/types';

// ── Chat-link bus ───────────────────────────────────────────────────────────
// In-process pub/sub + snapshot store for live-linked AI chat sessions
// (VS Code Copilot, later Claude Code). Modeled on src/lib/agent/bus.ts, but
// everything is keyed by userId: each person runs their own local
// chat-bridge, paired to their account via a device token
// (src/lib/chatlink/deviceToken.ts), so one user's chats never leak into
// another's /app/sessions view on the shared live server.
//
// Browsers don't need an initial snapshot pushed over SSE — they GET
// /api/chatlink/sessions (and /sessions/[id] for a transcript) on load, then
// use the stream purely for live deltas.

type Client = (message: ChatLinkEvent) => void;

type UserStore = {
  clients: Set<Client>;
  sessions: Map<string, ChatSessionMeta>;
  transcripts: Map<string, ChatTurn[]>;
};

class ChatLinkBus {
  private users = new Map<string, UserStore>();

  private storeFor(userId: string): UserStore {
    let store = this.users.get(userId);
    if (!store) {
      store = { clients: new Set(), sessions: new Map(), transcripts: new Map() };
      this.users.set(userId, store);
    }
    return store;
  }

  subscribe(userId: string, client: Client): () => void {
    const store = this.storeFor(userId);
    store.clients.add(client);
    return () => {
      store.clients.delete(client);
    };
  }

  publish(userId: string, event: ChatLinkEvent): void {
    const store = this.storeFor(userId);
    switch (event.type) {
      case 'session.upsert':
        store.sessions.set(event.session.id, event.session);
        break;
      case 'session.remove':
        store.sessions.delete(event.sessionId);
        store.transcripts.delete(event.sessionId);
        break;
      case 'transcript.snapshot':
        store.transcripts.set(event.sessionId, event.turns);
        break;
      case 'transcript.append':
        store.transcripts.set(event.sessionId, [...(store.transcripts.get(event.sessionId) ?? []), ...event.turns]);
        break;
    }
    for (const client of store.clients) {
      try {
        client(event);
      } catch {
        // A wedged client must never block the others; it'll be cleaned up on
        // its stream's cancel().
      }
    }
  }

  listSessions(userId: string): ChatSessionMeta[] {
    return [...this.storeFor(userId).sessions.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  getTranscript(userId: string, sessionId: string): ChatTurn[] | undefined {
    return this.storeFor(userId).transcripts.get(sessionId);
  }
}

// Stash on globalThis so the singleton survives dev HMR module re-evaluation;
// otherwise an edit to this file would orphan live SSE clients on the old instance.
const globalForBus = globalThis as unknown as { __gamedocChatLinkBus?: ChatLinkBus };

export function chatBus(): ChatLinkBus {
  return (globalForBus.__gamedocChatLinkBus ??= new ChatLinkBus());
}
