---
name: frontend-preflight
description: >-
  Catch frontend runtime and build errors before handing work back. Use for topics related to
  Next.js runtime error, prompt() is not supported, hydration error, use client, server component,
  webpack module error, __webpack_modules__ is not a function, client/server boundary, React hooks
  rules, pre-commit verification, frontend QA, component error prevention.
argument-hint: "Path(s) of changed components/pages, or 'all' to verify the whole UI"
license: MIT
metadata:
  author: dev-team
  version: "1.0"
compatibility:
  - github-copilot
  - claude-code
  - openai-codex
---

# Frontend Pre-Flight

Verifies React/Next.js changes against the App Router pitfalls that cause runtime errors, then
proves the build is clean. Run this BEFORE reporting any UI change as done — never make the user
discover an avoidable error.

## When to Use
- After creating or editing anything in `src/components/` or `src/app/`
- Before reporting a frontend change complete
- When a runtime error like `prompt() is not supported` or
  `__webpack_modules__[moduleId] is not a function` appears

## Procedure

### 1. Static self-review of the diff
Scan every changed file for these forbidden patterns. Each one is a known runtime error source:

| ❌ Pattern | Why it breaks | ✅ Fix |
|-----------|---------------|--------|
| `window.prompt` / `confirm` / `alert` | Unsupported during Next.js rendering → `prompt() is not supported` | Inline UI state + `src/components/docs/inline.tsx` (`InlinePrompt`, `slugify`) |
| `window` / `document` / `localStorage` at module/render top level | No browser during SSR | Guard in `useEffect` or `typeof window !== 'undefined'` |
| Hook inside `if` / `&&` / ternary / loop | Violates Rules of Hooks | Call all hooks unconditionally at the top |
| State/effect/event/context without `'use client'` | Server components can't use them | Add `'use client'` at file top |
| `fs`/`path`/server-only import in a client component | Server module in the browser bundle | Keep fs access in route handlers / server modules |
| Browser-only library (e.g. BlockNote) imported normally | `'use client'` still SSRs the first render → `window is not defined` at the hook/constructor | Load via `next/dynamic(() => import(...), { ssr: false })` |
| Inline `style={{…}}` | Project rule: Tailwind only | Tailwind utility classes |

Use ripgrep to make the scan exhaustive:
```bash
# from repo root — should return no component hits (comments excluded)
rg -n "window\.(prompt|confirm|alert)" src
# Fallback if rg is unavailable:
# Select-String -Path src/**/*.ts,src/**/*.tsx -Pattern "window\.(prompt|confirm|alert)"
```

### 2. Typecheck
```bash
npm.cmd run typecheck   # must exit 0  (PowerShell here needs npm.cmd, not npm)
```

### 3. Production build — REQUIRED
```bash
npm.cmd run build       # must compile + lint + collect pages with no error
```
`build` catches client/server boundary and render-time errors that `typecheck` misses. A green
`typecheck` is NOT sufficient on its own.

> ⚠️ `build` does NOT execute on-demand dynamic routes (e.g. `/docs/[id]` with no
> `generateStaticParams`). An SSR-only runtime error there (like `window is not defined`) can
> pass the build and only surface at request time — so the route smoke-test below is mandatory.

### 4. Smoke-test touched routes
With `npm.cmd run dev` running:
```bash
curl.exe -s -o NUL -w "%{http_code}\n" http://localhost:3000/<route>
```
Expect `200`. Do this for every route whose runtime behavior changed.

### 5. Stale-cache recovery
If a runtime error like `__webpack_modules__[moduleId] is not a function` appears after adding
routes/providers, the dev `.next` cache is corrupt — not the source:
```bash
# stop the dev server first
cmd /c "rmdir /s /q .next"
npm.cmd run dev
```

## Done criteria
Report complete only when: static scan clean · `typecheck` 0 · `build` clean · touched routes 200.
