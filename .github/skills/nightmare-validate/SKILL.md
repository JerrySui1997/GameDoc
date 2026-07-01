---
name: nightmare-validate
description: >-
  Validate Nightmare records against the active Zod schema and tier invariants.
  Use after any edit in `src/data/nightmares/` or `src/lib/schema/nightmare.ts`.
argument-hint: "Nightmare id (e.g. 't-03') or 'all'"
---

# Nightmare Schema Validation

Validates each record in `ALL_NIGHTMARES` using `NightmareRecord.safeParse()`.

## Procedure

### 1. Run validation
```bash
# PowerShell:
npm.cmd run validate
# Other shells:
npm run validate
```

### 2. Fix data-level failures
- Keep schema invariants strict; fix data in `src/data/nightmares/*.ts`.
- Typical failures include wrong `id` format, invalid evidence mix per tier,
  or Distortion invariant violations.

### 3. Re-check before done
```bash
npm.cmd run validate
npm.cmd run typecheck
```

## Architecture notes
- Source schema: `src/lib/schema/nightmare.ts`
- Vocabulary source of truth: `src/lib/schema/vocabulary.ts`
- Data source: `src/data/nightmares/index.ts`
