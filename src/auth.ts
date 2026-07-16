import { eq, and, isNull } from 'drizzle-orm';
import NextAuth from 'next-auth';
import Nodemailer from 'next-auth/providers/nodemailer';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import authConfig from './auth.config';
import { db } from '@/db/client';
import { users, accounts, sessions, verificationTokens, workspaces, workspaceMembers } from '@/db/schema';
import { writeDocs } from '@/lib/docs/store';
import { serializeBlocks, emptyProse } from '@/lib/docs/blocks';
import { FLAGSHIP_OWNER_EMAIL, FLAGSHIP_WORKSPACE_ID, personalWorkspaceId } from '@/lib/workspaces/constants';

// Node-only: pulls in the Drizzle adapter (native-addon-backed via
// better-sqlite3) and the Nodemailer provider (Node's stream/net/tls), so
// this must never be imported from Edge middleware — src/middleware.ts
// builds its own Edge-safe instance from auth.config.ts alone instead, which
// omits both.
export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth({
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

      // Every new account gets its personal workspace row (plans/06 Phase 2.3).
      // onConflictDoNothing guards against a rare double-fire rather than
      // signaling a real error — this event has no retry semantics to protect.
      await db
        .insert(workspaces)
        .values({
          id: personalWorkspaceId(user.id),
          name: 'Personal',
          ownerId: user.id,
          kind: 'personal',
        })
        .onConflictDoNothing();

      // The flagship site's owner: seed the flagship workspace row the first
      // time this specific email actually signs in, rather than requiring a
      // separate bootstrap step (see scripts/seed-workspaces.ts for the
      // fallback path covering accounts that already existed before this
      // shipped).
      if (user.email === FLAGSHIP_OWNER_EMAIL) {
        await db
          .insert(workspaces)
          .values({
            id: FLAGSHIP_WORKSPACE_ID,
            name: 'GameDoc',
            ownerId: user.id,
            kind: 'flagship',
          })
          .onConflictDoNothing();
      }

      // Resolve any pending link-invite grants (Phase 4.4) for this email now
      // that a real userId exists — upgrades from "email cookie, view-only"
      // to a durable, cross-device membership at the link's actual role.
      if (user.email) {
        await db
          .update(workspaceMembers)
          .set({ userId: user.id, inviteEmail: null })
          .where(and(eq(workspaceMembers.inviteEmail, user.email.toLowerCase()), isNull(workspaceMembers.userId)));
      }
    },
  },
});
