# Plan 04 — Hexel Map: Fix Known Bugs Before Resuming the Stress Test

**Why this plan exists:** Plan 03's Phase 0 discovery already read the whole hexel stack and found a set of bugs that are **deterministic and code-proven** — not hypotheses that need scenario data to confirm. Two of them (feature-scope annotations, tile-delete data loss) sit directly in the path of Phase 2 (Zelda dungeon, key/chest *features*) and Phase 3 (Dishonored block, explicit "tile deletion with cells present" stress). Running those scenarios now would just re-discover bugs we can already cite by file:line, and would attribute confusing "why didn't this work" results to the scenario instead of the known cause. Fix the confirmed bugs first; let Plan 03's remaining phases discover genuinely *new* issues (cross-floor connectivity, canal misclassification, performance ceiling — real unknowns that need real data).

**Scope discipline — what's in vs deferred:**
- **Fix now (this plan):** annotation `scope` handling (feature + relation), `op:'split'`, `notes` surfacing, tile-delete silent data loss. All four are visible from a code read alone; none need a running scenario to prove.
- **Deferred to Plan 03 as-is:** bounds-editing UI + `gamedoc_create_space` MCP tool + raw scene readback (Plan 03 Phase 5/6 — not needed until those phases, since Phase 1's harness authors scenes in code, not through the UI/MCP). Cell-count performance ceiling (needs Phase 5's real load). Cross-floor connectivity, canal/courtyard classification thresholds (genuine unknowns Phase 2/3 are designed to surface — don't pre-solve these, that would defeat the point of the stress test).

**Branch note:** `scripts/hexel-scenarios/` already exists untracked on the current branch (`fix/collections-ux-and-block-drag-overlap`) from Plan 03 Phase 1 work — Plan 03's "fresh branch" instruction wasn't followed yet. Don't fix that here; either commit this work to a new branch off `main` before starting, or continue where the tree already is and branch later. Not this plan's concern beyond flagging it.

---

## Phase 0 — Documentation discovery ✅ (complete; this pass re-verified Plan 03's backlog against current code)

All citations below were re-read live on 2026-07-13, not carried over from the stale Phase 0 write-up.

**Confirmed bug 1 — `op:'split'` is a no-op.** `inferSemantics` (`src/lib/hexel/infer.ts:310-513`) only branches on `ann.op === 'merge'` (:319) and `ann.op === 'confirm'` (`applyAnnotationToSpace`, :518). There is no code path anywhere that reads `'split'`. `AnnotationSchema.op` (`src/lib/hexel/types.ts:107`) and the MCP `gamedoc_annotate_space` tool (`mcp/src/server.ts:349-397`) both accept it silently.

**Confirmed bug 2 — `scope:'feature'` is not just ignored, it's misapplied.** The main annotation loop (`infer.ts:492-505`) never checks `ann.scope` except for the one special case `scope==='relation' && op==='suppress'` (:494). Every other annotation — regardless of scope — falls through to `regionAt(ann.anchor, keyToRegion)` → `applyAnnotationToSpace(sp, ann)` (:501-504). A `scope:'feature'` annotation anchored on a marker cell doesn't touch the `FeatureNode` at all; it silently renames/re-kinds whichever *space* contains that cell.

**Confirmed bug 3 — relation annotations only support `suppress`.** *(New finding, not in Plan 03's original backlog — surfaced by this re-verification.)* The only relation-scoped handling is the suppress branch at `infer.ts:494-500`. There is no `applyAnnotationToRelation` for naming or kinding — `RelationNode` (`infer.ts:61-71`) has `kind`/`why` fields but nothing ever sets them from an annotation. Plan 03 Phase 2's "one `relation` annotation for the boss-door lock" (naming/kinding a lock) has no code path to do that today; only suppressing a relation works.

**Confirmed bug 4 — `Annotation.notes` is dead data end-to-end.** `notes: z.string()` exists on the schema (`types.ts:111`) and round-trips through storage, but: `infer.ts` never reads `ann.notes` anywhere in the annotation-application loop; `summarizeScene` (`src/lib/hexel/scene.ts:28-72`) builds its digest purely from `SemanticGraph` fields, which carry no notes; `describeSpace` (`scene.ts:19-21`) just spreads `inferSemantics()`'s output — no notes anywhere in what an MCP consumer sees.

**Confirmed bug 5 — silent cell loss on tile delete.** `deleteTile` (`src/components/docs/widgets/HexelMap.tsx:346-349`) does `cells: scene.cells.filter((c) => c.t !== id)` with no count shown, no confirmation, no reassignment option. Deleting a palette tile that's in use erases every cell painted with it, immediately, irreversibly (commit is instant via `commit()`). Plan 03 Phase 3 (Dishonored, 15+ tile palette) explicitly plans to exercise this path.

**Anti-pattern guards for this whole plan** (things confirmed *not* to exist — don't invent them): no `layers` array, no per-cell metadata beyond `{x,y,z,t}` (`CellSchema`, `types.ts:86-93`), no free-angle rotation, no existing `applyAnnotationToFeature`/`applyAnnotationToRelation` helpers to extend (they must be created), no `gamedoc_create_space` MCP tool (don't add one here — out of scope, Plan 03 Phase 6's job).

---

## Phase 1 — Annotation scope routing (feature + relation)

**What to implement** in `src/lib/hexel/infer.ts`:
1. Branch the main annotation loop (:492-505) on `ann.scope` before deciding how to apply it, instead of funneling everything through `regionAt`/`applyAnnotationToSpace`:
   - `scope==='space'` → existing `applyAnnotationToSpace` path, unchanged.
   - `scope==='feature'` → resolve the `FeatureNode` at the anchor's exact marker column first, with only a short, unique same-space fallback for legacy nearby anchors, then apply name/kind/confirm/notes to it via a new `applyAnnotationToFeature`.
   - `scope==='relation'` → keep the existing `op==='suppress'` removal (:494-500), and add: if `op !== 'suppress'` and a relation's `at` matches `ann.anchor` (relations from doors have real `at`, :444; "via corridor" relations have `at: null` and are unreachable by anchor — document this as a known, acceptable limitation, not a bug to chase further), apply name/kind/notes via a new `applyAnnotationToRelation`.
2. Mirror the existing `source: 'annotated'` flip pattern (`applyAnnotationToSpace`, :515-520) in both new helper functions.

**Documentation references:** existing pattern to copy from is `applyAnnotationToSpace` (infer.ts:515-520) — same shape (set fields if present, flip `source`), just targeting `FeatureNode`/`RelationNode` instead of `SpaceNode`. Feature construction/dedup: infer.ts:382-407. Relation construction: infer.ts:415-473.

**Verification:** new asserts in `scripts/hexel-selftest.ts` — (a) a `scope:'feature'` annotation renames the feature, not the containing space; (b) a `scope:'relation'` annotation with `kind` set on a door relation's `at` changes that relation's kind and doesn't touch adjacent spaces; (c) existing `scope:'space'` behavior is unchanged (regression). `npm run hexel-test` green.

**Anti-pattern guards:** don't touch `AnnotationSchema` — every field this needs (`scope`, `kind`, `name`, `notes`, `anchor`) already exists. Don't try to make "via corridor" relations (`at: null`) nameable — leave that as a documented gap, not a scope-creep fix.

---

## Phase 2 — Implement `op:'split'`

**What to implement** in `src/lib/hexel/infer.ts`, alongside the existing `merge` handling (:318-341):
1. After segmentation (:312) and merge (:318-341), before space-node construction (:344), process `split` annotations: for each `ann.op==='split'` with both `anchor` and `withAnchor` landing in the *same* region, partition that region's `keys`/`cells` into two new regions using a deterministic two-source BFS from `anchor` and `withAnchor` within the region's existing walkable-column graph (ties broken by anchor's cluster winning, so it's reproducible). This mirrors the union-find region-rebuild pattern already used for merge (:327-338) but going the opposite direction (split one `Region` into two, not two into one).
2. If `anchor`/`withAnchor` don't land in the same region (nothing to split, or already separate), no-op — don't error.
3. Document the exact split rule in a code comment at the point of implementation (per the file's existing style — see the header comment block at infer.ts:1-12) so the algorithm is explainable, matching every other classifier decision in this file.

**Documentation references:** the merge implementation to mirror structurally is infer.ts:318-341 (DSU-based region regrouping); `Region` type at infer.ts:134-138; `regionSeed` at infer.ts:177-183 (each new sub-region needs its own seed for stable ids, same as any other region).

**Verification:** new `hexel-selftest.ts` assert — a single large region with a `split` annotation between two anchors produces two `SpaceNode`s, each containing its respective anchor, cell counts summing to the original region's count. `npm run hexel-test` green.

**Anti-pattern guards:** don't add a new op or field — `op:'split'` and `withAnchor` already exist on `AnnotationSchema` (types.ts:106-108) specifically for this. Don't build interactive split-line UI in the widget — MCP/data-level only, matching Plan 03 Phase 4's original scope note.

---

## Phase 3 — Surface `Annotation.notes`

**What to implement:**
1. In `src/lib/hexel/infer.ts`: add a notes field to `SpaceNode`, `FeatureNode`, and `RelationNode` (the current public graph uses a newline-joined string for compatibility). In `applyAnnotationToSpace` (:515-520) and the two new Phase-1 helpers, append `ann.notes` onto the target's notes when non-empty (don't overwrite — a target can accumulate notes from multiple annotations).
2. In `src/lib/hexel/scene.ts`: `describeSpace` already passes the full graph through (:19-21) so this falls out for free once step 1 lands — no change needed there. In `summarizeScene` (:28-72), append any non-empty space/feature notes to that entity's line (e.g. after the `tail` composition at :56-57) so the searchable digest actually surfaces designer notes.

**Documentation references:** `SpaceNode`/`FeatureNode`/`RelationNode` type definitions infer.ts:30-71; `summarizeScene`'s per-space line construction scene.ts:54-58.

**Verification:** new `hexel-selftest.ts` assert — a `scope:'space'` annotation with `notes:'foo'` produces a `SpaceNode.notes` array containing `'foo'`, and `summarizeScene` output on that scene contains the string `'foo'`. `npm run hexel-test` green.

**Anti-pattern guards:** don't add a `notes` field to `Annotation` — it already exists (types.ts:111) and has for however long; this phase is purely about *reading* it, not storing it differently.

---

## Phase 4 — Fix silent cell loss on tile delete

**What to implement** in `src/components/docs/widgets/HexelMap.tsx`, `deleteTile` (:346-349):
1. Compute `const affected = scene.cells.filter((c) => c.t === id).length` before deleting.
2. If `affected > 0`, require confirmation before proceeding (a lightweight in-widget confirm — this file already manages local UI state for tools/selection, follow its existing state pattern rather than a bare `window.confirm`, to stay consistent with the widget's own UI chrome) that clearly states the count of cells that will be erased.
3. Only clear `cells` for that tile id after confirmation; cancel leaves the palette and cells untouched.

**Documentation references:** `deleteTile` call site and surrounding tile-management UI: HexelMap.tsx:340-349, rendered from the delete button at :470. Follow the file's existing local-state idioms for other confirm-style interactions (inspect this file's existing `useState` calls near the tool palette for the established pattern before adding a new one).

**Verification:** manual browser check (`npm run dev`, open a page with a hexel map, paint a tile, attempt delete, confirm the warning shows the correct count and cancel truly cancels) — this is UI interaction, not something `hexel-test`/`hexel-scenarios` (headless) can assert. Screenshot proof of the confirmation state.

**Anti-pattern guards:** don't silently auto-reassign orphaned cells to another tile — that's a different (also silent) data mutation. The fix is *informed consent*, not a cleverer default. Don't block deletion outright when `affected === 0` — that path should stay instant, unchanged.

---

## Phase 5 — Final verification + reconcile Plan 03

1. Run `npm run hexel-test`, `npm run hexel-scenarios`, `npx tsc --noEmit`.
2. Grep guards: confirm `op ===` handling in `infer.ts` now covers `'merge'`, `'split'`, `'confirm'`, `'suppress'` (all four `ANNOTATION_OPS`); confirm no new fields were added to `AnnotationSchema`/`CellSchema`.
3. Update `plans/03-hexel-stress-test.md`:
   - Phase 4 (Hitman mansion) — strike the "implement split/feature/notes" build items (:96-101); it becomes a verification-only scenario exercising the fixes from this plan under real content, same as Phases 2-3.
   - Phase 3 (Dishonored) — strike the "silent cell loss on tile delete" fix target (:86); note it's fixed, the scenario now just needs to exercise the confirm flow once (not discover the bug).
   - Phase 2 (Zelda) — add a note that the boss-door-lock relation annotation can now be named/kinded per this plan's Phase 1, not just suppressed.
4. Update memory `hexel-editor-feature` with the four fixed capabilities (split, feature/relation-scope annotations, notes surfacing, tile-delete confirmation) so future sessions don't re-flag them as gaps.

### Phase 5 — Results ✅

**Annotation scope routing**: `inferSemantics` now routes `scope:'space'`, `scope:'feature'`, and `scope:'relation'` independently. Feature annotations resolve an exact marker column first and only use a short, unique same-space fallback; relation annotations target painted door relations by anchor, support kind/name/confirm/links/notes, and preserve suppression. The intentional limitation remains that inferred `viaSpaceId` relations have `at:null` and cannot be anchored.

**Split**: `op:'split'` now partitions a same-region pair of anchors with deterministic two-source BFS over the existing 4-neighbour walkable-column graph. Equal distances go to the primary anchor; anchors in different regions and coincident anchors are no-ops. Both halves retain connectivity, stable region reconstruction, and complete cell coverage.

**Notes**: `Annotation.notes` now reaches `SpaceNode`, `FeatureNode`, and `RelationNode`, accumulates in annotation order, and is included in `summarizeScene`; `describeSpace` exposes it automatically because it returns the inferred graph.

**Tile deletion**: deleting a tile with painted cells now opens an in-widget alert dialog with the exact affected count. Cancel leaves the palette and cells unchanged; confirming removes the tile and its cells. Tiles with no painted cells still delete immediately.

**Verification**: `npm run hexel-test` (30/30), `npm run hexel-scenarios` (6/6), root `npm run typecheck`, `cd mcp && npx tsc --noEmit`, `git diff --check`, and `npm run doc-graph` all completed. The doc-graph audit still reports three pre-existing dangling `mentions` references (`drowned-pier`/`tidewashed`) and two orphan pages; no new hexel reference failures were introduced.

---

## Execution order & session boundaries
1 → 2 → 3 → 4 → 5, each sized for one session. Phases 1-3 are all in `infer.ts` and could plausibly be combined into fewer sessions if convenient, but keep them as separate committable units — they're independent fixes with independent regression tests. Phase 4 is UI-only and fully independent of 1-3 (can run in parallel/any order relative to them). Resume Plan 03 at Phase 2 once this plan's Phase 5 lands.
