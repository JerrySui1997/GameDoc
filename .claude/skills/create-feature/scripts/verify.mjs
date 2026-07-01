#!/usr/bin/env node
// Verification gauntlet for a GameDoc feature.
//
// Runs, in order: dependency sanity, typecheck, production build, and the
// project's data validator (if present). The build step auto-heals the most
// common false failure in this app — a stale `.next` webpack cache that throws
// `Cannot find module './NNN.js'` / ChunkLoadError. That error is almost never
// a code bug; it's an out-of-sync incremental cache, so on detecting it we wipe
// `.next` and retry the build exactly once before treating it as a real failure.
//
// Cross-platform: pure Node, no shell assumptions. Run from the repo root:
//   node .claude/skills/create-feature/scripts/verify.mjs

import { spawnSync } from 'node:child_process';
import { rmSync, existsSync, readFileSync } from 'node:fs';

const root = process.cwd();
const isWin = process.platform === 'win32';
const npm = isWin ? 'npm.cmd' : 'npm';
const npx = isWin ? 'npx.cmd' : 'npx';

function run(cmd, args, label) {
  const line = `${cmd} ${args.join(' ')}`;
  process.stdout.write(`\n▶ ${label}\n  $ ${line}\n`);
  // Pass a single command string under shell:true. The args are static and
  // trusted (no user input), and this avoids Node's DEP0190 warning that fires
  // when an args array is combined with shell:true.
  const res = spawnSync(line, { cwd: root, encoding: 'utf8', shell: true });
  const out = `${res.stdout ?? ''}${res.stderr ?? ''}`;
  process.stdout.write(out);
  return { ok: res.status === 0, out };
}

const CHUNK_ERROR = /Cannot find module '\.\/\d+\.js'|ChunkLoadError|webpack-runtime/i;

function clearNextCache() {
  const dir = `${root}/.next`;
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
    process.stdout.write('  ⚠ Detected webpack chunk error → cleared stale .next cache, retrying once.\n');
    return true;
  }
  return false;
}

const results = [];

// ── 1. Dependency sanity ──────────────────────────────────────────────────
// Confirm declared deps are actually installed at a resolvable version, so the
// feature is verified against real installed APIs rather than assumptions.
{
  let ok = true;
  const detail = [];
  try {
    const pkg = JSON.parse(readFileSync(`${root}/package.json`, 'utf8'));
    for (const name of Object.keys(pkg.dependencies ?? {})) {
      // Read node_modules/<name>/package.json directly. require() can't be used
      // because many packages (e.g. scoped @blocknote/*) don't expose
      // ./package.json in their "exports" map and would throw despite being
      // installed — a false negative. A literal disk path always works.
      const manifest = `${root}/node_modules/${name}/package.json`;
      if (existsSync(manifest)) {
        detail.push(`${name}@${JSON.parse(readFileSync(manifest, 'utf8')).version}`);
      } else {
        ok = false;
        detail.push(`${name}: NOT INSTALLED`);
      }
    }
  } catch (e) {
    ok = false;
    detail.push(`could not read package.json: ${e.message}`);
  }
  process.stdout.write(`\n▶ Dependency sanity\n  ${detail.join('\n  ')}\n`);
  if (!ok) process.stdout.write('  ⚠ Some dependencies are missing — run `npm install`.\n');
  results.push(['Dependency sanity', ok]);
}

// ── 2. Typecheck ──────────────────────────────────────────────────────────
results.push(['Typecheck (tsc --noEmit)', run(npx, ['tsc', '--noEmit'], 'Typecheck').ok]);

// ── 3. Production build (with stale-cache auto-heal) ──────────────────────
{
  let build = run(npm, ['run', 'build'], 'Production build');
  if (!build.ok && CHUNK_ERROR.test(build.out) && clearNextCache()) {
    build = run(npm, ['run', 'build'], 'Production build (retry after cache clear)');
  }
  results.push(['Production build', build.ok]);
}

// ── 4. Project data validator (optional) ──────────────────────────────────
{
  const pkg = JSON.parse(readFileSync(`${root}/package.json`, 'utf8'));
  if (pkg.scripts?.validate) {
    results.push(['Data validation (npm run validate)', run(npm, ['run', 'validate'], 'Data validation').ok]);
  }
}

// ── Leave `.next` clean for the dev server ────────────────────────────────
// `next build` populates `.next` with a PRODUCTION cache. A subsequent
// `next dev` reads that same directory, the webpack chunk hashes don't match,
// and the dev server throws `Cannot find module './NNN.js'`. Since the whole
// point of this gauntlet is to prove the feature works AND leave the project
// runnable, we remove the build cache here so the next `npm run dev` starts
// from a clean slate. Verification already happened — the artifacts are
// disposable.
if (existsSync(`${root}/.next`)) {
  rmSync(`${root}/.next`, { recursive: true, force: true });
  process.stdout.write('\n🧹 Cleared .next build cache so `npm run dev` starts fresh.\n');
}

// ── Summary ────────────────────────────────────────────────────────────────
process.stdout.write('\n────────────── VERIFY SUMMARY ──────────────\n');
let allOk = true;
for (const [label, ok] of results) {
  allOk = allOk && ok;
  process.stdout.write(`${ok ? '✅' : '❌'}  ${label}\n`);
}
process.stdout.write('────────────────────────────────────────────\n');
if (!allOk) {
  process.stdout.write('\nGauntlet FAILED. Read the errors above, fix the cause (do not loosen schemas or suppress types), then re-run.\n');
  process.exit(1);
}
process.stdout.write('\nGauntlet PASSED. Feature verified against installed deps.\n');
