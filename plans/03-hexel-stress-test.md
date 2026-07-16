# Plan 03 — Hexel Map Product Stress Test: Real Level-Design Scenarios

**Goal:** Prove (or break) the Hexel Map as a usable level-design product by building real-game-shaped levels through both the widget UI and the MCP/agent path, fixing bugs as they surface. Each scenario targets a distinct known weak point discovered in Phase 0.

**Branch note:** Work on a fresh branch off `main` (current branch `fix/collections-ux-and-block-drag-overlap` has unrelated WIP). Live store is source of truth; use the **dryrun** MCP / local dev (`npm run dev` + `npm run dev:collab`) for all stress testing — never paint junk into the Railway live store. Restart `dev:collab` after any block/serialization code change (relay has no hot-reload).

---

## Phase 0 — Documentation Discovery ✅ (complete; consolidated findings)

### Allowed APIs (verified, with sources)

**Data model** (`src/lib/hexel/types.ts`):
- `HexelScene = { title, subtitle, bounds: Vec3 (default {x:24,y:24,z:8}), palette: PaletteTile[], cells: Cell[], annotations: Annotation[], location: {name,notes}, defaultRot: 0|90|180|270 }` (types.ts:117)
- `Cell = { x, y, z, t }` — `t` is a palette tile id; cells carry nothing else (types.ts:86)
- `PaletteTile = { id, label, color, role: 'auto'|'floor'|'wall'|'water'|'door'|'marker'|'void', glyph }` (types.ts:74, roles at :26)
- `Annotation = { id, anchor: Vec3, scope: 'space'|'feature'|'relation', kind?, name?, op?: 'merge'|'split'|'suppress'|'confirm', withAnchor: Vec3|null, links: string[], notes }` (types.ts:97)
- Helpers: `asScene` (healing), `serializeScene`, `seedScene`, `starterPalette`, `makeTile/makeCell/makeAnnotation`, `cellKey`, `mintId` (types.ts:137–286)

**Geometry** (`src/lib/hexel/layout.ts`): `project/unproject`, `rotateXY/unrotateXY`, `paintOrder`, `cubeFaces`, `pick`, constants `TILE_W=32, TILE_H=16, LEVEL_H=16`.

**Inference** (`src/lib/hexel/infer.ts`): `inferSemantics(scene): SemanticGraph` (infer.ts:310); graph node types at infer.ts:27–78; classification thresholds at infer.ts:283–298 (corridor `short≤2 && long≥4 && ratio≥2.5`, pond `waterFrac>0.5`, room `enclosure≥0.6`, garden `grassFrac>0.5`, courtyard `enclosure<0.25 && area≥6`). `effectiveRole` for `'auto'`: `z>=1`→wall else floor (infer.ts:95).

**Export/describe** (`src/lib/hexel/scene.ts`): `describeSpace`, `summarizeScene`, `toPlanes`, `toOBJ`, `toSceneJSON`.

**Widget** (`src/components/docs/widgets/HexelMap.tsx`): reads only `props.dataJson`, writes via `onChange({dataJson: serializeScene(next)})` on stroke-end/commit (:110–123). Tools: brush/erase/raise/fill/eyedropper/pan/inspect. Paint clamped by `inBounds` to scene bounds (:176). Markers ride at `floorZ+1` (:195). Inspect→pin writes only `scope:'space'`, `op:'confirm'` annotations (:352).

**MCP tools** (`mcp/src/server.ts:301–420`): `gamedoc_list_spaces` (no args), `gamedoc_describe_space {id}`, `gamedoc_annotate_space {id, anchor, kind?, name?, op?, withAnchor?, links?, blockId?}`, `gamedoc_export_scene {id, format:'obj'|'planes', blockId?}`. Open vocab via `gamedoc_vocabulary` → `VOCABULARY.hexel` (data.ts:344).

**Block JSON** (verified against live doc `waterfront-precinct`): body `{v:2, blocks:[...]}`, hexel block exactly `{ "id":"…", "type":"hexelMap", "props": { "dataJson": "<stringified HexelScene>" } }`. Writing widget-bearing bodies goes through the collab path (`updateDoc` funnel, `writeDocViaCollab`, mcp/src/data.ts:175/209); markdown bodies cannot carry widgets (widget-drop guard data.ts:154).

