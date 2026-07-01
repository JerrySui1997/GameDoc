# ID Conventions

Rules for stable record identifiers across all content domains in this project.

## Format
Nightmare IDs are **lowercase slug strings** with the exact format enforced by schema:
```
t-01   t-02   …   t-99
```
Current regex: `^t-\d{2}$` (see `src/lib/schema/nightmare.ts`).

For future domains, define and document a domain-specific format before adding content.

## Stability contract
- Once an ID is assigned to a published record, **it never changes**.
- If a record is retired, its ID is **permanently reserved** — never reassigned to a new record.
- Display names, codenames, and titles may change; IDs do not.

## Why this matters for cross-references
Cross-reference fields store IDs, not display names:
```typescript
recombines: ['t-03', 't-06']   // ✅ stable — survives renames
recombines: ['MEDDLER', 'MIMIC'] // ❌ fragile — breaks on rename
```
Because IDs are stable, any reference survives a rename or restructure without touching the referencing records.

## Cross-reference field naming conventions
Use descriptive field names that make the relationship direction obvious:
- `recombines` — this record reuses/extends lessons from those IDs
- `parentId` — this record is a child of that ID
- `relatedIds` — bidirectional, loose association

## Adding a new domain
When introducing a new content domain:
1. Choose a prefix not already in use (check this file)
2. Document the prefix here
3. Add the domain to `scripts/crossref.ts` so its references are audited

## Current domain prefixes
| Prefix | Domain | Example |
|--------|--------|---------|
| `t-`   | Nightmare skeletons | `t-01` |
