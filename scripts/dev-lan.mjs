// Launches `next dev` bound to 0.0.0.0 with NEXT_PUBLIC_COLLAB_URL pointed at
// this machine's own LAN IP, so testing from a phone/other device against the
// local collab relay (`npm run dev:collab`) never requires hand-editing
// .env.local — just run `npm run dev:lan` (or `dev:lan:all` to also bring the
// relay up). See src/components/docs/useYDoc.ts for why the override exists.
import { networkInterfaces } from 'node:os';
import { spawn } from 'node:child_process';

function lanIp() {
  for (const ifaces of Object.values(networkInterfaces())) {
    for (const iface of ifaces ?? []) {
      if (iface.family === 'IPv4' && !iface.internal && !iface.address.startsWith('169.254.')) {
        return iface.address;
      }
    }
  }
  return null;
}

const ip = lanIp();
if (!ip) {
  console.error('[dev:lan] No LAN IPv4 address found — connect to a network and retry.');
  process.exit(1);
}

const collabPort = process.env.COLLAB_PORT || 1234;
const collabUrl = `ws://${ip}:${collabPort}`;
console.log(`[dev:lan] App:    http://${ip}:3000`);
console.log(`[dev:lan] Collab: ${collabUrl}`);

const child = spawn('next dev --turbopack -H 0.0.0.0', {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, NEXT_PUBLIC_COLLAB_URL: collabUrl },
});

child.on('exit', (code) => process.exit(code ?? 0));
