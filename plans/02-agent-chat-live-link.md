# Plan 02 — Live-Link to VS Code Copilot Chat (and later Claude Code) Sessions

Goal: the GameDoc site gets a **Sessions** view — a session list + live transcript viewer hooked to the AI chats running on the viewer's own device. VS Code Copilot first; Claude Code second. Each phase is self-contained and executable in a fresh context.

**Scope decision (confirmed with user 2026-07-13):** this must work correctly on the live, multi-user Railway deployment, for anyone's VS Code/Claude Code — not just one developer's local checkout. Each person runs a local bridge process on their own machine, pointed at the live URL; they see only their own chats. Requirements that follow from this:
- **Per-user isolation.** The site already has real per-user accounts for personal spaces (NextAuth + SQLite, `/app/*`, `requireUserId()` — see `src/lib/auth/personal.ts`). Chat-link is built as a personal-space feature (`/app/sessions`), not a site-wide unscoped feature like the existing MCP agent bus. A single shared secret (`GAMEDOC_AGENT_TOKEN`) is wrong here — it doesn't distinguish which user's bridge sent an event.
- **Per-user device tokens**, not the shared agent token: a new `chatlink_device_token` SQLite table (id, token, userId, label, createdAt), generated from the `/app/sessions` UI, pasted into the bridge's local config once. `/api/chatlink/events` resolves the token → userId and scopes the in-memory bus store by userId.
- **Cross-platform bridge.** VS Code and Claude Code chat storage paths differ by OS (Windows `%APPDATA%`, macOS `~/Library/Application Support`, Linux `~/.config`). The bridge auto-detects via `process.platform`, not a Windows-only hardcode.

---

## Phase 0 — Documentation Discovery (DONE, findings below)

All findings verified on this machine 2026-07-13. **Do not re-derive; do not invent other paths/APIs.**

### 0.1 VS Code Copilot chat storage (source of truth for Phase 2)
- Location: `%APPDATA%\Code\User\workspaceStorage\<hash>\chatSessions\<sessionId>.json` (37 files exist today). Insiders would be under `Code - Insiders`; ignore for now.
- Workspace mapping: each `<hash>\workspace.json` has `{ "folder": "file:///c%3A/..." }` — decode the URI to label sessions by project.
- Session JSON top-level keys: `version, responderUsername, initialLocation, requests, sessionId, creationDate (epoch ms), lastMessageDate, hasPendingEdits, inputState`, optional `customTitle`.
- Each element of `requests[]` has keys: `agent, codeCitations, contentReferences, followups, message, modelId, requestId, response, responseId, result, timestamp, timeSpentWaiting, variableData, ...`
  - User text: `request.message.text` (string).
  - Assistant output: `request.response` is a **list of typed parts**; parts observed include `{kind: "mcpServersStarting", ...}` and markdown/text parts. Renderer rule: if a part has a string `value` or is `{kind: "markdownContent"/"inlineReference"/...}`, render its text; otherwise show a small chip with `kind`. **Do not assume a fixed part list — switch on `kind` with a fallback.**
  - `request.result.timings.totalElapsed` exists for duration display.
- There is **no push API**: detection is filesystem watching (`fs.watch` on the `chatSessions` dirs + mtime debounce; VS Code rewrites the whole file on update).

### 0.2 Claude Code session storage (source of truth for Phase 4)
- Location: `~/.claude/projects/<slug>/<sessionId>.jsonl` (slug like `D--GameDoc`). Append-mostly JSONL — tail by byte offset.
- Line types observed: `{"type":"queue-operation",...}`, and message lines with `parentUuid/isSidechain/attachment/...`. User/assistant turns carry `message` objects (Anthropic message shape). Render only user/assistant text turns; skip hook/attachment/queue noise.

### 0.3 Existing in-repo patterns to COPY (not reinvent)
- **SSE fan-out**: `src/app/api/agent/stream/route.ts` — ReadableStream + heartbeat + `agentBus().subscribe`. Copy this file's structure for the chat stream (add a `requireUserId()` gate — this stream is per-user, unlike the site-wide agent stream).
- **Authenticated ingest, site-wide precedent**: `src/app/api/agent/events/route.ts` — zod discriminated union + `checkAgentToken`. Copy the *shape* (validate, then publish), but auth differs: chat-link ingest resolves a per-user device token (`src/lib/chatlink/deviceToken.ts`), not the shared `GAMEDOC_AGENT_TOKEN`.
- **Per-user REST + auth gate precedent**: `src/app/api/app/collections/route.ts` — `requireUserId()` from `src/lib/auth/personal.ts`, 401 if absent, scope every store call by `userId`. This is the pattern chat-link's browser-facing routes (`sessions`, `sessions/[id]`, `devices`) follow, not the agent bus's unscoped pattern.
- **In-process bus**: `src/lib/agent/bus.ts` (`agentBus()` publish/subscribe). `src/lib/chatlink/bus.ts` follows the same shape but keys every client/session/transcript map by `userId` first.
- **Companion Node process pattern**: `scripts/dev-lan.mjs` + `npm run dev:collab` (collab relay). The bridge is a third sibling script.
- **Drizzle table + migration**: `src/db/schema.ts` + `npx drizzle-kit generate` (migrations applied programmatically at import time by `src/db/client.ts`, never via CLI in prod). `chatlink_device_token` was added this way.

