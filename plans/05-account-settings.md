# Plan 05 — Unify auth onto real accounts + account settings (profile, avatar, account page, payment scaffold)

Goal: replace the main editing site's shared `SITE_PASSWORD` gate with the same real per-user NextAuth accounts already built for `/app/*` (Google/GitHub/email), add a DB-backed allowlist so sign-in doesn't mean "anyone with a Google account," and give the resulting single identity a modern-app profile icon + account page + payment scaffold. Content on the main site stays shared/global across all signed-in users — this plan changes *how people get in*, not the shared-docs data model.

**Scope decision (confirmed with user 2026-07-14):** go all the way to real per-user accounts on the main site (not a cosmetic nickname), with a DB-backed email allowlist (not env var, not invite links) deciding who's allowed to sign in.

**Superseded (2026-07-14):** see `plans/06-multi-workspace-dashboard.md`. That plan folds this file's Phase 2 (real-session gate) in as its own Phase 1, and replaces this file's Phase 1 (standalone global allowlist) with per-workspace membership instead — a bare account with no workspace memberships just sees an empty dashboard, so there's no separate global gate to build. Phases 3-5 below (profile icon, account page, billing scaffold) are unaffected and still apply on top of Plan 06.

---

## Phase 0 — Current state (confirmed 2026-07-14, do not re-derive)

Two separate, non-overlapping auth systems exist today:

1. **Main editing site** (`(site)/*` — `docs`, `collections`, `boards`, `glossary`, `ladder`, `nightmare`): gated by a single shared `SITE_PASSWORD`.
   - `src/lib/auth/session.ts` — `authEnabled()` (true iff `SITE_PASSWORD` env is set), `AUTH_COOKIE`, `sessionToken()`, `safeEqual()`.
   - `src/middleware.ts:69-91` — when `authEnabled()`, compares `AUTH_COOKIE` against `sessionToken()`; unauthenticated page loads → `/login`, API calls → 401 JSON.
   - `src/app/(site)/layout.tsx:42-55` — when ungated-but-not-authed, renders a bare `<html><body>{children}</body></html>` shell (no sidebar, no data reads) so the doc tree can't leak to a logged-out visitor; this same shell trick must be preserved.
   - `src/app/(site)/login/page.tsx` + `LoginForm.tsx` — password form, presumably posts to `/api/login` (site-wide, sets `AUTH_COOKIE`). `/api/logout` clears it.
   - `src/components/SidebarNav.tsx:51-60` — logout is a bare text link inside a `<form action="/api/logout">`, only rendered `if showLogout` (i.e. only when the gate happens to be on) — no icon, no menu, no identity shown (there is no per-person identity to show; everyone who knows the password looks identical).
   - Content (`docs`, `templates`, `collections`, `boards`) is **global**, not scoped by user — this is a real-time multi-user collaborative wiki (yjs/y-websocket relay, see [[collab-architecture]]), and that shared-content model is **not changing**.

2. **Personal workspace** (`/app/*`): gated by real NextAuth sessions.
   - `src/auth.ts` — `DrizzleAdapter`, providers Google/GitHub/Nodemailer(email).
   - `src/auth.config.ts` — Edge-safe subset, used by `src/middleware.ts:56-59` (`personalAuth()`).
   - `src/db/schema.ts` — `users` (id, name, email, emailVerified, image), `accounts`, `sessions`, `verificationTokens`.
   - `src/lib/auth/personal.ts` → `requireUserId()`, used by every `/api/app/*` handler.
   - Data here (docs, collections under `/app/*`) **is** scoped per-`userId` — that model stays exactly as-is; this plan does not touch it.
   - `src/app/(personal)/app/login/page.tsx` — working provider-buttons + email-magic-link login screen.
   - `PersonalSidebarNav.tsx` — plain-text `userLabel` + logout button, no avatar/menu (this is the same gap Phase 2+ below fixes, just previously scoped to `/app` only).

### Why this is safe to unify without a data migration
The main site's content was never partitioned by the password — there is exactly one "space" everyone who knows the password sees. Swapping the gate for real sessions doesn't require deciding "whose docs are these," because they were always everyone's. The only new thing sessions add is: (a) an actual identity to show in the UI, (b) a need for an explicit allowlist, since "knows the password" stops being the implicit access-control mechanism.

