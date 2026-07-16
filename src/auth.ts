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

// Send the Auth.js magic-link email via Brevo's HTTP API (port 443) instead of
// SMTP (port 587/465). Railway silently drops outbound SMTP egress on
// 25/465/587 for anti-abuse, which made nodemailer's SMTP send hang forever —
// the sign-in POST never returned. Brevo's REST endpoint runs on 443, which
// Railway does NOT block, so this sidesteps the egress policy entirely.
//
// Requires BREVO_API_KEY (an `xkeysib-…` key from Brevo → SMTP & API → API
// keys, NOT the `xsmtpsib-…` SMTP master key — the two are distinct and the
// SMTP key returns 401 on the REST API). Falls back to logging the link when
// BREVO_API_KEY is unset, so dev/local stays testable without any credentials.
async function sendMagicLinkEmail({
  identifier,
  url,
  from,
}: {
  identifier: string;
  url: string;
  from: string;
}) {
  if (!process.env.BREVO_API_KEY) {
    console.log(`[auth] magic link for ${identifier}: ${url}`);
    return;
  }

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': process.env.BREVO_API_KEY,
      'accept': 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      sender: { email: from },
      to: [{ email: identifier }],
      subject: 'Sign in to GameDoc',
      htmlContent: `<p>Click the link below to sign in to GameDoc:</p>` +
        `<p><a href="${url}">Sign in</a></p>` +
        `<p style="color:#888;font-size:12px">If you didn't request this, you can ignore this email.</p>`,
      // Brevo tags help isolate auth-link volume in the dashboard.
      tags: ['auth', 'magic-link'],
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Brevo send failed: ${res.status} ${detail.slice(0, 200)}`);
  }
}

// Node-only: pulls in the Drizzle adapter (native-addon-backed via
// better-sqlite3). The Nodemailer provider is retained only for its
// email-type plumbing (identifier/url generation) — the actual send is
// overridden above to use Brevo's HTTP API, so no SMTP connection is ever
// opened. This module must never be imported from Edge middleware —
// src/middleware.ts builds its own Edge-safe instance from auth.config.ts
// alone, which omits the adapter.
export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth({
  ...authConfig,
  providers: [
    ...authConfig.providers,
    Nodemailer({
      // Nodemailer() throws eagerly at construction if `server` is falsy; this
      // placeholder is never connected to because sendVerificationRequest is
      // overridden to call the Brevo HTTP API instead.
      server: 'smtp://localhost:1025',
      from: process.env.EMAIL_FROM,
      async sendVerificationRequest({ identifier, url }) {
        await sendMagicLinkEmail({
          identifier,
          url,
          from: process.env.EMAIL_FROM || 'noreply@easygdd.com',
        });
      },
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