### 0.4 Architecture decision (consolidated)
A local **chat-bridge** Node process (`scripts/chat-bridge.mjs`) watches the chat stores and POSTs normalized events to the Next server (`/api/chatlink/events`), authenticated by a per-user device token. The server resolves the token to a `userId` and fans events out only to that user's SSE subscribers (`/api/chatlink/stream`, gated by `requireUserId()`). Snapshot reads (session list, full transcript) are REST GETs against the same per-user in-memory store, so the **Railway deployment works too**: the bridge on each person's own device points at the live URL, authenticates as that person, and only that person's browser session (signed in via the existing NextAuth cookie) can read it back. Browsers never read local disk; only the bridge does. Lives under `/app/sessions` (the personal-space route group), not the shared `/docs` site.

### Anti-patterns (all phases)
- ❌ No VS Code extension APIs, no `vscode.*` imports — we only read JSON files on disk.
- ❌ Don't parse `result.metadata.renderedUserMessage` for user text; use `message.text`.
- ❌ Don't `fs.watchFile` polling every file; watch the directories, debounce 250ms.
- ❌ Don't reuse `GAMEDOC_AGENT_TOKEN`/`checkAgentToken` for chat-link ingest — it has no per-user identity. Use device tokens.
- ❌ Don't make the Next server read `%APPDATA%`/`~/.claude` directly (breaks on Railway, and leaks across users); only the bridge touches disk, on the viewer's own machine.
- ❌ Don't hardcode Windows-only paths in the bridge — branch on `process.platform` for VS Code's storage root and reuse `os.homedir()` for Claude Code's (same on every OS).
- ❌ Don't put chat-link routes/pages outside `/app/*` — the shared `/docs` site has no per-user identity to scope against.

---

## Phase 1 — Server plumbing: device tokens + chatBus + ingest + SSE + snapshot store (DONE)

**Implemented**
1. `src/db/schema.ts` — `chatlinkDeviceTokens` table (`id, token, userId, label, createdAt`); migration `drizzle/0001_blue_viper.sql` generated via `npx drizzle-kit generate` (unapplied to any real DB — safe to regenerate if the shape needs to change again).
2. `src/lib/chatlink/deviceToken.ts` — `createDeviceToken`, `resolveDeviceToken`, `listDeviceTokens`, `revokeDeviceToken`. Raw token returned only at creation; `id` is the non-secret handle for list/revoke.
3. `src/lib/chatlink/types.ts` — zod schemas: `ChatSessionMeta` (`id, source: 'copilot'|'claude', workspace, title, createdAt, updatedAt, requestCount`), `ChatTurn` (`role, text, parts?, timestamp, modelId?`), events `session.upsert | session.remove | transcript.snapshot {sessionId, turns} | transcript.append {sessionId, turns}` (discriminated union).
4. `src/lib/chatlink/bus.ts` — `chatBus()` singleton, `Map<userId, {clients, sessions: Map<sessionId,meta>, transcripts: Map<sessionId,turns>}>`. `subscribe(userId, client)`, `publish(userId, event)`, `listSessions(userId)`, `getTranscript(userId, sessionId)`.
5. `src/app/api/chatlink/events/route.ts` — POST, resolves `Bearer <deviceToken>` → userId via `resolveDeviceToken`, zod-validates body, `chatBus().publish(userId, event)`.
6. `src/app/api/chatlink/stream/route.ts` — GET, `requireUserId()` gate (401 if not signed in), SSE per Phase 0.3's pattern, `chatBus().subscribe(userId, send)`.
7. `src/app/api/chatlink/sessions/route.ts` (GET list) and `sessions/[id]/route.ts` (GET transcript) — both `requireUserId()`-gated.
8. `src/app/api/chatlink/devices/route.ts` — GET (list, no secrets), POST (create, returns token once), DELETE (revoke by id). All `requireUserId()`-gated.

