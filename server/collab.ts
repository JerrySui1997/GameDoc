// ── Collaboration relay (standalone) ───────────────────────────────────────
// The dev-time Yjs WebSocket relay on its own port. Next.js under Turbopack
// can't host a long-lived WebSocket, so this runs alongside it (see `dev:all`).
// Production instead mounts the same relay on /collab via server/index.ts, so
// all shared state lives behind one process and one volume. The wiring lives in
// server/collab-core.ts; this file is just the standalone HTTP host.

import './load-env';
import http from 'http';
import { attachCollab, collabDbDir } from './collab-core';

const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.COLLAB_PORT || 1234);

const server = http.createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('gamedoc collab server: ok');
});

// No path prefix: as a dedicated relay, every upgrade is a collab connection.
attachCollab(server);

server.listen(PORT, HOST, () => {
  console.log(`[collab] Yjs relay on ws://${HOST}:${PORT}  (LevelDB: ${collabDbDir()})`);
});
