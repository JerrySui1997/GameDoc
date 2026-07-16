// QA helper: runs `next dev` on localhost with NEXT_PUBLIC_COLLAB_URL pointed at
// the local relay via `localhost` (not the LAN IP). Keeps page origin and relay
// host identical so session cookies (host-scoped) reach the WS upgrade request —
// unlike dev:lan, which intentionally uses the LAN IP for cross-device testing
// and therefore can't carry a localhost-scoped cookie to the relay.
import { spawn } from 'node:child_process';

const collabPort = process.env.COLLAB_PORT || 1234;
const collabUrl = `ws://localhost:${collabPort}`;
console.log(`[dev:local-collab] App:    http://localhost:3000`);
console.log(`[dev:local-collab] Collab: ${collabUrl}`);

const child = spawn('next dev --turbopack', {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, NEXT_PUBLIC_COLLAB_URL: collabUrl },
});

child.on('exit', (code) => process.exit(code ?? 0));
