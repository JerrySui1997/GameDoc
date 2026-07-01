#!/usr/bin/env node
// Driver for the "create beautiful game design pages" skill.
//
// It is a tiny, zero-dependency MCP client: it spawns the gamedoc MCP server
// over stdio (exactly the command in .mcp.json), speaks JSON-RPC by hand, and
// calls the doc tools. The value it adds over calling the MCP raw is the
// page-spec compiler: a terse high-level block list -> the v2 block JSON the
// website renders as *widgets* (hero banners, card grids, color palettes,
// badges). Passing plain markdown to the MCP only yields plain prose; passing
// this compiled body is how a page becomes beautiful.
//
// Why a separate file instead of the MCP SDK client: the SDK lives in
// mcp/node_modules, which a script under .github/skills/ can't resolve. A raw
// stdio client has no imports and runs from anywhere.
//
// Usage (run from anywhere; paths resolve to the repo root):
//   node driver.mjs list
//   node driver.mjs get <id> [raw]
//   node driver.mjs create <spec.json>
//   node driver.mjs update <spec.json>
//   node driver.mjs delete <id>
//   node driver.mjs demo            # create the built-in showcase page
//
// A spec.json is: { id, title, parentId?, order?, blocks: [ ...block specs ] }
// See compileBody() below for every block spec shape, and SKILL.md for examples.

import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// __dirname = <root>/.github/skills/create-game-design-page -> up 3 = <root>
const ROOT = path.resolve(__dirname, '..', '..', '..');
const SERVER = path.join(ROOT, 'mcp', 'src', 'server.ts');
// Run the tsx CLI already vendored in mcp/node_modules via node directly. This
// avoids npx (no re-download) and avoids spawning a .cmd shim (EINVAL on Win).
const TSX_CLI = path.join(ROOT, 'mcp', 'node_modules', 'tsx', 'dist', 'cli.mjs');

// ── v2 block compiler ────────────────────────────────────────────────────────
// Mirrors src/lib/docs/blocks.ts (PROSE_TYPES / WIDGET_TYPES). Widget prop
// shapes mirror the registry defaults + the *Widgets.tsx components. Tones for
// badges/tags/cards/status come from TONES in src/lib/templates/types.ts; the
// hero uses its own 'dark' | 'light' | 'accent'.

const TONES = ['slate', 'green', 'yellow', 'orange', 'red', 'amber', 'purple', 'sky', 'blue'];
const HERO_TONES = ['dark', 'light', 'accent'];

