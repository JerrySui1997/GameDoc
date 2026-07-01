// Type shims for the collab relay's untyped deps. y-websocket ships its server
// helper as plain JS under bin/, and y-leveldb's published types don't resolve
// under "bundler" moduleResolution — so we declare the small surface we use.

declare module 'y-websocket/bin/utils' {
  import type * as Y from 'yjs';
  import type { WebSocket } from 'ws';
  import type { IncomingMessage } from 'http';

  export function setupWSConnection(
    conn: WebSocket,
    req: IncomingMessage,
    opts?: { docName?: string; gc?: boolean },
  ): void;

  export interface Persistence {
    bindState: (docName: string, ydoc: Y.Doc) => void | Promise<void>;
    writeState: (docName: string, ydoc: Y.Doc) => Promise<void>;
    provider: unknown;
  }

  export function setPersistence(persistence: Persistence | null): void;
  export function getPersistence(): Persistence | null;
}

declare module 'y-leveldb' {
  import type * as Y from 'yjs';

  export class LeveldbPersistence {
    constructor(location: string, opts?: Record<string, unknown>);
    getYDoc(docName: string): Promise<Y.Doc>;
    storeUpdate(docName: string, update: Uint8Array): Promise<void>;
    clearDocument(docName: string): Promise<void>;
    flushDocument(docName: string): Promise<void>;
  }
}
