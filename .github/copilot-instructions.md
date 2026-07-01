# Game Design Documentation Site

A **Next.js documentation platform** for structured game design content.
The architecture separates three concerns that must never be mixed:
- **Vocabulary / rules** — controlled enums, enforced by Zod schemas
- **Content** — typed records authored as TypeScript data files
- **Presentation** — generic React components that render any record of a given type

## Tech Stack
- **Framework:** Next.js 15 (App Router), React 19
- **Language:** TypeScript strict mode — `no any`, no implicit types
- **Styling:** Tailwind CSS 4 (utility classes only; no CSS Modules for new work)
- **Schema / Validation:** Zod v3 — schema first, types derived via `z.infer<>`
- **Runtime:** Node.js 24

## Project Structure
```
src/
├── lib/schema/        — Zod schemas + vocabulary constants (single source of truth)
├── data/              — Typed content collections
│   └── <domain>/      — e.g. nightmares/, personas/
│       ├── <id>.ts    — One file per record
│       └── index.ts   — Re-exports ALL_<DOMAIN> array + getById() helper
├── components/        — Reusable React components (one component per concern)
└── app/               — Next.js App Router pages and layouts
scripts/               — Validation and audit CLI scripts
.github/
├── agents/            — Specialist agent personas (qa, frontend, content-architect)
└── skills/            — On-demand procedural skills (schema-validate, crossref-audit)
```

## Core conventions
- **Schema first:** define Zod schema → derive TS types with `z.infer<>`. Never write types by hand.
- **Stable IDs:** every record has a slug-format ID that never changes. Cross-references use IDs, never display names.
- **One generic component:** a single `<EntityCard record={...}>` renders any record of its type. Never hard-code a card for a specific record.
- **Vocabulary as enums:** all controlled-vocabulary values live in `src/lib/schema/vocabulary.ts`. Never hardcode them in components or pages.

## Commands
```bash
npm run dev          # Next.js dev server → http://localhost:3000
npm run build        # Production build — catches import and render errors
npm run typecheck    # tsc --noEmit — zero errors required
npm run validate     # Zod-parse all content records — fix data, never loosen schema
npm run crossref     # Audit all cross-reference IDs for broken links
```

## Code style
- Functions: camelCase · Components/Types: PascalCase · Constants: UPPER_SNAKE_CASE
- Import types with `import type { ... }` when not used as values
- All component props must be explicitly typed

## Current domain: Nightmare creature system
The active content domain is a game creature system with an 8-member evidence vocabulary.
Domain-specific rules (tier composition, Distortion invariant, persona-fixed contract) are documented
in `src/lib/schema/nightmare.ts` (superRefine) and `src/lib/schema/vocabulary.ts`.
Consult those files before editing any nightmare record.
