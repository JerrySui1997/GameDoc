---
name: team-narrative
description: "Orchestrate the narrative team: coordinates narrative-director, writer, world-builder, and level-designer to create cohesive story content, world lore, and narrative-driven level design."
argument-hint: "[narrative content description] [--review full|lean|solo]"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, Edit, Task, AskUserQuestion, TodoWrite
model: sonnet
---
If no argument is provided, output usage guidance and exit without spawning any agents:
> Usage: `/team-narrative [narrative content description]` — describe the story content, scene, or narrative area to work on (e.g., `boss encounter cutscene`, `faction intro dialogue`, `tutorial narrative`). Do not use `AskUserQuestion` here; output the guidance directly.

When this skill is invoked with an argument, orchestrate the narrative team through a structured pipeline.

**Decision Points:** At each phase transition, use `AskUserQuestion` to present
the user with the subagent's proposals as selectable options. Write the agent's
full analysis in conversation, then capture the decision with concise labels.
The user must approve before moving to the next phase.

## Phase 0: Resolve Review Mode

1. If `--review [mode]` was passed as an argument, use that mode.
2. Else read `production/review-mode.txt` — use whatever is written there.
3. Else default to `lean`.

Modes:
- `full` — spawn all director and lead gates as described
- `lean` — skip director gates unless they are PHASE-GATE type (CD-PHASE-GATE, TD-PHASE-GATE, PR-PHASE-GATE, AD-PHASE-GATE)
- `solo` — skip all director gate spawning entirely; run the skill without any agent gates

Store the resolved mode for use in all subsequent phases.

## Team Composition
- **narrative-director** — Story arcs, character design, dialogue strategy, narrative vision
- **writer** — Dialogue writing, lore entries, item descriptions, in-game text
- **world-builder** — World rules, faction design, history, geography, environmental storytelling
- **art-director** — Character visual design, environmental visual storytelling, cutscene/cinematic tone
- **level-designer** — Level layouts that serve the narrative, pacing, environmental storytelling beats
- **localization-lead** — Localization readiness — flags non-localizable strings, cultural assumptions, and i18n gaps

## How to Delegate

Use the Task tool to spawn each team member as a subagent:
- `subagent_type: narrative-director` — Story arcs, character design, narrative vision
- `subagent_type: writer` — Dialogue writing, lore entries, in-game text
- `subagent_type: world-builder` — World rules, faction design, history, geography
- `subagent_type: art-director` — Character visual profiles, environmental visual storytelling, cinematic tone
- `subagent_type: level-designer` — Level layouts that serve the narrative, pacing
- `subagent_type: localization-lead` — Localization readiness — flags non-localizable strings, cultural assumptions, and i18n gaps

Always provide full context in each agent's prompt (narrative brief, lore dependencies, character profiles). Launch independent agents in parallel where the pipeline allows it (e.g., Phase 2 agents can run simultaneously).

## Pipeline

### Phase 1: Narrative Direction
Delegate to **narrative-director**:
- Define the narrative purpose of this content: what story beat does it serve?
- Identify characters involved, their motivations, and how this fits the overall arc
- Set the emotional tone and pacing targets
- Specify any lore dependencies or new lore this introduces
- **Before approving, fetch the FULL existing body of every named character/location page this beat touches** (not a partial or minified-JSON skim) and check for direct contradictions — e.g. a proposed beat implying a first meeting, separation, or origin that an already-published page says never happened. A partial parse that misses this is the single biggest source of published-canon contradictions in this pipeline; if any page can't be fully read, say so explicitly rather than approving on an incomplete check.
- Output: narrative brief with story requirements