**Verified**: `npx tsc --noEmit` clean.

**Verified end-to-end (2026-07-13, local dev + browser)**: added a dev-only `AUTH_SECRET` to `.env.local` (was missing, blocked all NextAuth sign-in) and restarted the dev server. Signed in as `chatlink-test@example.com` via the email magic-link flow, generated a device token from `/app/sessions`, POSTed `session.upsert` + `transcript.snapshot` to `/api/chatlink/events` with `Authorization: Bearer <token>` — both turns appeared in the UI live via the SSE stream with no reload, and the transcript pane rendered correctly on click. Confirmed isolation: signed in as a second account (`chatlink-test-second@example.com`) and saw zero devices and zero sessions. Revoked the token from the UI and confirmed a subsequent POST with that token returns 401. All six chat-link routes also confirmed to 401 when unauthenticated/unauthorized.

---

## Phase 2 — chat-bridge.mjs (Copilot watcher)

**Implement** `scripts/chat-bridge.mjs` (+ `npm run chat-bridge -- --token=<deviceToken> [--target=https://…]`):
1. Token: required, from `--token` flag or `GAMEDOC_CHATLINK_TOKEN` env (read `.env.local` as fallback, same pattern as `scripts/backup-live.ts:47-56`). Fail fast with a clear message pointing at `/app/sessions` if missing — this is a per-user secret, not something with a sane shared default. Target defaults to `http://localhost:3000`.
2. VS Code storage root, cross-platform (`process.platform`):
   - `win32`: `%APPDATA%\Code\User\workspaceStorage`
   - `darwin`: `~/Library/Application Support/Code/User/workspaceStorage`
   - `linux`: `~/.config/Code/User/workspaceStorage`
   Enumerate `<root>/*/chatSessions/*.json`; read each `<hash>/workspace.json` for the folder label (decode `file:///` URI). Skip the whole root gracefully (log once, keep running) if it doesn't exist — VS Code may not be installed.
3. Normalizer per Phase 0.1: session file → `ChatSessionMeta` + `ChatTurn[]` (user turn from `message.text`; assistant turn = concatenated text of `response[]` parts with a `kind`-switch fallback; tolerate unknown kinds).
4. On startup: POST `session.upsert` for every session (newest 50), and `transcript.snapshot` lazily — only when the server asks. Simplest lazy mechanism: bridge also POSTs full snapshots for the 5 most recently modified sessions; others on change.
5. `fs.watch` each `chatSessions` dir (and the `workspaceStorage` root for new hashes), 250ms debounce; on change re-read the file, diff `requests.length` against last-seen, POST `transcript.append` (or `snapshot` if shrunk/changed) + `session.upsert`.
6. Resilience: retry POSTs with backoff; skip unparsable JSON (VS Code mid-write) — retry once after 200ms; a 401 from the server (revoked/wrong token) should stop retrying and print a clear re-pairing message instead of looping forever.

**Verify**: sign in at `/app`, generate a device token from `/app/sessions` (Phase 3), run `npm run dev` + `npm run chat-bridge -- --token=…`; ask something in Copilot chat in VS Code; within ~1s `curl -H "Cookie: gd_session=…" /api/chatlink/sessions` (or the UI) shows updated `updatedAt` and the transcript includes the new turn.

---

## Phase 3 — Sessions UI (`/app/sessions`)

**Implement**
1. Route `src/app/(personal)/app/sessions/page.tsx` (client component, inside the existing personal-space layout so `requireUserId()`/middleware auth already applies — see `src/app/(personal)/app/collections/page.tsx` for the sibling pattern). Two panes: left list of sessions (grouped by workspace, source badge, relative time), right transcript pane.
2. A "Connect a device" panel: lists existing device tokens (label + createdAt only, via GET `/api/chatlink/devices`), a form to create one (POST, show the raw token exactly once with a copy button and the `npm run chat-bridge -- --token=…` command), and revoke buttons (DELETE by id).
3. Data flow: initial fetch from `/api/chatlink/sessions` (+ `/sessions/[id]` on select), then subscribe to `/api/chatlink/stream` via `EventSource` — copy the client subscription pattern from `src/components/docs/DocsProvider.tsx:102-112` (`new EventSource(...)`, `onmessage` JSON.parse with a try/catch, switch on `msg.type`).
4. Transcript rendering: user bubble = plain text; assistant bubble = markdown-ish plain rendering of part texts; unknown parts as muted `kind` chips. Auto-scroll on append. Empty state when no sessions exist yet: "No bridge connected — pair a device above, then run `npm run chat-bridge`."
5. Add a `/app/sessions` entry to `UTILITY_LINKS` in `src/components/PersonalSidebarNav.tsx:7`, next to `/app/collections`. Style with existing atelier tokens (canvas/surface/ink/brass — never remap Tailwind ramps).

