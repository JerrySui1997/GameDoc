import NextAuth from 'next-auth';
import Nodemailer from 'next-auth/providers/nodemailer';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import authConfig from './auth.config';
import { db } from '@/db/client';
import { users, accounts, sessions, verificationTokens } from '@/db/schema';
import { writeDocs } from '@/lib/docs/store';
import { serializeBlocks, emptyProse } from '@/lib/docs/blocks';

// Node-only: pulls in the Drizzle adapter (native-addon-backed via
// better-sqlite3) and the Nodemailer provider (Node's stream/net/tls), so
// this must never be imported from Edge middleware — src/middleware.ts
// builds its own Edge-safe instance from auth.config.ts alone instead, which
// omits both.
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    ...authConfig.providers,
    Nodemailer({
      // Nodemailer() throws eagerly at construction if `server` is falsy —
      // this placeholder only exists to satisfy that check. It's never
      // actually connected to: when EMAIL_SERVER is unset, the overridden
      // sendVerificationRequest below never calls createTransport at all.
      server: process.env.EMAIL_SERVER || 'smtp://localhost:1025',
      from: process.env.EMAIL_FROM,
      // No EMAIL_SERVER in dev: log the magic link instead of sending real
      // mail, so the sign-in flow is testable without SMTP credentials.
      ...(process.env.EMAIL_SERVER
        ? {}
        : {
            sendVerificationRequest({ identifier, url }) {
              console.log(`[auth] magic link for ${identifier}: ${url}`);
            },
          }),
    }),
  ],
  adapter: DrizzleAdapter(db, {
    // Key names are dictated by @auth/drizzle-adapter's SQLite adapter
    // (node_modules/@auth/drizzle-adapter/src/lib/sqlite.ts) — it looks up
    // exactly these properties, not the plain table names.
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  events: {
    // Fires once per brand-new account (never again on later sign-ins), with
    // user.id already populated — seed a starter page so a fresh personal
    // space never opens to a totally blank tree on its first /app/docs visit.
    async createUser({ user }) {
      if (!user.id) return;
      await writeDocs(
        [
          {
            id: 'welcome',
            title: 'Welcome',
            parentId: null,
            order: 0,
            body: serializeBlocks([
              emptyProse('heading1', 'Welcome to your workspace'),
              emptyProse(
                'paragraph',
                "This is your own private space, separate from everyone else's. Pages, collections, and templates you create here are visible only to you."
              ),
              emptyProse('paragraph', 'Use the + button in the sidebar to create your first page.'),
            ]),
          },
        ],
        { userId: user.id }
      );
    },
  },
});
