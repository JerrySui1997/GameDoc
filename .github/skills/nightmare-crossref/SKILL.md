---
name: nightmare-crossref
description: >-
  Audit Nightmare recombination links against current IDs. Use when editing
  `recombines`, renaming IDs, or debugging cross-reference failures in
  `ALL_NIGHTMARES`.
argument-hint: "Nightmare id (e.g. 't-06') or 'all'"
---

# Nightmare Cross-Reference Check

Checks that every `recombines` entry in nightmare records points at a real
nightmare ID.

## Procedure

### 1. Run the audit
```bash
# PowerShell:
npm.cmd run crossref
# Other shells:
npm run crossref
```

### 2. Fix failures
- `BROKEN refs` means one or more IDs in `recombines` do not exist.
- Update the bad ID(s) in the source record under `src/data/nightmares/*.ts`.
- Re-run `crossref` until exit code is `0`.

### 3. Manual trace for one ID
```bash
rg -n "t-06" src/data/nightmares
```

## Architecture notes
- IDs are stable and schema-governed (`^t-\d{2}$` in `src/lib/schema/nightmare.ts`).
- Cross-references use IDs only, never codenames.
