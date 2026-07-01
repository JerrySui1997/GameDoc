---
name: schema-validate
description: >-
  Validate typed content records against Zod schemas. Use for topics related to
  schema validation, data validation, Zod, safeParse, superRefine, type errors,
  content records, schema conformance, invalid field, failing validation, data integrity.
argument-hint: "Domain to validate (e.g. 'nightmares'), or 'all' for every domain"
license: MIT
metadata:
  author: dev-team
  version: "1.0"
compatibility:
  - github-copilot
  - claude-code
  - openai-codex
---

# Schema Validation

Validates all content records in a domain against their Zod schema and reports every failure with an exact file path and field name.

## When to Use
- After adding or editing any content record in `src/data/`
- When `npm run typecheck` reports type errors originating from data files
- Before committing schema changes to ensure no records regress
- When the QA agent surfaces a `safeParse()` failure

## Procedure

### 1. Run the automated check
```bash
# PowerShell:
npm.cmd run validate
# Other shells:
npm run validate
```
This calls `scripts/validate-nightmares.ts` via `tsx`, which imports
`ALL_NIGHTMARES` and calls `NightmareRecord.safeParse()` on each record.
Exit code 1 = at least one failure.

### 2. Read failures carefully
Each failure line shows the Zod issue path and message:
```
[t-06 MIMIC]  FAIL ✗
  • evidence[3]: Distortion missing 'reliability' field
```
The path (`evidence[3]`) maps directly to the record object — open the file and fix that field.

### 3. Fix in data, not in schema
The Zod schema encodes business rules. If a record fails, fix the **record** to conform — never loosen a `superRefine` rule to make bad data pass.

### 4. Re-run until clean
```bash
npm.cmd run validate   # must exit 0 on PowerShell
npm.cmd run typecheck  # must exit 0 on PowerShell
```

## Adding validation for a new domain
When a new content domain is introduced in `src/data/<domain>/`, add a domain
validator script under `scripts/` following this pattern:
```typescript
// scripts/validate-nightmares.ts pattern — replicate for new domain
import { ALL_<DOMAIN> } from '../src/data/<domain>/index';
import { <DomainSchema> } from '../src/lib/schema/<schema>';

for (const record of ALL_<DOMAIN>) {
  const result = <DomainSchema>.safeParse(record);
  // ... same reporting pattern
}
```

## References
- [Composition and business rules](./references/schema-rules.md)
