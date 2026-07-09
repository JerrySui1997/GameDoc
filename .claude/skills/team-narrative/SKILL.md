---
name: team-narrative
description: "Orchestrate the narrative team to write and publish GameDoc story content directly to the live site via the gamedoc API: coordinates narrative-director, writer, world-builder, and art-director to produce story chapters, character pages, and lore entries as real GameDoc doc pages, using its widget catalog (studioPanel, characterCard, narrativeTimeline, hero, cards, refs, @mentions) rather than generic engine dialogue files."
argument-hint: "[narrative content description] [--target live|dryrun|local] [--review full|lean|solo]"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, Edit, Bash, Task, AskUserQuestion, TodoWrite
model: sonnet
---
If no argument is provided, output usage guidance and exit without spawning any agents:
> Usage: `/team-narrative [narrative content description]` — describe the story chapter, character, or lore page to write (e.g., `next chapter after money-is-in-the-dream`, `Harriet character page`, `Veiled cult faction lore`). Add `--target live|dryrun|local` to pick which GameDoc server to publish to (default `live`). Do not use `AskUserQuestion` here; output the guidance directly.

When this skill is invoked with an argument, orchestrate the narrative team through a structured pipeline that ends with **real doc pages published on GameDoc**, not files on disk.

**Decision Points:** At each phase transition, use `AskUserQuestion` to present
the user with the subagent's proposals as selectable options. Write the agent's
full analysis in conversation, then capture the decision with concise labels.
The user must approve before moving to the next phase.

## What GameDoc is (read this before delegating)

GameDoc is not a game engine with dialogue-trigger files — it's a live Next.js
wiki. Narrative content *is* the published site: a story chapter is a doc page
at `/docs/<id>`, a character is a doc page with a `studioPanel` widget, lore is
a doc page under `world-settings` or `characters`. There is no separate
"implement in-engine" step for this team — publishing the page *is* shipping
the content.

**How pages are read and written**: through the `gamedoc-live` (production,
`gamedoc-production.up.railway.app`) or `gamedoc-live-dryrun` (local dev
server) MCP tools — `gamedoc_list_docs`, `gamedoc_get_doc`, `gamedoc_create_doc`,
`gamedoc_update_doc`, `gamedoc_search_docs`. If those MCP tools 401 or aren't
connected, fall back to the REST API directly with curl:
`GET/POST /api/docs`, `PATCH/PUT/DELETE /api/docs/<id>`, bearer-authed with
`GAMEDOC_AGENT_TOKEN` (source `.env.local`; never print the token itself —
only use it inline in a header). PATCH is preferred for editing an existing
page: it merges onto the stored node and can never blank out fields you didn't
touch. POST fails with 409 if the id already exists — always `gamedoc_get_doc`
or list first to check whether the target chapter is a stub that already
exists (parent/order already placed) before assuming a fresh top-level create
is correct.

**Body format — the single most important fact**: a doc's `body` is stored
**verbatim as a string**. Plain markdown renders as plain prose. Widgets only
appear when the body is the site's **v2 block JSON**:
`{"v":2,"blocks":[{"id":"...","type":"...","text"|"props":...}, ...]}`.
Every block needs a unique `id` (any stable string, e.g. `b-<slug>-0001`).
For a simple prose chapter, plain paragraph blocks are enough and read fine —
see the "Prose chapter" convention below. Reach for a real widget only when
the content needs one (a new character → `studioPanel`; a story spine →
`narrativeTimeline`).

### The widget catalog (`src/components/docs/catalog.tsx`)

Prose block types (`type` on a plain block): `paragraph`, `heading1/2/3`,
`bullet`, `numbered`, `quote`, `code`, `divider`.

Widget block types (`type` + a `props` object, usually with one `...Json`
string field holding nested JSON — see existing pages for the exact shape
before hand-writing one):

| type | Use for |
|---|---|
| `hero` | Big lead banner (eyebrow/title/subtitle/tone: dark\|light\|accent) — top-level overview pages |
| `cards` | Grid of titled cards — crew rosters, zone summaries, faction lists |
| `swatch` | Hex color palette — location/faction color signatures |
| `statusBadge` | Single labeled colored chip — threat tier, state |
| `labeled` | One labeled value field (highlight = amber callout) |
| `badges` | Row of evidence-style badges |
| `tags` | Row of plain colored chips |
| `refs` | Explicit list of links to related pages |
| `collection` | Embed a saved collection as a table |
| `studioPanel` | **Interactive character design sheet** — use for any new named character page |
| `characterCard` | Mirrors *another* page's studioPanel by reference (`sourcePageId`) — use to feature an existing character inline on a different page, not to define a new one |
| `narrativeTimeline` | Acts/moments story spine with drag-on character portraits — use for a saga/arc overview page, not individual chapters |
| `hexelMap` | Isometric 3D space paint tool — level/location layout, not narrative text |

