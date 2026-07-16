// scripts/chat-bridge.mjs
//
// Local companion process for /app/sessions (see plans/02-agent-chat-live-link.md).
// Watches VS Code Copilot and Claude Code chat storage on this machine and
// POSTs normalized events to a paired GameDoc account via /api/chatlink/events.
// Only this process ever reads chat storage off disk — the Next server
// (local or Railway) never does, so the same bridge works against either,
// and one person's chats never reach another person's browser.
//
// Run: npm run chat-bridge -- --token=<deviceToken> [--target=http://localhost:3000]
// Get a token from /app/sessions while signed in.

import { promises as fs, watch } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

function parseArgs() {
  const out = {};
  for (const arg of process.argv.slice(2)) {
    const m = arg.match(/^--([^=]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

async function readEnvLocal(key) {
  try {
    const envFile = await fs.readFile(path.join(process.cwd(), '.env.local'), 'utf8');
    const line = envFile.split(/\r?\n/).find((l) => l.startsWith(`${key}=`));
    return line?.slice(key.length + 1).trim().replace(/^["']|["']$/g, '') || undefined;
  } catch {
    return undefined;
  }
}

const args = parseArgs();
const TARGET = (args.target || process.env.GAMEDOC_CHATLINK_TARGET || 'http://localhost:3000').replace(/\/$/, '');
const POLL_INTERVAL_MS = 3_000;
const WATCH_DEBOUNCE_MS = 250;

async function resolveToken() {
  return args.token || process.env.GAMEDOC_CHATLINK_TOKEN || (await readEnvLocal('GAMEDOC_CHATLINK_TOKEN'));
}

// ── VS Code storage root, cross-platform ────────────────────────────────────
function vscodeStorageRoot() {
  const home = os.homedir();
  switch (process.platform) {
    case 'win32':
      return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'Code', 'User', 'workspaceStorage');
    case 'darwin':
      return path.join(home, 'Library', 'Application Support', 'Code', 'User', 'workspaceStorage');
    default:
      return path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), 'Code', 'User', 'workspaceStorage');
  }
}

function decodeWorkspaceFolder(uri) {
  try {
    const decoded = decodeURIComponent(uri.replace(/^file:\/\/\//, ''));
    return process.platform === 'win32' ? decoded.replace(/\//g, '\\') : `/${decoded}`;
  } catch {
    return uri;
  }
}

// ── Normalizer: one chatSessions/*.json → ChatSessionMeta + ChatTurn[] ─────
// Copilot's response[] is a list of typed parts whose vocabulary isn't fully
// enumerable (mcpServersStarting, markdown, tool calls, ...) — pull text out
// of whichever of `value`/`text` a part has, and keep the raw `kind` for
// parts with no text so the UI can still show something for them.
function partsForWire(parts) {
  if (!Array.isArray(parts)) return undefined;
  return parts.map((p) => ({
    kind: typeof p?.kind === 'string' ? p.kind : 'unknown',
    text: typeof p?.value === 'string' ? p.value : typeof p?.text === 'string' ? p.text : undefined,
  }));
}

function partsToText(parts) {
  return (partsForWire(parts) ?? [])
    .map((p) => p.text)
    .filter(Boolean)
    .join('\n');
}

function normalizeCopilotSession(sessionId, workspace, raw) {
  const requests = Array.isArray(raw.requests) ? raw.requests : [];
  const turns = [];
  for (const r of requests) {
    const ts = typeof r.timestamp === 'number' ? r.timestamp : raw.creationDate ?? Date.now();
    const userText = r?.message?.text;
    if (typeof userText === 'string' && userText.length > 0) {
      turns.push({ role: 'user', text: userText, timestamp: ts });
    }
    const parts = partsForWire(r?.response);
    const assistantText = partsToText(r?.response);
    if (assistantText || (parts && parts.length > 0)) {
      turns.push({
        role: 'assistant',
        text: assistantText,
        parts,
        timestamp: ts,
        modelId: typeof r.modelId === 'string' ? r.modelId : undefined,
      });
    }
  }

  const title = raw.customTitle || turns.find((t) => t.role === 'user')?.text?.slice(0, 80) || 'Untitled session';
  const meta = {
    id: `copilot:${sessionId}`,
    source: 'copilot',
    workspace,
    title,
    createdAt: typeof raw.creationDate === 'number' ? raw.creationDate : Date.now(),
    updatedAt: typeof raw.lastMessageDate === 'number' ? raw.lastMessageDate : raw.creationDate ?? Date.now(),
    requestCount: requests.length,
  };
  return { meta, turns };
}

// ── Posting, with retry + a hard stop on revoked/wrong tokens ──────────────
async function postEvent(token, event) {
  const res = await fetch(`${TARGET}/api/chatlink/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(event),
  });
  if (res.status === 401) {
    console.error(`\n[chat-bridge] 401 Unauthorized — this device token is missing or revoked.`);
    console.error(`[chat-bridge] Generate a new one from ${TARGET}/app/sessions and re-run with --token=<token>.\n`);
    process.exit(1);
  }
  if (!res.ok) throw new Error(`POST /api/chatlink/events → ${res.status} ${res.statusText}`);
}

async function postWithRetry(token, event, attempts = 3) {
  for (let i = 0; i < attempts; i++) {
    try {
      await postEvent(token, event);
      return;
    } catch (err) {
      if (i === attempts - 1) {
        console.warn(`[chat-bridge] failed to send ${event.type}: ${err.message}`);
        return;
      }
      await new Promise((r) => setTimeout(r, 300 * (i + 1)));
    }
  }
}

// ── Sync loop ────────────────────────────────────────────────────────────
async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function readJsonTolerant(file) {
  try {
    return await readJson(file);
  } catch {
    // VS Code may be mid-write to this file; give it a moment and retry once.
    await new Promise((r) => setTimeout(r, 200));
    try {
      return await readJson(file);
    } catch {
      return null;
    }
  }
}

async function workspaceLabel(root, hash) {
  const raw = await readJsonTolerant(path.join(root, hash, 'workspace.json'));
  if (raw && typeof raw.folder === 'string') return decodeWorkspaceFolder(raw.folder);
  return hash;
}

async function syncCopilotSessionFile(token, root, hash, file, seen) {
  const full = path.join(root, hash, 'chatSessions', file);
  const raw = await readJsonTolerant(full);
  if (!raw) return;

  const sessionId = raw.sessionId || path.basename(file, '.json');
  const requestCount = Array.isArray(raw.requests) ? raw.requests.length : 0;
  if (requestCount === 0) return; // nothing to show yet

  const key = `${hash}:${sessionId}`;
  if (seen.get(key) === requestCount) return; // unchanged since last sync
  seen.set(key, requestCount);

  const workspace = await workspaceLabel(root, hash);
  const { meta, turns } = normalizeCopilotSession(sessionId, workspace, raw);

  await postWithRetry(token, { type: 'session.upsert', session: meta });
  // Full snapshot rather than a diffed append: simpler and can't drift out of
  // sync with what's actually in the file, at the cost of re-sending turns
  // that haven't changed — chat transcripts are small enough for this to be fine.
  await postWithRetry(token, { type: 'transcript.snapshot', sessionId: meta.id, turns });
}

async function watchCopilot(token) {
  const root = vscodeStorageRoot();
  try {
    await fs.access(root);
  } catch {
    console.warn(`[chat-bridge] VS Code storage not found at ${root} — skipping Copilot watch.`);
    return;
  }

  const seen = new Map();
  const watchedHashes = new Set();
  let debounceTimer = null;

  const syncAll = async () => {
    let hashes;
    try {
      hashes = await fs.readdir(root);
    } catch {
      return;
    }
    await Promise.all(
      hashes.map(async (hash) => {
        const chatDir = path.join(root, hash, 'chatSessions');
        let files;
        try {
          files = await fs.readdir(chatDir);
        } catch {
          return;
        }
        for (const file of files) {
          if (file.endsWith('.json')) await syncCopilotSessionFile(token, root, hash, file, seen);
        }
        if (!watchedHashes.has(hash)) {
          watchedHashes.add(hash);
          try {
            watch(chatDir, { persistent: true }, () => scheduleSync());
          } catch {
            // Directory might disappear between readdir and watch — the
            // periodic poll below still covers it.
          }
        }
      }),
    );
  };

  const scheduleSync = () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      syncAll().catch((err) => console.warn(`[chat-bridge] sync error: ${err.message}`));
    }, WATCH_DEBOUNCE_MS);
  };

  await syncAll();
  console.log(`[chat-bridge] Watching VS Code Copilot chats at ${root}`);

  // fs.watch gives low-latency updates for known directories; a root-level
  // watch plus this steady poll catch new workspace hashes and anything a
  // watcher missed (fs.watch is best-effort on some platforms/filesystems).
  try {
    watch(root, { persistent: true }, () => scheduleSync());
  } catch {
    // Fall back entirely to polling below.
  }
  setInterval(() => {
    syncAll().catch((err) => console.warn(`[chat-bridge] sync error: ${err.message}`));
  }, POLL_INTERVAL_MS).unref();
}

// ── Claude Code (~/.claude/projects/<slug>/<sessionId>.jsonl) ─────────────
// Append-mostly JSONL, tailed by byte offset. Line `type` is one of
// "queue-operation" (skip), "attachment" (skip), or "user"/"assistant" with
// a `message` object in Anthropic message shape; `isSidechain: true` lines
// are sub-agent chatter, not the visible conversation, and are skipped too.
function claudeProjectsRoot() {
  return path.join(os.homedir(), '.claude', 'projects');
}

// Claude Code slugifies cwd by replacing every non-alphanumeric path
// character with "-" (so "C:\Users\x" → "C--Users-x", "/Users/x" →
// "-Users-x"). That's lossy for paths that already contain dashes, so this
// is a best-effort label, not a guaranteed-exact roundtrip; prefer the
// literal `cwd` field parsed from a line when one is available.
function decodeClaudeProjectSlug(slug) {
  if (process.platform === 'win32') {
    const idx = slug.indexOf('--');
    if (idx === -1) return slug.replace(/-/g, '\\');
    return `${slug.slice(0, idx)}:\\${slug.slice(idx + 2).replace(/-/g, '\\')}`;
  }
  return slug.replace(/-/g, '/');
}

function extractClaudeContent(content) {
  if (typeof content === 'string') return { text: content, parts: undefined };
  if (!Array.isArray(content)) return { text: '', parts: undefined };

  const parts = content.map((block) => {
    if (block?.type === 'text' && typeof block.text === 'string') return { kind: 'text', text: block.text };
    if (block?.type === 'tool_use') return { kind: `tool_use:${block.name || 'unknown'}`, text: undefined };
    if (block?.type === 'tool_result') {
      const text =
        typeof block.content === 'string'
          ? block.content
          : Array.isArray(block.content)
            ? block.content
                .map((c) => (typeof c?.text === 'string' ? c.text : ''))
                .filter(Boolean)
                .join('\n')
            : undefined;
      return { kind: 'tool_result', text };
    }
    return { kind: typeof block?.type === 'string' ? block.type : 'unknown', text: undefined };
  });
  const text = parts
    .filter((p) => p.kind === 'text' && p.text)
    .map((p) => p.text)
    .join('\n');
  return { text, parts };
}

function processClaudeLine(raw) {
  let obj;
  try {
    obj = JSON.parse(raw);
  } catch {
    return null; // partial/mid-write line; will be re-read once complete
  }
  if (obj.isSidechain) return null;
  if (obj.type !== 'user' && obj.type !== 'assistant') return null;
  const msg = obj.message;
  if (!msg || (msg.role !== 'user' && msg.role !== 'assistant')) return null;

  const { text, parts } = extractClaudeContent(msg.content);
  if (!text && (!parts || parts.length === 0)) return null;

  const ts = typeof obj.timestamp === 'string' ? Date.parse(obj.timestamp) : Date.now();
  return {
    role: msg.role,
    text: text || '',
    parts,
    timestamp: Number.isFinite(ts) ? ts : Date.now(),
    modelId: typeof msg.model === 'string' ? msg.model : undefined,
    cwd: typeof obj.cwd === 'string' ? obj.cwd : undefined,
    sessionId: typeof obj.sessionId === 'string' ? obj.sessionId : undefined,
  };
}

// Reads only complete (newline-terminated) lines added since `fromOffset`,
// leaving a mid-write trailing partial line for the next pass — the file is
// still being appended to by a live Claude Code session.
async function readNewLines(file, fromOffset) {
  const stat = await fs.stat(file);
  if (stat.size <= fromOffset) return { lines: [], newOffset: fromOffset };

  const fh = await fs.open(file, 'r');
  try {
    const length = stat.size - fromOffset;
    const buf = Buffer.alloc(length);
    await fh.read(buf, 0, length, fromOffset);
    const chunk = buf.toString('utf8');
    const lastNewline = chunk.lastIndexOf('\n');
    if (lastNewline === -1) return { lines: [], newOffset: fromOffset };
    const complete = chunk.slice(0, lastNewline);
    const newOffset = fromOffset + Buffer.byteLength(chunk.slice(0, lastNewline + 1), 'utf8');
    const lines = complete.split('\n').filter((l) => l.length > 0);
    return { lines, newOffset };
  } finally {
    await fh.close();
  }
}

async function syncClaudeFile(token, root, projectDir, file, tailState) {
  const full = path.join(root, projectDir, file);
  const key = `${projectDir}/${file}`;
  let state = tailState.get(key);
  if (!state) {
    state = {
      offset: 0,
      sessionId: path.basename(file, '.jsonl'),
      workspace: decodeClaudeProjectSlug(projectDir),
      title: null,
      turnCount: 0,
      createdAt: null,
      updatedAt: null,
    };
    tailState.set(key, state);
  }

  let lines;
  try {
    ({ lines, newOffset: state.offset } = await readNewLines(full, state.offset));
  } catch {
    return; // file may have been rotated/deleted between readdir and read
  }
  if (lines.length === 0) return;

  const turns = [];
  for (const line of lines) {
    const parsed = processClaudeLine(line);
    if (!parsed) continue;
    if (parsed.sessionId) state.sessionId = parsed.sessionId;
    if (parsed.cwd) state.workspace = parsed.cwd;
    if (!state.title && parsed.role === 'user' && parsed.text) state.title = parsed.text.slice(0, 80);
    if (!state.createdAt) state.createdAt = parsed.timestamp;
    state.updatedAt = parsed.timestamp;
    state.turnCount += 1;
    turns.push({ role: parsed.role, text: parsed.text, parts: parsed.parts, timestamp: parsed.timestamp, modelId: parsed.modelId });
  }
  if (turns.length === 0) return;

  const meta = {
    id: `claude:${state.sessionId}`,
    source: 'claude',
    workspace: state.workspace,
    title: state.title || 'Untitled session',
    createdAt: state.createdAt ?? Date.now(),
    updatedAt: state.updatedAt ?? Date.now(),
    requestCount: state.turnCount,
  };

  await postWithRetry(token, { type: 'session.upsert', session: meta });
  await postWithRetry(token, { type: 'transcript.append', sessionId: meta.id, turns });
}

async function watchClaude(token) {
  const root = claudeProjectsRoot();
  try {
    await fs.access(root);
  } catch {
    console.warn(`[chat-bridge] Claude Code storage not found at ${root} — skipping Claude Code watch.`);
    return;
  }

  const tailState = new Map();
  const watchedDirs = new Set();
  let debounceTimer = null;

  const syncAll = async () => {
    let projectDirs;
    try {
      projectDirs = await fs.readdir(root);
    } catch {
      return;
    }
    await Promise.all(
      projectDirs.map(async (projectDir) => {
        const dir = path.join(root, projectDir);
        let files;
        try {
          files = await fs.readdir(dir);
        } catch {
          return;
        }
        for (const file of files) {
          if (file.endsWith('.jsonl')) await syncClaudeFile(token, root, projectDir, file, tailState);
        }
        if (!watchedDirs.has(dir)) {
          watchedDirs.add(dir);
          try {
            watch(dir, { persistent: true }, () => scheduleSync());
          } catch {
            // Periodic poll below still covers it.
          }
        }
      }),
    );
  };

  const scheduleSync = () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      syncAll().catch((err) => console.warn(`[chat-bridge] claude sync error: ${err.message}`));
    }, WATCH_DEBOUNCE_MS);
  };

  await syncAll();
  console.log(`[chat-bridge] Watching Claude Code sessions at ${root}`);

  try {
    watch(root, { persistent: true }, () => scheduleSync());
  } catch {
    // Fall back entirely to polling below.
  }
  setInterval(() => {
    syncAll().catch((err) => console.warn(`[chat-bridge] claude sync error: ${err.message}`));
  }, POLL_INTERVAL_MS).unref();
}

async function main() {
  const token = await resolveToken();
  if (!token) {
    console.error('[chat-bridge] No device token. Get one from /app/sessions while signed in, then run:');
    console.error('  npm run chat-bridge -- --token=<token>');
    process.exit(1);
  }
  console.log(`[chat-bridge] Target: ${TARGET}`);
  await Promise.all([watchCopilot(token), watchClaude(token)]);
  console.log('[chat-bridge] Running. Ctrl+C to stop.');
}

main().catch((err) => {
  console.error(`[chat-bridge] fatal: ${err.stack || err}`);
  process.exit(1);
});