let seq = 0;
const bid = () => `b-${Date.now().toString(36)}-${(seq++).toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const prose = (type, text) => ({ id: bid(), type, text: String(text ?? '') });
const widget = (type, props) => ({ id: bid(), type, props });

function checkTone(tone, allowed, where) {
  if (tone && !allowed.includes(tone)) {
    throw new Error(`Invalid tone "${tone}" in ${where}. Allowed: ${allowed.join(', ')}.`);
  }
}

/** Compile a terse block spec list into the website's v2 body string. */
export function compileBody(blocks) {
  if (!Array.isArray(blocks)) throw new Error('spec.blocks must be an array');
  const out = [];
  for (const b of blocks) {
    if (typeof b === 'string') { out.push(prose('paragraph', b)); continue; }
    if (!b || typeof b !== 'object') throw new Error(`Bad block: ${JSON.stringify(b)}`);

    if ('h1' in b) out.push(prose('heading1', b.h1));
    else if ('h2' in b) out.push(prose('heading2', b.h2));
    else if ('h3' in b) out.push(prose('heading3', b.h3));
    else if ('p' in b) out.push(prose('paragraph', b.p));
    else if ('quote' in b) out.push(prose('quote', b.quote));
    else if ('code' in b) out.push(prose('code', b.code));
    else if ('bullet' in b) out.push(prose('bullet', b.bullet));
    else if ('numbered' in b) out.push(prose('numbered', b.numbered));
    else if ('ul' in b) for (const t of b.ul) out.push(prose('bullet', t));
    else if ('ol' in b) for (const t of b.ol) out.push(prose('numbered', t));
    else if ('divider' in b) out.push(prose('divider', ''));

    else if ('hero' in b) {
      const h = b.hero;
      checkTone(h.tone, HERO_TONES, 'hero');
      out.push(widget('hero', {
        eyebrow: String(h.eyebrow ?? ''), title: String(h.title ?? ''),
        subtitle: String(h.subtitle ?? ''), tone: h.tone ?? 'dark',
      }));
    }
    else if ('cards' in b) {
      const c = b.cards;
      const items = (c.items ?? []).map((it) => {
        checkTone(it.tone, TONES, 'cards item');
        return { eyebrow: String(it.eyebrow ?? ''), title: String(it.title ?? ''), body: String(it.body ?? ''), tone: it.tone ?? '' };
      });
      const columns = [1, 2, 3].includes(c.columns) ? c.columns : 3;
      out.push(widget('cards', { label: String(c.label ?? ''), columns, cardsJson: JSON.stringify(items) }));
    }
    else if ('swatch' in b) {
      const s = b.swatch;
      const colors = (s.colors ?? []).map((col) => ({ hex: String(col.hex ?? '#888888'), name: String(col.name ?? ''), auto: !col.name }));
      out.push(widget('swatch', { label: String(s.label ?? 'Palette'), swatchesJson: JSON.stringify(colors), overridesJson: '{}' }));
    }
    else if ('badges' in b) {
      const g = b.badges;
      const items = (g.items ?? []).map((it) => {
        checkTone(it.tone, TONES, 'badges item');
        return { label: String(it.label ?? ''), tone: it.tone ?? 'slate' };
      });
      out.push(widget('badges', { label: String(g.label ?? 'Badges'), badgesJson: JSON.stringify(items) }));
    }
    else if ('tags' in b) {
      const g = b.tags;
      checkTone(g.tone, TONES, 'tags');
      out.push(widget('tags', { label: String(g.label ?? 'Tags'), tone: g.tone ?? 'slate', tagsJson: JSON.stringify(g.items ?? []) }));
    }
    else if ('labeled' in b) {
      const l = b.labeled;
      out.push(widget('labeled', { label: String(l.label ?? 'Field'), value: String(l.value ?? ''), highlight: !!l.highlight, multiline: !!l.multiline }));
    }
    else if ('status' in b) {
      const s = b.status;
      checkTone(s.tone, TONES, 'status');
      out.push(widget('statusBadge', { label: String(s.label ?? 'Status'), value: String(s.value ?? ''), tone: s.tone ?? 'slate' }));
    }
    else throw new Error(`Unknown block spec key in ${JSON.stringify(b)}. See compileBody().`);
  }
  if (!out.length) out.push(prose('paragraph', ''));
  return JSON.stringify({ v: 2, blocks: out });
}

// ── Minimal MCP stdio client (JSON-RPC 2.0 over newline-delimited frames) ─────

function mcpCall(tool, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [TSX_CLI, SERVER], {
      cwd: ROOT,
      stdio: ['pipe', 'pipe', 'inherit'], // server logs to stderr; keep it visible
      env: process.env,
    });

    let buf = '';
    const pending = new Map(); // id -> {resolve}
    const send = (msg) => child.stdin.write(JSON.stringify(msg) + '\n');
    let idCounter = 0;
    const request = (method, params) =>
      new Promise((res) => { const id = ++idCounter; pending.set(id, res); send({ jsonrpc: '2.0', id, method, params }); });

    child.stdout.on('data', (chunk) => {
      buf += chunk.toString();
      let nl;
      while ((nl = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        let msg;
        try { msg = JSON.parse(line); } catch { continue; }
        if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
      }
    });

    child.on('error', reject);

    (async () => {
      await request('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'create-game-design-page-driver', version: '1.0.0' },
      });
      send({ jsonrpc: '2.0', method: 'notifications/initialized' });
      const res = await request('tools/call', { name: tool, arguments: args });
      child.stdin.end();
      child.kill();
      if (res.error) return reject(new Error(`MCP error: ${JSON.stringify(res.error)}`));
      const content = res.result?.content?.[0]?.text ?? '';
      if (res.result?.isError) return reject(new Error(`Tool ${tool} failed: ${content}`));
      resolve(content);
    })().catch(reject);
  });
}

// ── Built-in showcase page (exercises every widget) ──────────────────────────

const DEMO = {
  id: 'skill-demo-showcase',
  title: 'Skill Demo — Widget Showcase',
  parentId: null,
  blocks: [
    { hero: { eyebrow: 'Game design · generated by the skill', title: 'Verdant Hollow', subtitle: 'A cozy roguelike about regrowing a poisoned forest.', tone: 'accent' } },
    { badges: { label: 'At a glance', items: [{ label: 'Cozy roguelike', tone: 'green' }, { label: 'Single-player', tone: 'sky' }, { label: 'PC / Switch', tone: 'purple' }] } },
    { h2: 'Pillars' },
    { cards: { label: 'Three pillars', columns: 3, items: [
      { eyebrow: 'Grow', title: 'Living world', body: 'Every cleansed tile permanently changes the biome and unlocks new flora.', tone: 'green' },
      { eyebrow: 'Risk', title: 'One breath of rot', body: 'Push deeper for rare seeds, but the rot spreads while you linger.', tone: 'red' },
      { eyebrow: 'Keep', title: 'Soft failure', body: 'A bad run costs seeds, never progress — the Hollow remembers.', tone: 'amber' },
    ] } },
    { h2: 'Core loop' },
    { ol: ['Scout a rotted grove and read the wind.', 'Plant and defend until the grove turns.', 'Bank seeds at the Heart Tree before the rot returns.'] },
    { labeled: { label: 'Design north star', value: 'Calm hands, tense heart — the player should feel like a gardener, not a soldier.', highlight: true, multiline: true } },
    { h2: 'Palette' },
    { swatch: { label: 'Mood palette', colors: [
      { hex: '#1F3D2B', name: 'Deep Canopy' }, { hex: '#6FA56B', name: 'New Growth' },
      { hex: '#C9A24B', name: 'Pollen Gold' }, { hex: '#8C2E2E', name: 'Rot Red' }, { hex: '#D8E3D0', name: 'Mist' },
    ] } },
    { h2: 'Status' },
    { status: { label: 'Production', value: 'Vertical slice', tone: 'yellow' } },
    { tags: { label: 'References', tone: 'slate', items: ['Spiritfarer', 'Slay the Spire', 'Stardew Valley'] } },
  ],
};

// ── CLI ───────────────────────────────────────────────────────────────────────

function loadSpec(file) {
  const spec = JSON.parse(readFileSync(path.resolve(file), 'utf8'));
  if (!spec.id || !spec.title) throw new Error('spec needs at least { id, title, blocks }');
  return spec;
}

async function main() {
  const [cmd, arg, arg2] = process.argv.slice(2);
  switch (cmd) {
    case 'list':
      process.stdout.write(await mcpCall('gamedoc_list_docs', {}) + '\n');
      break;
    case 'get':
      if (!arg) throw new Error('usage: get <id> [raw]');
      process.stdout.write(await mcpCall('gamedoc_get_doc', { id: arg, format: arg2 === 'raw' ? 'raw' : 'text' }) + '\n');
      break;
    case 'create':
    case 'update': {
      const spec = cmd === 'demo' ? DEMO : loadSpec(arg);
      const body = compileBody(spec.blocks);
      const args = { id: spec.id, title: spec.title, body };
      if (spec.parentId !== undefined) args.parentId = spec.parentId;
      if (spec.order !== undefined) args.order = spec.order;
      const tool = cmd === 'create' ? 'gamedoc_create_doc' : 'gamedoc_update_doc';
      process.stdout.write(await mcpCall(tool, args) + '\n');
      break;
    }
    case 'demo': {
      const body = compileBody(DEMO.blocks);
      process.stdout.write(await mcpCall('gamedoc_create_doc', { id: DEMO.id, title: DEMO.title, body, parentId: DEMO.parentId }) + '\n');
      break;
    }
    case 'delete':
      if (!arg) throw new Error('usage: delete <id>');
      process.stdout.write(await mcpCall('gamedoc_delete_doc', { id: arg }) + '\n');
      break;
    default:
      process.stdout.write('usage: node driver.mjs <list|get|create|update|delete|demo> [args]\n');
      process.exit(cmd ? 1 : 0);
  }
}

main().catch((err) => { console.error(String(err.message || err)); process.exit(1); });