### Prose chapter convention (what most story work is)

Look at existing chapters (`opening-the-drowned-pier`, `the-child-prodigy`,
`money-is-in-the-dream`) before writing a new one — terse, present-tense,
one-to-few paragraph blocks, second-person-absent close third-person prose.
An `@page-id` token anywhere in a block's `text` becomes a live cross-reference
chip (color-coded by the target's kind: character/timeline/page — see
`src/components/docs/Mentions.tsx`) and populates that page's "Mentions" panel
automatically. Always `@mention` every character/location/prior-chapter a new
chapter touches — this *is* how GameDoc's lore graph stays connected; there is
no separate lore-linking step.

Chapters commonly nest under an arc page (e.g. `an-orange-problem`) whose body
has a `## Moments` numbered list of `@child-chapter-id` references in reading
order — when you add a new chapter under an arc, append it to that list too,
PATCHing the parent, not just creating the child.

### Verify before treating a page as done

After every publish (create or PATCH), `gamedoc_get_doc <id>` (or
`GET /api/docs` and find the id) to confirm the stored body matches what you
sent — not just that the HTTP call returned 200. If the target is `live`, the
site sits behind a password gate for browser page loads (307 redirect to
`/login` is expected there and is not a failure) — the API call's 200/201 is
the real signal. If unsure whether local dev and production have diverged,
always read live's actual tree first; do not assume the local seed file
(`src/data/docs/content.json`) matches production.

## Phase 0: Resolve Target Server and Review Mode

1. If `--target [live|dryrun|local]` was passed, use that MCP/mode. Default
   `live`. `local` means edit `src/data/docs/content.json` directly via Read/
   Edit — only use this for scratch work explicitly marked as not-for-publish.
2. If `--review [mode]` was passed, use that mode.
3. Else read `production/review-mode.txt` — use whatever is written there.
4. Else default to `lean`.

Review modes:
- `full` — spawn all director and lead gates as described
- `lean` — skip director gates unless they are PHASE-GATE type (CD-PHASE-GATE, TD-PHASE-GATE, PR-PHASE-GATE, AD-PHASE-GATE)
- `solo` — skip all director gate spawning entirely; run the skill without any agent gates

Store both resolutions for use in all subsequent phases.

## Team Composition
- **narrative-director** — Story arcs, character design, dialogue strategy, narrative vision
- **writer** — Chapter prose, dialogue, lore entries, item descriptions
- **world-builder** — World rules, faction design, history, geography, environmental storytelling
- **art-director** — Character visual design direction, environmental visual storytelling, tone
- **localization-lead** — Flags text that won't survive translation (the site already runs bilingual EN/ZH copy on world pages — check new prose against that pattern rather than generic dialogue-box limits)