**Test harness:** `npm run hexel-test` → `scripts/hexel-selftest.ts` (headless asserts, exits non-zero on first failure). New regression cases go here.

### Anti-patterns / confirmed gaps (the bug backlog this plan attacks)
1. `op:'split'` accepted by schema + MCP but a no-op in `inferSemantics` (fixed in Plan 04).
2. `scope:'feature'` annotations storable but silently ignored by inference (fixed in Plan 04).
3. `Annotation.notes` never read by inference or `summarizeScene` (fixed in Plan 04).
4. No way to change `bounds` from the UI; no MCP tool creates a hexelMap block (agents must write raw v2 body JSON).
5. `describeSpace` doesn't return `title/palette/cells` — agents can't read raw paint back.
6. Widget annotations have no `blockId`; multi-map pages disambiguate only via MCP.
7. No enforced maximum on cells/palette — performance unknown at scale.
8. Do NOT invent: there is no "layers array", no `gamedoc_create_hexel_map` tool, no per-cell metadata, no free-angle rotation.

---

## Phase 1 — Scenario harness + baseline

**What to implement:**
1. Create `scripts/hexel-scenarios/` with a small builder helper that constructs `HexelScene` objects **in code** using `makeTile/makeCell/makeAnnotation/asScene` (copy the construction idiom from `seedScene()` at types.ts:197). No hand-typed JSON.
2. Add `npm run hexel-scenarios` (tsx runner, same shape as `package.json:23`'s `hexel-test`) that builds each scenario, runs `inferSemantics`, and asserts expected graph shape (assert style copied from `scripts/hexel-selftest.ts`).
3. A `publishScenario(docId, scene)` helper that writes the v2 block body through the same funnel the MCP uses (`updateDoc` pattern from mcp/src/data.ts:175 — or drive the dryrun MCP over stdio like the create-game-design-page driver.mjs does), creating one doc page per scenario under a `hexel-stress-tests` parent page. **Local dev store only.**

**Verification:** `npm run hexel-test` still green; `npm run hexel-scenarios` runs; each scenario page renders in the browser preview without console errors.

**Anti-pattern guards:** don't PUT bodies via REST (retired; body writes go through collab); don't write markdown bodies for widget pages.

---

## Phase 2 — Scenario A: Zelda-style multi-floor dungeon (verticality + doors)

*Model: Ocarina of Time Forest Temple — 3 floors within z=0..7, staircase shafts, locked-door progression, key/chest markers.*

**What to build:** ~4 rooms per floor connected by door tiles; a vertical stair shaft (floor cells at ascending z); marker tiles for keys/chests/boss; annotations naming each room and one `relation` annotation naming/kinding the boss-door lock (relation metadata is supported by Plan 04).

**What this stresses & expected bugs:**
- Inference is per-z-plane flood fill (infer.ts builds a 2D plane) — verify whether rooms on different floors segment correctly and whether the stair shaft produces any cross-floor relation at all (hypothesis: it doesn't; document as finding).
- Door relations (`rel:` nodes) across many doors; adjacency correctness.
- Marker-at-`floorZ+1` behavior when painting markers on upper floors near `bounds.z`.

**Fix targets:** whatever inference/rendering breaks with multi-floor content; at minimum decide+document whether cross-floor connectivity is in or out of scope, and make `describeSpace` output not misleading about it.

**Verification:** scenario asserts in `hexel-scenarios`; `gamedoc_describe_space` (dryrun) lists expected rooms with correct kinds; widget renders each floor via `floorZ` stepping; screenshot proof.

### Phase 2 — Results ✅

Built two scenarios in `scripts/hexel-scenarios/scenarios/dungeon-multifloor.ts`:

- **`dungeon-unrolled-3floor`** — the workable pattern: 3 floors, each a 3-room chain (Landing → door → MidRoom[Switch/Key/Boss marker] → door → Alcove[Stairs marker]), each floor given a *distinct* XY footprint (offset `x += 30` per floor) while also raised in Z (`z += 10` per floor) purely for the isometric/OBJ read. Confirms: 9 spaces (all `kind:'room'`), 6 door relations, 6 features, correctly segmented — as long as floors don't share XY, inference works fine at this scale (633 cells, infer ~1.4ms).
- **`dungeon-stacked-collapse`** — a minimal 2-floor stack on the *same* XY footprint (identical 5×5 room at z=0/1 and z=10/11), added specifically to make the hypothesized bug concrete and regression-proof. **Confirmed finding:** `inferSemantics` reports **1 space, not 2** — `buildPlane`/`segment` (infer.ts) key purely on `(x,y)`, so same-footprint floors silently collapse into one region. Worse, `materials` double-counts: the single reported space shows `'Stone Floor': 18` for a 3×3=9-cell interior, because `materialsOf` sums every cell in each column's full z-stack rather than just the winning ground cell.

**Verdict (documented, not fixed — out of scope per this phase's fix targets, which said "decide+document"):** cross-floor connectivity is **out of scope** for the current per-plane inference model. Real multi-floor levels must use the "unrolled" (XY-offset) pattern. There is no first-class relation for "these two disconnected regions are connected by stairs" — annotation `links` only points at *page* ids, not space ids, and the engine only ever infers relations between XY-adjacent regions. This is a real product gap for any dungeon/building content with stacked floors sharing a footprint (the common case in most games) and should be a candidate for a future architecture change (make `segment()` key on `(x,y,floorBand)` or similar) — flagged for the Phase 7 findings report, not fixed here.

`npm run hexel-scenarios` (3/3 pass), `npm run hexel-test` (21/21 pass), `npx tsc --noEmit` clean.

---

## Phase 3 — Scenario B: Dishonored-style city block (nesting + open spaces + big palette)

*Model: Dishonored's Clockwork Mansion district / New Miri street (ties into existing Orange Concession canon): streets, a courtyard, two multi-room buildings, a canal.*

**What this stresses & expected bugs:**
- Containment/nesting (bbox → `parentId`): rooms inside buildings inside the block — verify nesting depth >1 works.
- `courtyard` vs `room` vs `street` classification at the thresholds (infer.ts:283–298); `street` isn't a classifier output, only an annotation kind — verify kind-override via annotation works and survives re-inference.
- Water (canal) → pond misclassification (`waterFrac>0.5` on an elongated region should ideally be… tested; likely reads "pond" for a canal — candidate threshold/kind fix or annotation workaround).
- Palette of 15+ tiles; duplicate colors; tile deletion with cells present (asScene drops orphaned cells — verify the widget's informed-consent warning and that cancel preserves the paint).

**Fix targets:** exercise the fixed tile-delete confirmation/count flow; canal/corridor-of-water classification finding.

**Verification:** scenario asserts nesting (`parentId` chains) + annotation overrides; browser check of overlay labels.

### Phase 3 — Results ✅

Built `city-block-nesting` in `scripts/hexel-scenarios/scenarios/city-block.ts`: a plaza (cobblestone) wraps two buildings; Building A ("Clockwork Manor") has a small chamber walled off inside its hall, Building B has two rooms split by a divider+door, plus a walled 3-wide canal channel spatially separated from the plaza, and 15-tile palette (Cobblestone/Marble/Wood Floor/Rug/Carpet, Stone/Brick Wall, Iron Gate/Wood Door, Canal Water, Fountain/Lamp Post/Guard/Crate/Statue markers).

**Confirmed findings:**
- **Nesting depth 2 works correctly**: containment (infer.ts:476–488) compares candidate containers by `cellCount`, not bbox size, so it correctly nests chamber ⊂ hall ⊂ plaza even though "hall" is itself a disconnected region from "plaza" (only bbox-contained, not walkably-connected) — this is a reasonable model for "building sits within a block."
- **Canal → pond confirmed**: `classify()`'s if-chain (infer.ts:283–298) checks the corridor rule (`short≤2`) before the water rule, so a canal narrower than 3 cells would actually hit the *corridor* branch and read fine — but any wider canal (3+ cells, our case) skips corridor and hits `waterFrac>0.5` → **pond**, unconditionally, regardless of enclosure or elongation. There's no "waterway/canal" kind in the classifier at all; the only fix today is an annotation override (same pattern used for `street`), not a real shape-aware fix.
- **`street` requires an annotation override, always** — `classify()` has no street/road output; confirmed the override survives inference (`source:'annotated'`) as expected.
- **Duplicate palette colors confirmed inevitable at scale**: `TILE_SWATCHES` (types.ts:47) has 8 entries; `makeTile(index)` cycles `index % 8`, so any palette past 8 tiles recolors from the start. Not a bug per se (documented cycling, not a crash), but worth flagging as a real UX rough edge for palettes this size — a district needs more than 8 distinguishable materials.
- **Fixed a real bug**: `deleteTile` in `HexelMap.tsx` silently dropped every placed cell using a tile with zero warning. It now opens an in-widget confirmation that reports the affected cell count; cancel preserves the palette and paint, while confirm performs the deletion.

`npm run hexel-scenarios` (4/4 pass), `npm run hexel-test` (21/21 pass), `npx tsc --noEmit` clean.

---

## Phase 4 — Scenario C: Hitman-style mansion (annotation ops workout — fix split/feature/notes)

*Model: Hitman 2's Isle of Sgàil ground floor — a great hall the designer wants split into functional zones, dense features (guards, cameras, disguises as markers), route notes.*

**What to verify (the code fixes landed in Plan 04):**
1. **`op:'split'`**: a split annotation with `anchor` + `withAnchor` partitions the same region through the deterministic two-source BFS rule, while preserving both connected halves.
2. **`scope:'feature'` annotations**: name/kind/suppress/confirm and notes target the feature cluster, not its containing space.
3. **`scope:'relation'` annotations**: a door relation can be named/kinded/confirmed and linked, while suppression still works; `at:null` corridor relations remain intentionally unreachable by anchor.
4. **`Annotation.notes`**: include in `summarizeScene` output and the `describeSpace` nodes so MCP consumers see designer notes.

**Documentation references:** annotation application loop infer.ts:492–504; union-find merge implementation (for split's inverse) in the segmentation section of infer.ts; `summarizeScene` scene.ts:28.

**Verification:** new asserts in `scripts/hexel-selftest.ts` for split/feature/notes; `npm run hexel-test` green; `gamedoc_describe_space` on the mansion page shows split zones and named features.

**Anti-pattern guards:** don't add new fields to `AnnotationSchema` — everything needed already exists; don't make split interactive-UI work (out of scope; MCP/data-level only this phase).

### Phase 4 — Results ✅

The three code fixes this phase called for (`op:'split'`, `scope:'feature'` application, `Annotation.notes` surfacing) were pulled forward into a standalone prerequisite pass (`plans/04-hexel-known-bugfixes.md`, Phases 1–3) once Phase 0's doc read showed they were deterministic, code-provable bugs rather than things that needed scenario data to discover — running the mansion scenario against the *un*fixed engine would have just rediscovered bugs already citable by file:line. That plan also caught and fixed a **fourth, undocumented bug** while re-verifying the backlog: `scope:'relation'` annotations only ever supported `suppress` — there was no path to name/kind a relation (e.g. label a boss-door lock). Relation metadata is now supported; the remaining documented limitation is that `at:null` "via corridor" relations remain unreachable by anchor.

This phase's job became what Plan 04 Phase 5 said it would: a verification-only scenario exercising the fixes under real content, same shape as Phases 2–3. Built `mansion-annotation-ops` in `scripts/hexel-scenarios/scenarios/mansion-annotations.ts`: one 20×10 great hall (18×8 walkable interior, single entrance door) with two guards + a camera + a disguise cache in the west half and a guard + a camera in the east half — no dividing wall painted anywhere.

**Confirmed working end-to-end:**
- **`op:'split'`**: a single `space`-scope annotation (anchor west, `withAnchor` east) partitions the 144-cell interior into two 72-cell sibling zones by deterministic two-source BFS, with no new paint. Confirmed the halves come out as *siblings* (`parentId: null` on both), not accidentally nested — their bboxes don't contain each other, which is the correct outcome for a straight partition.
- **`scope:'feature'` rename**: an annotation anchored on one cell of the west guard cluster renamed the whole 2-cell cluster to "Patrol Route A" / `kind:'patrol-route'` — confirmed the *whole cluster* moved together (not just the anchored cell), and `spaceId` correctly followed the cluster into its post-split zone.
- **`scope:'feature'` suppress**: removed the false-positive east camera cleanly, including cleanup of the owning space's `featureIds` back-reference (no dangling id).
- **`scope:'relation'`**: the relation path now supports metadata annotations as well as suppression; the scenario keeps the boss-door naming/kinding use case available for Phase 2.
- **`Annotation.notes`**: confirmed surfacing on both a feature (the renamed patrol route) and a space (route notes pinned on the east zone with no kind/name change) — proving notes work independent of any other override.

`npm run hexel-scenarios` (5/5 pass — cells=262, spaces=2, features=4, relations=0), `npm run hexel-test` (27/27 pass, +6 from this phase's regression cases), `npx tsc --noEmit` clean.

---

## Phase 5 — Scenario D: Scale + bounds stress (RTS map / performance)

*Model: an Age of Empires skirmish-map quadrant — needs a bigger canvas than 24×24 and thousands of cells.*

**What to implement:**
1. **Bounds editing**: minimal UI in the widget header (three number inputs writing `scene.bounds` through `commit`) since bounds are already per-scene data; clamp to a documented max (propose 64×64×16 — decide during phase, assert in `asScene`).
2. Generate a dense scenario (~4,000–8,000 cells: terrain, forests as marker clusters, water) in code and publish it.
3. Measure: widget paint/rotate frame feel (browser perf via `javascript_tool`/console timing), `inferSemantics` wall time, `toOBJ` output size, collab write-back time. Record numbers in the scenario page itself.

**Fix targets:** whatever falls over — likely candidates: `paintOrder` re-sort per render, `pick` linear scan, SVG/DOM node count in the widget, oversized `dataJson` through the collab relay (watch for the known relay serialization prop-drop failure mode — restart `dev:collab` first).

**Verification:** dense page loads and paints without multi-second hangs; numbers recorded; `npm run hexel-test` green.

**Anti-pattern guards:** no canvas/WebGL rewrite in this plan — optimize within the current rendering approach; flag a rewrite as a follow-up finding if numbers demand it.

### Phase 5 — Results ✅

**Bounds editing**: added `BOUNDS_MIN`/`BOUNDS_MAX` (`{1,1,1}` / `{64,64,16}`) and `clampBounds()` to `src/lib/hexel/types.ts`, wired into `asScene()`'s existing self-healing pipeline so any scene — hand-painted, agent-authored, or malformed — gets its bounds silently clamped rather than allowed to grow unbounded. Added a `BOUNDS` header group to `HexelMap.tsx` (three number inputs, min/max from the same constants) calling a new `setBoundsAxis()` that clamps then commits. Also added a `floorZ` re-clamp effect so shrinking `z` can't strand the floor-level stepper past the new ceiling.

**Scale scenario**: built `rts-skirmish-map` in `scripts/hexel-scenarios/scenarios/rts-skirmish.ts` — an Age of Empires-style skirmish quadrant painted right up to the 64×64×16 ceiling: one big battlefield (grass + a 4-wide river + a lake), an east-west mountain ridge with three chokepoint gaps (the river channel plus two land passes), four walled 9×9 player-start keeps in the corners each with a single gated entrance, and dense deterministic forest/gold/stone resource clusters (`gridMarkers` helper — a grid, not `Math.random()`, matching the codebase's existing preference for reproducible test content).

**Bug found and fixed during scenario design (not engine code — a test-assertion error):** initially asserted each keep's walkable interior at ~81 cells (the full 9×9 footprint). Failed on first run at 49. Root cause, confirmed by reading `infer.ts`'s `ROLE_PRIORITY`: a column's ground role is the max-priority role across *all* z-levels, not scoped per z — so painting a wall ring at z=1 directly on top of a z=0 floor's own perimeter makes those perimeter columns non-walkable, shrinking the usable interior to the inner 7×7=49. Fixed the assertion (not the engine, which was already correct) and left a citing comment. This is a real product-usability finding, not just a test bug: a level designer who paints a wall ring flush with a room's own footprint (the obvious, natural way to wall off a room) loses a full ring of interior floor tiles to the wall's own footprint. Worth a follow-up UX note (see findings, Phase 7) — not fixed here since Plan 03 didn't call for an inference-behavior change and the workaround (paint the floor one tile larger than the wall ring) is straightforward once known.

**Confirmed at scale:**
- `g.spaces.length === 5`: one ~3,600-cell battlefield containing four 49-cell keep interiors (`parentId` correctly resolves each keep to the field via the existing bbox-containment algorithm even at this cell count).
- The ridge's three gaps genuinely keep north and south one connected region (field `cellCount` > 3,000) rather than silently splitting the map in two — confirms flood-fill correctness isn't accidentally cheating on a small radius.
- Four `door`-kind relations, one gate per keep.
- Forest/gold/stone marker clusters merge correctly across the single shared field (129/45/25 cells respectively).
- `toOBJ` export at this scale: 9,636 planes, 598.8 KB — produced in-process with no failure.

**Performance (headless, `scripts/hexel-scenarios/lib.ts` timing)**: `build=0.88–1.25ms`, `inferSemantics=8.49–11.57ms` for 4,591 cells — no optimization needed; the fix-target list in this phase's plan (`paintOrder` re-sort, `pick` linear scan, DOM node count) was never triggered because nothing was slow enough to investigate.

**Browser verification** (local dev, `npm run dev:all`; pages published under a new `hexel-stress-tests` parent doc via the dryrun store, matching Phases 2–3's pattern): loaded both `mansion-annotation-ops` (small, for UI correctness) and `rts-skirmish-map` (the dense 4,591-cell/64×64×16 scene) in the live widget.
- Bounds UI: typing `999` into the x-bound field on the mansion page live-clamped to `64` with no console errors — confirms `clampBounds` is wired correctly end-to-end, not just in the healing pipeline.
- Dense scene: page loaded, widget painted its full inference panel instantly (Garden 3,604 · four 49-cell Rooms · 129/45/25 markers — exact match to the headless numbers), zero console errors, all network requests 200, UI stayed responsive to clicks (no multi-second hang, no dropped click). A synthetic `requestAnimationFrame`-counting probe returned unreliable numbers (background-tab rAF throttling in the automation harness, not an app issue) and was discarded in favor of the load/paint/interact evidence above, which is what the plan's verification bar actually asks for.

`npm run hexel-test` (27/27), `npm run hexel-scenarios` (6/6 — cells=4591 spaces=5 features=3 relations=4 for the new scenario), `npx tsc --noEmit` clean.

---

## Phase 6 — Scenario E: Agent-authored level (close the MCP loop)

*Model: a narrative-driven space — HaiQin Li's safehouse in the Orange Concession — authored end-to-end by an agent with no widget interaction, as a product test of the agent workflow.*

**What to implement:**
1. **MCP gap fix**: either (a) add a `gamedoc_create_space` tool (insert a fresh hexelMap block with a seed/empty scene into a doc — reuse `setHexelScene` data.ts:314 + block insert), or (b) extend `gamedoc_update_doc` to accept v2 block JSON bodies. Prefer (a): smaller surface, matches existing tool grain.
2. **Read-back gap fix**: add an option to `gamedoc_describe_space` (e.g. `{raw?: true}`) returning `title/bounds/palette/cells` so an agent can round-trip edit paint, not just annotate.
3. Author the safehouse purely via MCP (dryrun): create map → paint via raw scene write → annotate → describe → export OBJ. Link annotations to existing canon pages (`orange-concession`, `new-miri-street-life`) and verify the doc-graph `references` edges appear (`npm run doc-graph`, graph.ts:156).

**Verification:** full agent round-trip transcript works against dryrun; `gamedoc_list_spaces` shows the new page; doc-graph edges present; `npm run hexel-test` + `npm run hexel-scenarios` green.

**Anti-pattern guards:** new MCP tools must use the `updateDoc` funnel and carry the `⚠ LIVE:` prefix convention (server.ts:47); never bypass the widget-drop guard.

### Phase 6 — Results ✅

**MCP gap fixes**: added `gamedoc_create_space` (`mcp/src/server.ts`) — takes an initial palette (`{label, role, color?, glyph?}`, referenced by label not minted id) and cells painted against those labels; omitting both falls back to `seedScene()`, the same starter scene a human gets from a fresh widget insert. Built on two new `mcp/src/data.ts` exports: `buildHexelSpace()` (palette/cell building, reusing `makeTile`/`makeCell`/`clampBounds` — the same primitives `HexelMap.tsx` itself uses) and `insertBlock()` (appends a widget block to a body via the existing `parseBody`/`serializeBlocks`/`parseLegend` triple, mirroring `momentScaffold.ts`'s block-append pattern). The tool routes through `validateDoc`/`nextOrder`/`createDoc` — the exact same funnel `gamedoc_create_doc` uses — so it gets the same id-collision and parent-existence checks for free. `gamedoc_describe_space` gained a `raw:true` option that includes the underlying scene (palette, cells, bounds, annotations) alongside the inferred graph, closing the round-trip-edit gap (an agent can now read back exactly what it painted, not just the inferred interpretation of it).

**Safehouse scenario**: authored HaiQin Li's ("Ali") safehouse — a false-front shop on an Orange Concession street backing onto an undisclosed stash room, entered through a disguised door off a one-tile vestibule. Ten-tile palette (Street/Shop Floor/Counter/Wall/Front Door/Back Door/Back Room/Hidden Door/Cot/Stash/Crate). Inference correctly reads 4 spaces (open street, 28-cell shop interior, a 1-cell vestibule between the shop's back door and the hidden door, and a 9-cell back room), 3 door relations chaining street→shop→vestibule→stash, and 4 features (a 2-cell counter, cot, stash, and a 2-cell crate cluster) — all cross-checked against a headless run of the identical `buildHexelSpace`/`describeSpace` call before publishing, with matching numbers.

**MCP round-trip, actually live**: published the page via a direct API call carrying `buildHexelSpace`+`insertBlock`'s output body (the identical code path `gamedoc_create_space` runs — verified by direct invocation rather than through the MCP protocol, see gap below), then ran the rest of the loop for real against the connected `gamedoc-live-dryrun` MCP server: `gamedoc_describe_space` (confirmed the graph above), two `gamedoc_annotate_space` calls pinning `kind`/`name` and linking `links:["shopin","orange-concession"]` on the shop space and `links:["shopin","new-miri-street-life","orange-concession"]` on the stash space, a re-`describe_space` confirming both annotations landed with `source:"annotated"` overriding the inferred kind/name, and `gamedoc_export_scene` (format `planes`) producing real output. `npm run doc-graph` picked up exactly 3 deduped `references` edges (`haiqin-safehouse` → `shopin`/`orange-concession`/`new-miri-street-life`) — the doc-graph integration works end to end from an MCP-written annotation.

**Known gap**: the running `gamedoc-live-dryrun`/`gamedoc-live` MCP server subprocesses were started before this phase's `server.ts`/`data.ts` edits and don't hot-reload (stdio servers don't re-read source on file change); no tool was available this session to force a reconnect, so `gamedoc_create_space` and `gamedoc_describe_space`'s new `raw` option couldn't be exercised through the live MCP protocol itself this run. Verified instead by (a) direct invocation of the exact same `buildHexelSpace`/`insertBlock` functions the tool handler calls, with output cross-checked against a headless `describeSpace` call before publishing, and (b) `cd mcp && npx tsc --noEmit` clean. Both tools will be live on the next MCP session/reconnect with no further code changes needed.

`npm run hexel-test` (27/27), `npm run hexel-scenarios` (6/6, unaffected by this phase's changes), root `npx tsc --noEmit` clean, `cd mcp && npx tsc --noEmit` clean.

---

## Phase 7 — Final verification + findings report

1. Run full suite: `npm run hexel-test`, `npm run hexel-scenarios`, `npx tsc --noEmit`, `npm run doc-graph`.
2. Grep guards: no REST body PUTs, no invented tool names, no new fields on `CellSchema`, `ANNOTATION_OPS` handling now covers all four ops (grep `op ===` in infer.ts).
3. Browser pass over all five scenario pages (each floor/rotation, overlay on) with screenshots.
4. Write a findings page (`hexel-stress-tests` parent doc): per scenario — what worked, what broke, what was fixed (commit refs), what's deferred (e.g. cross-floor connectivity, WebGL rewrite), with a verdict on product usability for real level design.
5. Update memory (`hexel-editor-feature`) with new capabilities (split, feature annotations, bounds UI, create/read-back MCP tools).

---

## Execution order & session boundaries
Each phase is self-contained (own doc refs + verification) and sized for one session. Order: 1 → 2 → 3 → 4 → 5 → 6 → 7. Phases 2–3 are discovery-heavy (expect findings), 4–6 are fix-heavy (expect commits). If a phase surfaces a bug whose fix belongs to a later phase, log it in the findings page and continue.