**Single-story-beat page format ("moment" pages):** If this content is a standalone story beat (one scene/sequence with its own page, in the pattern of `the-child-prodigy`, `money-is-in-the-dream`, `the-crew-assembles`, `the-porch-light`), it must use the shared structure seeded by `src/lib/docs/momentScaffold.ts`:
1. `hero` widget (eyebrow "Moment", the page's actual title, one-line subtitle)
2. **Sequence of Events** — a `beat` marker (short label) immediately before each `paragraph` of prose; every sentence of established narrative content must survive verbatim, beats only add structure, they don't rewrite prose
3. **Purpose & Arc** — what this beat serves, what must be true before/after it, where it sits on the overall arc
4. **Characters & Motivations** — one bullet per character, `@mention`ed, "wants X, but will not Y"
5. **Tone & Pacing** — emotional target, tempo, where the tone pivots
6. **Setting & Lore** — where this happens, what lore it depends on and what it establishes, `@mention`ed
7. **Level & Interaction Notes** — whether the beat is playable; if so, whether choices actually branch or are illusory; if not, say so plainly
8. A single closing `refs` widget labeled "Related", listing every `@mention`ed page

Do not invent a different shape for a new moment page, and do not silently drop a section when reformatting an existing one.

### Phase 2: World Foundation (parallel)
Delegate in parallel — issue all three Task calls simultaneously before waiting for any result:
- **world-builder**: Create or update lore entries for factions, locations, and history relevant to this content. Cross-reference against existing lore for contradictions. Set canon level for new entries.
- **writer**: Draft character dialogue using voice profiles. Ensure all lines are under 120 characters, use named placeholders for variables, and are localization-ready.
- **art-director**: Define character visual design direction for key characters appearing in this content (silhouette, visual archetype, distinguishing features). Specify environmental visual storytelling elements for each key space (prop composition, lighting notes, spatial arrangement). Define tone palette and cinematic direction for any cutscenes or scripted sequences.

### Phase 3: Level Narrative Integration
Delegate to **level-designer**:
- Review the narrative brief and lore foundation
- Design environmental storytelling elements in the level
- Place narrative triggers, dialogue zones, and discovery points
- Ensure pacing serves both gameplay and story

### Phase 4: Review and Consistency
Delegate to **narrative-director**:
- Review all dialogue against character voice profiles
- Verify lore consistency across new and existing entries — this must be a full-body cross-check against every touched character/location page (see Phase 1's fetch requirement), not a re-confirmation of Phase 1's summary
- Confirm narrative pacing aligns with level design
- Check that all mysteries have documented "true answers"
- Check any relevant agent-memory canon notes (e.g. `.claude/agent-memory/world-builder/`) for prior rulings on the same characters/locations before finalizing — a beat that resolves a previously-open thread should update that memory rather than leave it stale

### Phase 5: Polish (parallel)
Delegate in parallel:
- **writer**: Final self-review — verify no line exceeds dialogue box constraints, all text uses string keys (not raw strings), placeholder variable names are consistent
- **localization-lead**: Validate i18n compliance — check string key naming conventions, flag any strings with hardcoded formatting that won't survive translation, verify character limit headroom for languages that expand (German/Finnish typically +30%), confirm no cultural assumptions in text that would need locale-specific variants
- **world-builder**: Finalize canon levels for all new lore entries

## Error Recovery Protocol

If any spawned agent (via Task) returns BLOCKED, errors, or cannot complete:

1. **Surface immediately**: Report "[AgentName]: BLOCKED — [reason]" to the user before continuing to dependent phases
2. **Assess dependencies**: Check whether the blocked agent's output is required by subsequent phases. If yes, do not proceed past that dependency point without user input.
3. **Offer options** via AskUserQuestion with choices:
   - Skip this agent and note the gap in the final report
   - Retry with narrower scope
   - Stop here and resolve the blocker first
4. **Always produce a partial report** — output whatever was completed. Never discard work because one agent blocked.

Common blockers:
- Input file missing (story not found, GDD absent) → redirect to the skill that creates it
- ADR status is Proposed → do not implement; run `/architecture-decision` first
- Scope too large → split into two stories via `/create-stories`
- Conflicting instructions between ADR and story → surface the conflict, do not guess

## File Write Protocol

All file writes (narrative docs, dialogue files, lore entries) are delegated to
sub-agents spawned via Task. Each sub-agent enforces the "May I write to [path]?"
protocol. This orchestrator does not write files directly.

## Output

A summary report covering: narrative brief status, lore entries created/updated, dialogue lines written, level narrative integration points, consistency review results, and any unresolved contradictions.

Verdict: **COMPLETE** — narrative content delivered.

If the pipeline stops because a dependency is unresolved (e.g., lore contradiction or missing prerequisite not resolved by the user):

Verdict: **BLOCKED** — [reason]

## Next Steps

- Run `/design-review` on the narrative documents for consistency validation.
- Run `/localize extract` to extract new strings for translation after dialogue is finalized.
- Run `/dev-story` to implement dialogue triggers and narrative events in-engine.