Level design and in-engine dialogue triggers are out of scope for this team —
GameDoc has no game engine to wire triggers into. Drop `level-designer` from
the pipeline; `hexelMap` (world-builder or art-director's call) covers spatial
storytelling when a location needs one.

## How to Delegate

Use the Task tool to spawn each team member as a subagent. Every agent prompt
must include:
- The "What GameDoc is" section above verbatim (agents have no other way to
  know this project publishes directly to a live API)
- The resolved `--target` server and how to reach it (MCP tool names or the
  curl/bearer-token fallback)
- Full narrative context: brief, lore dependencies, character profiles, and
  the actual current body of any page being edited (fetch it first — never
  let an agent guess at existing content)

Launch independent agents in parallel where the pipeline allows it (Phase 2).

## Pipeline

### Phase 1: Narrative Direction
Delegate to **narrative-director**:
- Fetch the relevant existing pages first (`gamedoc_list_docs` for the tree,
  `gamedoc_get_doc` on the arc/chapter/character being extended) so the brief
  is grounded in what's actually published, not a stale assumption
- Define the narrative purpose of this content: what story beat does it serve?
- Identify characters involved (by their real doc ids), motivations, and how
  this fits the overall arc
- Set emotional tone and pacing targets
- Specify lore dependencies or new lore this introduces, and which existing
  page(s) it should `@mention`
- Decide placement: new top-level page, or nested under an existing arc's
  `## Moments` list?
- Output: narrative brief with story requirements, target doc id(s), and
  parent/mentions plan

### Phase 2: World & Character Foundation (parallel)
Delegate in parallel — issue all Task calls simultaneously before waiting for any result:
- **world-builder**: Create or update lore doc pages for factions, locations,
  and history relevant to this content (publish via the target server's API/
  MCP — PATCH existing pages, POST new ones under the right parent). Cross-
  reference against existing lore for contradictions before writing.
- **writer**: Draft the actual chapter/dialogue prose as v2 block JSON (or
  plain paragraph blocks per the Prose chapter convention), with correct
  `@mentions`. Publish it to the target server.
- **art-director**: Define character visual design direction (silhouette,
  archetype, distinguishing features) and environmental visual storytelling
  notes. If a new character needs a page, build its `studioPanel` block
  (see an existing character page's raw body as the template) rather than
  describing it in prose only.

### Phase 3: Consistency & Cross-Linking Review
Delegate to **narrative-director**:
- Re-fetch every page touched in Phase 2 (don't trust agent self-reports —
  confirm the live body)
- Review prose against character voice/personality fields already on each
  character's `studioPanel`
- Verify every new page is reachable: correct `parentId`, and referenced from
  its arc's `## Moments` list if it's a chapter
- Check that `@mentions` resolve to real doc ids (a mention of a page that
  doesn't exist yet renders as a dead chip)
- Confirm no mystery/reveal contradicts an already-published page

### Phase 4: Polish (parallel)
Delegate in parallel:
- **writer**: Final read-through of the live (not draft) body for every page
  touched — trim, fix continuity nits, confirm paragraph blocks parse cleanly
- **localization-lead**: Check new prose for hardcoded idioms/formatting that
  won't survive translation; confirm bilingual world-building text (where the
  project already mixes EN/ZH, e.g. location and faction names) follows the
  existing pattern rather than inventing a new one
- **world-builder**: Finalize canon status of any new lore entries; note open
  questions explicitly rather than silently deciding them

## Error Recovery Protocol

If any spawned agent (via Task) returns BLOCKED, errors, or cannot complete:

1. **Surface immediately**: Report "[AgentName]: BLOCKED — [reason]" to the user before continuing to dependent phases
2. **Assess dependencies**: Check whether the blocked agent's output is required by subsequent phases. If yes, do not proceed past that dependency point without user input.
3. **Offer options** via AskUserQuestion with choices:
   - Skip this agent and note the gap in the final report
   - Retry with narrower scope
   - Stop here and resolve the blocker first
4. **Always produce a partial report** — output whatever was completed. Never discard work because one agent blocked.

Common blockers specific to this pipeline:
- `gamedoc-live` 401s → the MCP subprocess likely started without
  `GAMEDOC_AGENT_TOKEN` in its environment even though `.env.local` has it;
  fall back to direct curl with the token sourced fresh in the same shell
  command, or ask the user to restart the session
- `Doc id already exists` (409) → it may be a stub the target chapter is
  meant to fill in — `gamedoc_get_doc` it before assuming a naming collision
- `Parent "…" not found` → the arc/parent page hasn't been created yet; that's
  a Phase 1 sequencing gap, not a Phase 2 execution error
- Local dev seed and live production have diverged → always trust live's own
  tree over `content.json` when `--target live`; surface the mismatch to the
  user rather than silently picking one

## File Write Protocol

There are no local narrative files to write in the default (`live`/`dryrun`)
path — every write is a `gamedoc_create_doc`/`gamedoc_update_doc` MCP call or
an authenticated REST call to the target server, delegated to whichever
sub-agent owns that page in the phase above. Sub-agents publish directly; they
do not stage content in local files for a later "real" write. Only under
`--target local` does this become a Read/Edit against
`src/data/docs/content.json`, and even then each sub-agent enforces the "May I
write to [path]?" protocol before touching it.

## Output

A summary report covering: narrative brief status, doc pages created/updated
(with their live `/docs/<id>` paths and target server), widget types used,
`@mentions`/arc-list links added, consistency review results, and any
unresolved contradictions.

Verdict: **COMPLETE** — narrative content published.

If the pipeline stops because a dependency is unresolved (e.g., lore contradiction, missing parent page, or auth blocker not resolved by the user):

Verdict: **BLOCKED** — [reason]

## Next Steps

- Run `/design-review` on the published pages for consistency validation.
- Use `/create-game-design-page`'s driver if a page needs the fuller design-doc
  widget rhythm (hero + cards + swatch) rather than plain chapter prose.
- Re-run this skill for the next chapter once the user has read and approved
  the current one live.
