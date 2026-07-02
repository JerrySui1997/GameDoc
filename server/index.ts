// ── Production server ──────────────────────────────────────────────────────
// One process serves the built Next app AND the Yjs collab relay (mounted on
// /collab), so a single Railway service — with a single mounted volume — owns
// all mutable state (the JSON collections in DATA_DIR + LevelDB in
// COLLAB_DB_DIR). Browsers reach the relay at wss://<host>/collab; see
// src/components/docs/useYDoc.ts for the same-origin default.

import http from 'http';
import next from 'next';
import { attachCollab } from './collab-core';
import { ensureSeed } from './seed';

const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT || 3000);

async function main(): Promise<void> {
  // Populate a fresh volume before anything reads content.json.
  await ensureSeed();

  const app = next({ dev: false, hostname: HOST, port: PORT });
  const handle = app.getRequestHandler();
  await app.prepare();

  const server = http.createServer((req, res) => {
    handle(req, res);
  });
  attachCollab(server, { path: '/collab' });

  server.listen(PORT, HOST, () => {
    console.log(`[server] Next + collab on http://${HOST}:${PORT}  (collab: /collab)`);
  });
}

main().catch((err) => {
  console.error('[server] fatal:', err);
  process.exit(1);
});
