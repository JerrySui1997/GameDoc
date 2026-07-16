// Headless self-test for the auth config (src/auth.config.ts). No test runner
// is installed, so — like validate / crossref / hexel-test — this runs under
// tsx:
//   npm run auth-test     (or:  tsx scripts/auth-selftest.ts)
// Guards the Railway forwarded-host fix: Auth.js v5 rejects signIn's internal
// auth request when the forwarded host isn't trusted, which silently blocks
// all email magic-link dispatch. trustHost must stay true in production.
// Exits non-zero on the first failure.

import assert from 'node:assert/strict';

import authConfig from '../src/auth.config';

assert.equal(
  authConfig.trustHost,
  true,
  'authConfig.trustHost must be true so Auth.js v5 trusts Railway\'s ' +
    'X-Forwarded-Host; without it signIn(\'nodemailer\', …) rejects the ' +
    'internal auth request and no magic-link email is ever dispatched.'
);

// The Edge-safe config is spread verbatim into both the full Node config
// (src/auth.ts) and the middleware instance (src/middleware.ts), so this one
// literal covers every Auth.js entry point. Confirm the shape is stable.
assert.ok(
  Array.isArray(authConfig.providers),
  'authConfig.providers must be an array (sanity check on config shape)'
);

console.log('auth-selftest: OK (trustHost === true)');