**Verify**: browser preview → sign in to `/app`, open `/app/sessions`, generate a token, run the bridge, send a Copilot message, watch the turn appear live without reload; screenshot as proof. Check `read_console_messages` clean. Confirm `/api/chatlink/*` 401s when signed out.

---

## Phase 4 — Claude Code source (second provider)

**Implement** in `chat-bridge.mjs`:
1. Watch `path.join(os.homedir(), '.claude', 'projects', '*', '*.jsonl')` — same path shape on Windows/macOS/Linux (`os.homedir()` already normalizes it, no `process.platform` branch needed here unlike VS Code's storage root). Tail by stored byte offset per file (append-mostly).
2. Parse lines per Phase 0.2: emit turns only for user/assistant message lines with text content; skip `queue-operation`, hooks/attachments, sidechains (`isSidechain: true`). Session meta: slug → project label (decode `D--GameDoc` → `D:\GameDoc`, or `-Users-x-project` → `/Users/x/project` on macOS/Linux — the slug format is the same dash-escaping on every OS), file mtimes for timestamps, first user text as title fallback.
3. `source: 'claude'` badge flows through existing schema untouched.

**Verify**: run a `claude` session in another terminal; its turns appear on `/app/sessions` live, under the same signed-in user as the paired device token (one bridge process reports both sources under one token).

**Verified (2026-07-13)**: real `cwd` field is present on every Claude Code JSONL line and is a more reliable workspace label than decoding the project-dir slug, so it's used as the primary source with slug-decoding as fallback (both implemented). Ran a standalone parse harness against this machine's real `~/.claude/projects/D--GameDoc/*.jsonl` files (no network calls): slug decode matched the plan's exact examples for both `win32` drive-letter paths and `C--Users-x` paths; extracted 1430 valid turns from 1863 raw lines in the largest session (queue-operation/attachment/sidechain lines correctly excluded); offset-tailing is idempotent (re-reading from the returned offset yields zero new lines). Then posted synthetic `session.upsert` + `transcript.append` events (matching exactly what the bridge sends, including a `tool_use:Bash` part) through the real `/api/chatlink/events` route with a live device token — the session appeared instantly via SSE with the "Claude Code" source badge, grouped correctly by workspace alongside the Copilot session, and the transcript rendered both turns correctly. Test token revoked afterward.

Full bridge process (`npm run chat-bridge`) was intentionally *not* run against this machine's real data for this verification — `watchClaude()` walks every project directory under `~/.claude/projects`, not just GameDoc's, so a real run would sync this developer's entire cross-project Claude Code history (thousands of turns across unrelated projects) into a throwaway test account. That's correct, intended behavior for a real user pairing their own device — just not something to trigger casually against a shared local dev database during a spec-compliance check.

---

## Phase 5 — Final verification

1. **Verified**: `npx tsc --noEmit` clean (no separate lint config in this repo — `tsc --noEmit` is the project's actual gate).
2. **Verified**, anti-pattern greps all clean:
   - `watchFile` in `scripts/` — none.
   - `APPDATA|Library/Application Support` in `src/` — none (only in `scripts/chat-bridge.mjs`, as intended).
   - `from "vscode"` / `require("vscode")` in `scripts/` — none (the string `vscode` appears only in our own `vscodeStorageRoot()` helper name, not an extension-API import).
   - `GAMEDOC_AGENT_TOKEN` in `src/lib/chatlink` and `src/app/api/chatlink` — appears only in two comments explicitly contrasting chat-link's per-user device tokens with the shared agent token; no actual reuse.
3. **Verified**: isolation check done live in-browser — created a session under account A's (`chatlink-test@example.com`) device token, then signed in as a second, distinct account (`chatlink-test-second@example.com`) and confirmed both its device list and its `/api/chatlink/sessions` view were empty.
4. **Verified**: both sources (`copilot`, `claude`) render together in one list under `/app/sessions`, grouped by workspace, with distinct source badges.
5. **Not yet run**: the live Railway test (`npm run chat-bridge -- --token=<deviceToken> --target=https://gamedoc-production.up.railway.app`) — this points a bridge at the shared production deployment and should be run by the user against their own account/token when ready, not triggered unilaterally here.
