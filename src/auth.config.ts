import type { NextAuthConfig } from 'next-auth';
import Google from 'next-auth/providers/google';
import GitHub from 'next-auth/providers/github';

// Providers/callbacks only — no adapter, so this is safe to import from Edge
// middleware (src/middleware.ts) as well as the full Node config (src/auth.ts).
// Google/GitHub credentials are picked up automatically by Auth.js's own
// AUTH_GOOGLE_ID/AUTH_GOOGLE_SECRET + AUTH_GITHUB_ID/AUTH_GITHUB_SECRET env
// var convention (bare provider references, not called) — see
// node_modules/@auth/core/lib/utils/env.js's setEnvDefaults.
//
// The Nodemailer (magic-link email) provider deliberately does NOT live here
// — it pulls in the `nodemailer` package, which imports Node's `stream`/`net`/
// `tls` and crashes the Edge middleware bundle ("The edge runtime does not
// support Node.js 'stream' module") the moment this config is imported there.
// It's added only in src/auth.ts's Node-only full config.
export default {
  providers: [Google, GitHub],
  // Distinct from AUTH_SECRET (which the pre-existing site-password gate
  // reads in src/lib/auth/session.ts) — always set explicitly so Auth.js
  // never falls back to reading that other var itself.
  secret: process.env.GAMEDOC_ACCOUNTS_SECRET,
  // Railway terminates TLS at its proxy and forwards requests to the Next.js
  // process with an X-Forwarded-Host that doesn't match the bare upstream
  // host. Auth.js v5 distrusts forwarded hosts by default and would reject
  // the internal auth request built by signIn('nodemailer', …) — blocking
  // all email magic-link dispatch — so trust the forwarded host explicitly.
  trustHost: true,
  session: { strategy: 'jwt' },
  callbacks: {
    jwt({ token, user }) {
      if (user) token.sub = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.sub && session.user) session.user.id = token.sub;
      return session;
    },
  },
} satisfies NextAuthConfig;
