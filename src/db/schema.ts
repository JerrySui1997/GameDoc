import { sqliteTable, text, integer, primaryKey, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import type { AdapterAccountType } from 'next-auth/adapters';

// Table shapes must match what @auth/drizzle-adapter's SQLiteDrizzleAdapter
// expects column-for-column (node_modules/@auth/drizzle-adapter/src/lib/sqlite.ts) —
// the package doesn't export its default table defs for reuse, so these are
// hand-written to mirror them. The authenticators/WebAuthn table is omitted;
// not used here.

export const users = sqliteTable('user', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text('name'),
  email: text('email').unique(),
  emailVerified: integer('emailVerified', { mode: 'timestamp_ms' }),
  image: text('image'),
});

export const accounts = sqliteTable(
  'account',
  {
    userId: text('userId')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').$type<AdapterAccountType>().notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('providerAccountId').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  (account) => [primaryKey({ columns: [account.provider, account.providerAccountId] })],
);

export const sessions = sqliteTable('session', {
  sessionToken: text('sessionToken').primaryKey(),
  userId: text('userId')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: integer('expires', { mode: 'timestamp_ms' }).notNull(),
});

export const verificationTokens = sqliteTable(
  'verificationToken',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: integer('expires', { mode: 'timestamp_ms' }).notNull(),
  },
  (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })],
);

// Pairing tokens for the local chat-bridge (scripts/chat-bridge.mjs). A user
// generates one from /app/sessions, drops it in their bridge's local env, and
// every event the bridge POSTs from then on resolves back to this userId —
// the mechanism that keeps one person's VS Code/Claude Code chats from
// leaking into another user's /app/sessions view on the shared live server.
// `id` is a non-secret handle for listing/revoking; `token` is the actual
// bearer secret and is only ever returned once, at creation time.
// ── Workspaces (plans/06-multi-workspace-dashboard.md) ─────────────────────
// A workspace is a named, shareable scope that content files and collab room
// names key off of, generalizing the userId-scoping that already existed for
// personal spaces. `kind` tells the storage/room resolver (Phase 3) which
// naming scheme applies: 'flagship' keeps the legacy bare-docId rooms and
// dataFile(), 'personal' keeps user:{userId}:{docId} and userDataFile(), and
// only 'custom' (freshly created workspaces) uses the new ws:{workspaceId}:...
// scheme — see Phase 0's "why the migration can be additive" note.
export const workspaces = sqliteTable('workspace', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  ownerId: text('ownerId')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  kind: text('kind').$type<'flagship' | 'personal' | 'custom'>().notNull(),
  createdAt: integer('createdAt', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
});

// A member row is either resolved (userId set, inviteEmail null) or a pending
// grant from a link invite (inviteEmail set, userId null) — exactly one of the
// two, enforced by the two partial unique indexes below rather than a CHECK
// constraint, so "does this email already have a pending grant in this
// workspace" stays a plain unique-constraint lookup. The owner doesn't need a
// row here at all: access = ownerId match OR a resolved membership row.
export const workspaceMembers = sqliteTable(
  'workspace_member',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: text('workspaceId')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: text('userId').references(() => users.id, { onDelete: 'cascade' }),
    inviteEmail: text('inviteEmail'),
    role: text('role').$type<'editor' | 'viewer'>().notNull(),
    invitedBy: text('invitedBy').references(() => users.id, { onDelete: 'set null' }),
    createdAt: integer('createdAt', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex('workspace_member_user_unique')
      .on(t.workspaceId, t.userId)
      .where(sql`${t.userId} IS NOT NULL`),
    uniqueIndex('workspace_member_invite_email_unique')
      .on(t.workspaceId, t.inviteEmail)
      .where(sql`${t.inviteEmail} IS NOT NULL`),
  ],
);

// A shareable `/invite/{token}` link. The token itself is the real secret —
// see Phase 4.4's note on why the email step alone doesn't verify ownership.
export const workspaceInviteLinks = sqliteTable('workspace_invite_link', {
  token: text('token').primaryKey(),
  workspaceId: text('workspaceId')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  role: text('role').$type<'editor' | 'viewer'>().notNull(),
  createdBy: text('createdBy')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  createdAt: integer('createdAt', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  revoked: integer('revoked', { mode: 'boolean' }).notNull().default(false),
});

export const chatlinkDeviceTokens = sqliteTable('chatlink_device_token', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  token: text('token').notNull().unique(),
  userId: text('userId')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  createdAt: integer('createdAt', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
});
