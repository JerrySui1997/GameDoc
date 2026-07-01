---
name: crossref-audit
description: >-
  Audit cross-references between content records. Use for topics related to
  cross-reference, broken link, ID resolution, reference integrity, dependency graph,
  orphan record, audit references, who references, recombines, linked records, dangling ID.
argument-hint: "Record ID to trace (e.g. 't-03'), or 'all' for the full graph"
license: MIT
metadata:
  author: dev-team
  version: "1.0"
compatibility:
  - github-copilot
  - claude-code
  - openai-codex
---

# Cross-Reference Audit

Maps content relationships and finds broken ID references. Every cross-reference in a content record must resolve to an existing record in the same project.

## When to Use
- After adding a record that contains reference fields (e.g. `recombines`, `parentId`, `relatedIds`)
- Before removing or renaming a record — find all records that depend on it first
- To visualize the content dependency graph
- When `npm run crossref` exits with code 1 (broken references found)

## Procedure

### 1. Run the automated check
```bash
npm run crossref
```
This runs `scripts/crossref.ts` via `tsx`. It imports `ALL_NIGHTMARES`, reads each record's `recombines` IDs, and checks each ID against the known set. Exit code 1 = broken reference found.

### 2. Interpret the output
```
[t-01 LOOKUP]    (no references)
[t-07 STALKER]   references: t-03, t-06  ✓
[t-07 STALKER]   BROKEN: t-09 — not found in ALL_NIGHTMARES   ← fix this
⚠ Orphan: t-05 PACK — Tier 2 with no references               ← consider adding
```
- **BROKEN** = hard error: the referenced ID does not exist. Either create the missing record or remove the reference.
- **Orphan warning** = soft warning: a higher-complexity record with no declared foundations. Not a build error, but worth reviewing.

### 3. Fix broken references
- If the target record exists but under a different ID → update the reference field to the correct ID
- If the target record doesn't exist yet → create it, or remove the reference if it was a mistake
- If the referencing record is wrong → update its reference field

### 4. Manual trace — find all records that reference a given ID
Search all data files for the target ID string:
```bash
# Find every record that references t-06
npm run crossref  # already reports this, but for manual search:
rg -n "t-06" src/data
# Fallback if rg is unavailable:
# Select-String -Path src/data/**/*.ts -Pattern "t-06"
```

### 5. Adding cross-reference support to a new domain
Extend `scripts/crossref.ts` to include the new domain's reference fields:
```typescript
// Pattern: for each record, collect all ID fields that are references
for (const record of ALL_<DOMAIN>) {
  const refs = record.relatedIds ?? []; // adapt to actual field(s)
  const broken = refs.filter(r => !allIds.has(r));
  // ... same reporting pattern
}
```

## References
- [ID conventions and stability rules](./references/id-conventions.md)