### Anti-patterns for this feature
- ❌ Don't let `signIn` succeed for any email that authenticates via Google/GitHub/email but isn't on the allowlist — that's the whole point of this change; a forgotten check here silently reopens the site to the public internet.
- ❌ Don't remove the "bare shell, no data reads" trick in `(site)/layout.tsx` when swapping the auth check — an unauthenticated request must still get zero doc-tree leakage.
- ❌ Don't touch `checkAgentToken`/`GAMEDOC_AGENT_TOKEN` (the MCP server-to-server bearer auth in `src/lib/auth/agentToken.ts`) — that's a separate, non-interactive mechanism and out of scope here.
- ❌ Don't build a real payment processor integration — Phase 5 below is a **UI scaffold only**.
- ❌ Don't touch Railway env vars / production config directly without confirming with the user first — this plan changes who can access a live, presumably-in-use site. Removing `SITE_PASSWORD` and rolling out the allowlist in production is a deploy-time decision, not something to flip silently.

---

## Phase 1 — DB-backed email allowlist

**Implement**
1. `src/db/schema.ts` — new table `allowedEmails`: `email (text, PK, lowercased)`, `isAdmin (integer/boolean, default false)`, `addedBy (text, nullable — email of whoever added it)`, `createdAt`.
2. **Bootstrap problem**: the table starts empty, so the very first sign-in needs a way in without already being on the list. Add an `OWNER_EMAIL` env var (set to the user's own email) that the `signIn` callback always treats as allowed + admin, regardless of what's in the DB — this is the one break-glass entry point; every other email must be in `allowedEmails`.
3. `src/lib/auth/allowlist.ts`: `isAllowed(email)` (checks `OWNER_EMAIL` OR DB row), `isAdmin(email)`, `addAllowedEmail(email, addedBy, isAdmin?)`, `removeAllowedEmail(email)`, `listAllowedEmails()`.
4. `src/auth.config.ts` (must stay Edge-safe — no Drizzle/better-sqlite3 import here): the allowlist check needs a DB read, which the Edge-safe config can't do directly. Two options — pick one at implementation time based on what's cleanest:
   - (a) Do the allowlist check in `src/auth.ts`'s `signIn` callback (Node runtime, already imports the DB) rather than `auth.config.ts`, since NextAuth's `signIn` callback runs in the same runtime as wherever `NextAuth()` was constructed — confirm this executes in the full Node instance, not the Edge one, before relying on it.
   - (b) If it must run in the Edge-safe config too (e.g. for middleware-level pre-checks), expose a small Edge-safe allowlist check that calls an internal API route instead of importing Drizzle directly.
5. Minimal admin page: `src/app/(personal)/app/admin/allowlist/page.tsx`, gated by `isAdmin(session.user.email)` (redirect/403 otherwise) — list current allowlist, add-email form, remove button. Keep this deliberately small; it's a utility page, not a polished feature.

**Verify**: attempt sign-in with a non-allowlisted Google account in dev → rejected with a clear message; add that email via the admin page (as the `OWNER_EMAIL` account) → same sign-in now succeeds.

---

## Phase 2 — Swap the main site's gate from SITE_PASSWORD to real sessions

**Implement**
1. `src/middleware.ts`: replace the `authEnabled()`/`AUTH_COOKIE` block (lines ~69-91) with the same `personalAuth()` session check already used for `/app/*` — the two route groups can now share one auth check. Unauthenticated page loads → redirect to login; API calls → 401 JSON (preserve existing behavior split).
2. `src/app/(site)/layout.tsx`: replace the `authEnabled()`/`safeEqual(...)` block with `const session = await auth(); const authed = !!session?.user;` — keep the bare-shell-when-unauthenticated branch exactly as it is structurally (just swap the condition feeding it).
3. Decide on one login page: either point `(site)`'s unauthenticated redirect at the existing `(personal)/app/login` screen (simplest — one login page for the whole product), or fold that screen's content into a top-level `/login` used by both. Recommend the former to avoid duplicating the provider-button UI.
4. Retire the password-based path once the swap is verified working: `src/app/(site)/login/page.tsx`, `LoginForm.tsx`, `/api/login`, `/api/logout`, and `src/lib/auth/session.ts` (`authEnabled`/`AUTH_COOKIE`/`sessionToken`/`safeEqual`) — grep for any other importers of `src/lib/auth/session.ts` first in case something else depends on it before deleting.
5. `SidebarNav.tsx`: `showLogout` prop becomes unconditional (every visitor is now a real signed-in user) — this sets up Phase 3's profile menu to replace the plain-text link.

**Verify**: with the allowlist containing only `OWNER_EMAIL`, confirm a signed-out visitor hitting `/docs/[id]` gets the bare shell + redirect to login (no doc-tree leak), signs in successfully, and reaches the full site. Confirm a non-allowlisted account is rejected.

---

## Phase 3 — Profile icon + menu (both surfaces)

**Implement**
1. `src/components/ProfileMenu.tsx` (new, client component, shared by both nav bars): avatar button — `<img>` from `session.user.image` if present, else initials-in-circle fallback from `name`/`email` — opens a popover with display name + email, a link to `/app/account`, and the logout form.
2. `SidebarNav.tsx` (main site): replace the plain-text logout link with `<ProfileMenu />`.
3. `PersonalSidebarNav.tsx` (`/app`): same replacement, reusing the same component (this closes the gap that was originally scoped to `/app` only, now naturally extended to the main site too since both share one identity).
4. Both layouts need to pass session user fields down (`auth()` is already called for the gate check in both layouts — reuse that result rather than calling `auth()` twice).

**Verify**: sign in with each provider (Google/GitHub/email) in dev, confirm avatar/initials render correctly in both the main-site sidebar and `/app` sidebar, confirm the popover's logout works from both.

### Phase 3 — done (2026-07-14)

- Shipped as designed, plus a third surface the original text didn't anticipate: `WorkspaceSidebarNav.tsx` (`/w/[workspaceId]`, added by Plan 06's Phase 4) had the same plain-text-label gap and got the same `ProfileMenu` treatment. It has one variant the other two surfaces don't need — a cookie-only pre-account viewer (Plan 06's Phase 4.4 signed-cookie flow) has no `session.user` at all, so that sidebar falls back to a plain "Guest (view-only)" label with no menu/account-link/logout when `name`/`email` are both absent, instead of trying to render `ProfileMenu` for someone with no account to manage.
- `ProfileMenu`'s account-settings link points at `/app/account` per spec even though that page doesn't exist until Phase 4 — clicking it while signed in currently 404s inside the `(personal)` layout, which is expected and will resolve once Phase 4 ships.
- QA note for whoever automates this page next: this popover only opens for a fully browser-trusted click event (real mouse down/up + click, e.g. Playwright/CDP-driven or the Browser pane's `computer` tool) — a bare `element.click()` fired from injected JS does not trigger the button's React handler here, so if you're scripting this component with `javascript_tool`/`page.evaluate`, dispatch a `pointerdown`→`mousedown`→`mouseup`→`click` `MouseEvent` sequence instead.
- `npx tsc --noEmit` clean. Browser QA covered all three sidebars: initials-fallback avatar rendering (tested with an account that has no `image`), popover open/close, the `/app/account` link, logout form presence, `Share` link correctly staying hidden from non-owners, and the guest (no-session, cookie-only) fallback rendering plain text with no menu.

---

## Phase 4 — Account page (`/app/account`)

**Implement**
1. `src/app/(personal)/app/account/page.tsx` — profile section (avatar, editable display name via server action, read-only email with verification-method badge), connected-accounts list (read-only rows from the `accounts` table for this user — no unlinking, to avoid lockout edge cases), link to the allowlist admin page if `isAdmin`.
2. `src/lib/auth/account.ts`: `getAccountProfile(userId)`, `updateDisplayName(userId, name)`, `listLinkedProviders(userId)` — same per-`userId`-scoped pattern as `src/lib/docs/store.ts`.
3. Reachable from the `ProfileMenu` popover (Phase 3) on both surfaces.

**Verify**: edit display name, confirm it persists and updates in the profile menu on next load.

### Phase 4 — done (2026-07-14)

- Shipped as designed, with two deliberate deviations from the spec text: (1) the "link to the allowlist admin page if `isAdmin`" bullet was dropped — Phase 1's allowlist was superseded by Plan 06's per-workspace membership model and was never built, so there's no `isAdmin` concept to link to. (2) Phase 5's billing scaffold (static "Free" plan + disabled "Add payment method" button) was folded directly into this same page rather than a separate pass, since it's a few lines of static markup with no new data-fetching — no `billing_customers` table stub was added since nothing reads/writes it yet and it wasn't needed to render the static section; add it when Phase 5 actually needs persisted state.
- `src/lib/auth/account.ts`: `getAccountProfile`/`updateDisplayName`/`listLinkedProviders`, scoped by `userId` exactly like `src/lib/workspaces/access.ts`'s pattern.
- Display-name edits use NextAuth v5's `unstable_update()` (now exported from `src/auth.ts`) so the JWT session cookie reflects the new name without requiring sign-out/sign-in — `src/auth.config.ts`'s `jwt` callback merges `trigger === 'update'` data without touching the DB, keeping the Edge/Node config split intact.
- **Gotcha found and fixed during QA**: a plain `<form action={serverAction}>` submit's automatic Next.js router refresh re-renders using the cookies already attached to *that* request — before the `Set-Cookie` from `unstable_update()` inside the action reaches the browser. The practical effect: the sidebar `ProfileMenu` (which reads `session.user.name` in a parent layout) showed the *previous* name for one save cycle, only catching up on the next unrelated request. Fixed by ending `updateDisplayNameAction` (`src/app/(personal)/app/account/actions.ts`) with `redirect('/app/account')` — a redirect response still carries the action's `Set-Cookie` header, and forces the browser to issue a fresh GET that picks it up immediately, so every `ProfileMenu` surface updates in the same round trip as the save.
- QA note for automation: this page hit the same synthetic-input gotchas as elsewhere in this session — `computer{action:"type"}` intermittently failed to actually populate the name `<input>` (confirmed via a JS `.value` check), and a coordinate-based `computer{action:"left_click"}` on the Save button sometimes silently no-op'd after a Fast Refresh recompile invalidated the previous `read_page` refs (no POST appeared in server logs). Reliable path: `form_input` to set the field value, then re-`read_page` for fresh refs before the click, or dispatch a trusted-shaped `pointerdown→mousedown→mouseup→click` `MouseEvent` sequence via `javascript_tool` if scripting it directly.
- QA coverage: signed in via the email magic-link dev flow, confirmed the page renders profile (avatar-initials fallback, since the test account had no `image`), a `Verified` badge (email provider verifies on sign-in), an empty connected-accounts list (expected — Auth.js's email/Nodemailer provider doesn't create an `accounts` row the way OAuth providers do), and the billing placeholder. Edited the display name three times in sequence and confirmed each edit (a) persisted to the `user` table directly via sqlite, and (b) was reflected in the sidebar `ProfileMenu` in the same round trip once the redirect fix was in place. `npx tsc --noEmit` clean. Test user and its rows (`user`/`account`/`session`/`workspace`) removed from the local dev DB afterward.
- **Re-verified 2026-07-15** after a dev-server restart (fresh test user, since the earlier one had already been cleaned up): a single genuinely-trusted click (`computer.left_click`, not synthetic JS) on Save immediately updated both the sidebar `ProfileMenu` and the form field's own value — confirmed via direct DOM read (`input.value`), no manual navigation or reload needed. The redirect fix is live and working end-to-end, not just documented.

---

## Phase 5 — Payment/billing scaffold (non-functional placeholder)

**Scope, explicitly**: shape only — no payment processing, no card fields, no processor calls, no stored payment data. When real billing is built later, use a hosted flow (Stripe Checkout/Customer Portal or equivalent) so card data never transits the server.

1. `billing_customers` table stub: `userId (PK/FK), plan (default 'free'), externalCustomerId (nullable)` — unused by any write path yet.
2. Account page "Billing" section: current plan shown as `"Free"` (static), a disabled "Add payment method" button with a caption explaining billing isn't enabled yet.

### Phase 5 — partially done (2026-07-14)

Item 2 (the static Billing UI section) shipped as part of Phase 4's page — see that phase's done-note. Item 1 (the `billing_customers` table stub) was **not** added, since nothing reads or writes it yet and the static section doesn't need it; add the table when a real write path (or even a placeholder read) actually needs it, rather than carrying an unused schema migration.

---

## Phase 6 — Rollout

- Confirm Google/GitHub OAuth client credentials and `AUTH_SECRET`/`EMAIL_SERVER` are actually set in the **Railway** production environment before flipping the main site over — `/app` may have only ever been tested locally (memory notes `AUTH_SECRET` had to be added to `.env.local` for local testing). Locking out the live site because a prod env var is missing is the main rollout risk.
- Seed `OWNER_EMAIL` = the user's own email in Railway config, and add any current collaborators to `allowedEmails` (via the Phase 1 admin page, or a one-off insert) **before** removing `SITE_PASSWORD`, so nobody currently using the password gets locked out on cutover.
- This whole rollout (env var changes, removing `SITE_PASSWORD` in Railway, first production deploy) touches shared/production infrastructure — confirm with the user before executing, per standing practice; don't just push it live at the end of implementation.
- `npx tsc --noEmit` clean; manual pass covering: allowlisted sign-in, rejected non-allowlisted sign-in, bare-shell-when-signed-out, profile menu on both surfaces, account page edits.

### Phase 6 — blocked (confirmed via read-only check, 2026-07-15)

Ran `railway status` + `railway variables --json` (names only, no values ever printed) against the production environment (Project "Game-Doc", Environment "production", Service "GameDoc", live at `gamedoc-production.up.railway.app`) with the user's explicit read-only-only authorization. Confirmed:
- **Present**: `AUTH_SECRET` (legacy/unused — current code needs `GAMEDOC_ACCOUNTS_SECRET`, not this), `SITE_PASSWORD` (still active), `COLLAB_DB_DIR`, `DATA_DIR`, `GAMEDOC_AGENT_TOKEN`, `HOST`, `NEXT_PUBLIC_COLLAB_URL`.
- **Absent**: `GAMEDOC_ACCOUNTS_SECRET`, `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET`, `AUTH_GITHUB_ID`/`AUTH_GITHUB_SECRET`, `EMAIL_SERVER`, `EMAIL_FROM`.

This directly answers the "Open questions" below — Phase 6 cannot proceed yet. It needs, in order: (1) the user to create/obtain Google and/or GitHub OAuth app credentials for the production domain and set up an email-sending provider for magic links (or decide to launch with a subset of sign-in methods), (2) a generated `GAMEDOC_ACCOUNTS_SECRET` written to Railway, (3) explicit user go-ahead to actually write any of this to Railway (the read-only check itself was separately authorized; writing secrets, running `scripts/seed-workspaces.ts` against production, and removing `SITE_PASSWORD` are still unauthorized). None of today's Plan 05/06 code has been merged to `develop` (which auto-deploys to this environment), so production is not currently at risk — this is a pre-deploy blocker, not an active incident.

Also confirmed via `git log origin/develop` that the `develop` branch (which auto-deploys) is unaffected by any of this work — safe to keep iterating on the feature branch without a rollout deadline.

---

## Open questions for the user

- Who besides you currently knows/uses `SITE_PASSWORD` and needs their email added to the allowlist before cutover? — **Likely moot**: Plan 06 superseded the standalone allowlist with per-workspace membership, so there's no separate global gate to seed anymore; this only still matters if the *main site* (not `/app`) keeps a shared allowlist model post-cutover.
- Confirm Google/GitHub OAuth app credentials exist for the production domain (Railway), or whether those still need to be created — this blocks Phase 6 regardless of how much of Phases 1-5 is done. — **Answered 2026-07-15**: confirmed absent (see Phase 6 blocked-note above), along with `GAMEDOC_ACCOUNTS_SECRET` and email-server config. These need to be created/supplied by the user before Phase 6 can proceed.
