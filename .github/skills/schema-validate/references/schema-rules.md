# Schema Business Rules Reference

General rules encoded in Zod schemas via `superRefine`. Apply to **all content domains** in this project.

## Rule 1 — Stable IDs
Every record must have an `id` field in a consistent slug format.
For the current nightmare domain, the enforced format is `^t-\d{2}$`
(e.g. `t-01`). **IDs never change once assigned.** They are the canonical
cross-reference key.

## Rule 2 — Vocabulary fields use enums
Any field drawn from a controlled vocabulary MUST use a Zod enum.
This means a typo can never create a new valid value.
Vocabulary enums live in `src/lib/schema/vocabulary.ts`.

## Rule 3 — Fix data, not schema
If a record fails `safeParse()`, fix the record.
Loosening a `superRefine` constraint to accommodate bad data corrupts the invariants.
The only valid reason to change a `superRefine` rule is when the **design intent** itself changes.

## Rule 4 — Derived types only
TypeScript types are always derived from the Zod schema via `z.infer<typeof Schema>`.
Never write a type manually for a schema-validated entity.

## Domain-specific rules

### Nightmare domain (`src/lib/schema/nightmare.ts`)
- **Tier 1**: exactly 3 evidence, all `reliability: 'reliable'`
- **Tier 2**: 3 reliable + 1 inconsistent — OR — 3 reliable + `haunt: 'Delayed'` (behavioral exception)
- **Tier 3**: must include `Distortion` evidence OR a `variable`/`inconsistent` slot
- **Distortion invariant**: if `signature` implies a false read, `evidence` must include `Distortion`
- Rules extend, never reverse — a Tier 3 reuses everything the player learned in Tiers 1 and 2
