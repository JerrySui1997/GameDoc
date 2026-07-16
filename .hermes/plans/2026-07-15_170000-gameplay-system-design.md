# Gameplay System Design Plan — Dreamcatchers

> **For Hermes:** This is a design plan, not a code implementation plan. The tasks produce design documents (GDDs) on the GameDoc site, not code. Use the `game-designer`, `systems-designer`, and `map-systems` skills to execute each phase. Use the `create-game-design-page` driver to publish pages to the live site.

**Goal:** Build the gameplay system from the foundation up — starting with universal laws (Glint physics), then world states, then domains, then derived mechanics (capture/banish, tools, nightmare behaviors) — so every mechanic is grounded in a coherent ontology rather than invented ad hoc.

**Architecture:** Layer-cake design. Layer 0 (universal laws) → Layer 1 (world states + domains) → Layer 2 (core mechanics) → Layer 3 (content systems). Each layer derives from the one below. No mechanic is designed before its parent layer is locked.

**Tech Stack:** GameDoc site pages (v2 block JSON via driver.mjs), design docs in the project's docs structure.

---

## Current State

### What exists on the site
- **World-building**: New Miri urban identity, phosphor vines, magic system (Five Orders of Mechanized Rune Magic), Aequorian Order, factions, locations (5+), Orange Concession
- **Story**: Hero's Journey timeline, 4 moment pages (The Child Prodigy, The Porch Light, Money Is In The Dream, First Night), Opening scene, Coldwater Locket
- **Characters**: Full crew (Harriet, Adrian, Aria, Shopin), Arthur Crowe, Tajanda, street-life side characters
- **Game design (thin)**: Core concept (high-level), mission types (Identify/Capture/Banish), time system (8:1 compression, half-day turns), camera equipment (basic schema), nightmare AI (personality types: SHY/MISCHIEF/AGGRESSIVE, Fear-of-Light trait)
- **Open questions page**: Exists but unclear if it captures the gameplay gaps

### What's missing (the gap this plan fills)
1. **The Laws of Glint** — what Glint IS, what it does, what it can't do. The foundational "physics" layer.
2. **World State System** — the shared state vocabulary (Dormant, Aware, Aggressive, Bound, Contained, etc.) that everything in the world uses.
3. **Supernatural Domains** — the 4-6 fundamental "currencies" the player manipulates (analogous to fire/electricity/wind/water in BotW).
4. **Capture vs Banish** — the first major derived mechanic, grounded in Glint laws + world states.
5. **Tool & Talisman System** — how player tools interact with Glint and domains.
6. **Nightmare Behavior Model** — rewrite of nightmare AI grounded in Glint dependency + world states.
7. **Environmental Interaction** — how rooms, objects, and spaces interact with Glint/domains/states.
8. **Systems Index** — decomposition of all gameplay systems with dependencies and priorities.

---

## Design Principles (from the conversation)

1. **Design top-down, derive bottom-up.** Start with universal laws, derive everything else. Never invent a mechanic that doesn't trace back to a law.
2. **Domains, not items.** The player manipulates fundamental forces (like BotW's elements), not specific tools. Tools are expressions of domains.
3. **World states, not monster stats.** States (Dormant → Aware → Aggressive → Contained) apply to everything — nightmares, tools, rooms, players. Not just creatures.
4. **Movement and tactics over action and reaction.** Combat is about battlefield manipulation, not DPS. No attack combos, critical hits, or armor. Focus on positioning, containment, line of sight, environmental manipulation, preparation, escape routes.
5. **One rule → dozens of mechanics.** Each universal law should be generative. If a law only produces one mechanic, it's too narrow.
6. **Glint is the anchor.** Like Mana in Warcraft, Chiralium in Death Stranding, ADAM in BioShock. If Glint is interesting, the whole game is interesting.

---

## Phase 0: Pre-Design Alignment (conversation, no writing)

**Objective:** Make sure we agree on the design philosophy before writing anything.

**Step 1: Review the conversation insights**
Re-read the design conversation. Confirm these are the guiding principles:
- Layer 0 (what the player manipulates) comes before mechanics
- 4-6 supernatural domains, not items
- World states shared across all entities
- Glint needs a "what does it WANT to do?" answer
- Movement/tactics pillar, not action/reaction
- Capture vs Banish as the first derived system

**Step 2: Confirm the design order**
Present this plan to the user and confirm the phase ordering makes sense. Adjust if the user has different priorities.

**Deliverable:** Confirmed plan, shared understanding of approach.

---

## Phase 1: The Laws of Glint (Layer 0 — Foundation)

**Objective:** Write the single most important design document: one page that defines what Glint is, what it naturally does, and what it can never do. This is the "physics engine" of the supernatural world.

**Format:** A new GameDoc page, `laws-of-glint`, parented under `game-design`.

**Process (use `game-designer` skill):**

### Step 1.1: Glint Nature Workshop (conversation)
Answer these questions collaboratively with the user. Present 2-3 options for each, with reasoning:

1. **What is Glint?** (Not lore — mechanical definition. "Glint is a substance/field/energy that ___")
2. **What does Glint naturally tend toward?** (The "what does it WANT to do?" question. Options from the conversation: gather, pattern, consciousness, stories. Pick one or define a new one.)
3. **What can Glint NEVER do?** (Hard constraints. These create the interesting limitations.)
4. **How do living beings affect it?** (Do humans attract it? Repel it? Organize it? Corrupt it?)
5. **How do nightmares affect it?** (Do they consume it? Produce it? Corrupt it? Depend on it?)
6. **How do engineered devices affect it?** (Talismans organize it? Machines channel it? Silver interrupts it?)
7. **What happens at extremes?** (Exhausted, overloaded, contaminated, concentrated — what are the failure states?)

Use `clarify` at each question. Present options with pros/cons. Let the user pick.

### Step 1.2: Draft the Laws Document
Based on the answers, write 5-7 universal rules. Each rule should be:
- One sentence
- Mechanically precise (a programmer could implement it)
- Generative (produces multiple mechanics downstream)

Example structure (NOT the actual rules — these come from Step 1.1):
```
Law 1: Glint [tendency]. [Mechanical implication].
Law 2: Nightmares require Glint to [state]. [Mechanical implication].
Law 3: [Material] interrupts Glint [behavior]. [Mechanical implication].
Law 4: Talismans [organize/channel] Glint. [Mechanical implication].
Law 5: Reality constantly [disperses/attracts/transforms] Glint. [Mechanical implication].
```

### Step 1.3: Derivation Check
For each law, list 3+ mechanics it could generate. If a law produces fewer than 3, it's too narrow — revise.

Present the derivation check to the user. If any law is barren, workshop a replacement.

### Step 1.4: Publish
Use the `create-game-design-page` driver to publish `laws-of-glint` to the live site. Parent: `game-design`.

**Deliverable:** `laws-of-glint` page on GameDoc. The foundational document everything else references.

---

## Phase 2: World State System (Layer 1 — Shared Vocabulary)

**Objective:** Define the universal state vocabulary that all entities (nightmares, tools, rooms, players, objects) share. This replaces per-entity stat systems with a shared ontology.

**Format:** A new GameDoc page, `world-states`, parented under `game-design`.

**Process (use `systems-designer` skill):**

### Step 2.1: State Enumeration Workshop
Starting from the conversation's list (Dormant, Aware, Aggressive, Bound, Contained, Anchored, Corrupted, Unstable, Manifested, Hidden), refine to 6-10 states. For each state:
- Name
- Definition (mechanical, one sentence)
- What triggers entry into this state
- What triggers exit from this state
- Which entities can hold this state (all? nightmares only? objects only?)

### Step 2.2: State Transition Diagram
Map valid transitions. Not all states are reachable from all other states. Create a transition matrix:

| From \ To | Dormant | Aware | Aggressive | Bound | Contained | ... |
|-----------|---------|-------|------------|-------|-----------|-----|
| Dormant   | —       | yes   | no         | no    | no        | ... |
| Aware     | yes     | —     | yes        | yes   | no        | ... |
| ...       |         |       |            |       |           |     |

### Step 2.3: Glint Integration
For each state, define how it relates to Glint:
- Does this state require a minimum Glint concentration?
- Does entering/exiting this state consume, produce, or transform Glint?
- Can Glint contamination force a state transition?

### Step 2.4: Publish
Publish `world-states` page to GameDoc. Parent: `game-design`.

**Deliverable:** `world-states` page. The shared state vocabulary for all entities.

---

## Phase 3: Supernatural Domains (Layer 1 — Player Manipulation)

**Objective:** Define the 4-6 fundamental "currencies" the player manipulates. These are the equivalents of BotW's fire/electricity/wind/water — not items, not stats, but forces.

**Format:** A new GameDoc page, `supernatural-domains`, parented under `game-design`.

**Process (use `game-designer` skill):**

### Step 3.1: Domain Identification Workshop
Starting from the conversation's candidates (Glint, Presence, Stability, Intent, Territory — plus others the user may propose), select 4-6 domains. For each:
- Name
- What it represents (one sentence)
- What manipulates it (player tools, nightmare behaviors, environmental factors)
- What it affects when modified (does changing Stability affect world states? Glint flow? Nightmare behavior?)
- Player readability: how does the player perceive this domain? (visual, audio, UI cue)

### Step 3.2: Domain Interaction Matrix
How do domains interact? When one changes, do others change? Create a matrix:

| Domain A \ Domain B | Glint | Presence | Stability | Intent | Territory |
|---------------------|-------|----------|-----------|--------|-----------|
| Glint               | —     | ↑        | ↓         | —      | ↑         |
| Presence            | ↑     | —        | ↓         | ↑      | ↑         |
| ...                 |       |          |           |        |           |

### Step 3.3: Player-Facing Presentation
How does the player interact with these domains? Are they:
- Explicit (HUD meters the player reads directly)?
- Implicit (the player feels the effects but never sees a number)?
- Hybrid (some visible, some hidden)?

This decision shapes the entire UI design. Present 3 options with pros/cons.

### Step 3.4: Glint Law Compliance
Verify each domain is consistent with the Laws of Glint. If a domain contradicts a law, either revise the domain or amend the law (with user approval).

### Step 3.5: Publish
Publish `supernatural-domains` page to GameDoc. Parent: `game-design`.

**Deliverable:** `supernatural-domains` page. The fundamental forces the player manipulates.

---

## Phase 4: Capture vs Banish (Layer 2 — First Derived Mechanic)

**Objective:** Design the first major gameplay system, fully derived from Layers 0-1. This is the game's core decision: how do you deal with a nightmare?

**Format:** A new GameDoc page, `capture-vs-banish`, parented under `game-design`.

**Process (use `systems-designer` skill + `game-designer` skill):**

### Step 4.1: Capture System Design
Design capture as a multi-stage process grounded in Glint laws and world states:
- What states must the nightmare be in for capture to be possible?
- What tools does the player use, and how do they interact with Glint/domains?
- What are the failure states? (What happens if capture goes wrong?)
- What are the rewards? (Research, resources, reputation, living specimen — from the conversation)
- What preparation is required? (Knowledge, containment tools, environmental setup)

### Step 4.2: Banish System Design
Design banish as the "fast, safe, emergency" option:
- What states must the nightmare be in for banish to be possible?
- What tools does the player use?
- What are the consequences? (Less reward, lost research, nightmare escapes to Dream Realm, increased instability elsewhere)
- When is banish the RIGHT choice? (Avoid making it always inferior to capture)

### Step 4.3: Decision Matrix
Create a matrix showing when each option is optimal:
- By nightmare type
- By player preparation level
- By time pressure
- By mission objectives

### Step 4.4: Integration Check
Verify:
- Every tool referenced traces back to a Glint law + domain interaction
- Every state transition traces back to the world state system
- The decision between capture and banish is genuinely interesting (no dominant strategy)

### Step 4.5: Publish
Publish `capture-vs-banish` page to GameDoc. Parent: `game-design`.

**Deliverable:** `capture-vs-banish` page. The first fully-derived gameplay mechanic.

---

## Phase 5: Tool & Talisman System (Layer 2 — Player Expression)

**Objective:** Design how player tools work as expressions of Glint laws and supernatural domains. Tools are not items with stats — they are lenses through which the player manipulates the world.

**Format:** A new GameDoc page, `tool-system`, parented under `game-design`.

**Process (use `systems-designer` skill):**

### Step 5.1: Tool Taxonomy
Define tool categories based on HOW they interact with Glint/domains:
- **Organizers** (talismans — organize Glint into patterns)
- **Interrupters** (silver, certain materials — break Glint flow)
- **Containers** (capture devices — hold Glint/entities in specific states)
- **Revealers** (camera, sensors — make hidden Glint/states visible)
- **Modifiers** (change domain values in an area — increase Stability, reduce Presence)

### Step 5.2: Per-Tool Spec
For each tool, specify:
- Which Glint law it exploits
- Which domain(s) it modifies
- Which world states it can induce or prevent
- Its limitations (cooldown, charges, area of effect, failure conditions)
- How it interacts with other tools (combos, interference)

### Step 5.3: Camera Integration
Integrate the existing camera equipment spec (from `camera-equipment` page) into the new tool framework. The camera should be a Revealer-type tool. Resolve the open question about reveal-effect persistence.

### Step 5.4: Crew Role Integration
Map tools to crew roles (Harriet/Director, Adrian/Light, Aria/Sound, Shopin/Camera). Each role should have primary access to a different tool category, creating cooperative dependency.

### Step 5.5: Publish
Publish `tool-system` page to GameDoc. Parent: `game-design`.

**Deliverable:** `tool-system` page. The player's expressive toolkit.

---

## Phase 6: Nightmare Behavior Model (Layer 2 — Rewritten AI)

**Objective:** Rewrite the nightmare AI spec to be fully grounded in Glint laws, world states, and domains. Replace the current personality-only model with a state-driven model.

**Format:** Update existing `nightmare-ai` page on GameDoc.

**Process (use `game-designer` skill):**

### Step 6.1: Nightmare as Glint Entity
Define how nightmares relate to Glint:
- Do they consume Glint? Produce it? Both?
- What happens to a nightmare when Glint is exhausted in an area?
- What happens when Glint is concentrated?
- Can a nightmare exist without Glint?

### Step 6.2: State-Driven Behavior
Map nightmare behaviors to world states:
- Dormant: what does the nightmare do? How does the player encounter it?
- Aware: what triggers awareness? What changes in behavior?
- Aggressive: what triggers aggression? What can the player do to de-escalate?
- Bound: what tools bind a nightmare? What are the limits?
- Contained: how does containment work? What are the failure modes?
- Corrupted/Unstable: what happens when Glint contamination affects a nightmare?

### Step 6.3: Personality as Modifier (not primary axis)
Keep the existing personality types (SHY, MISCHIEF, AGGRESSIVE) but redefine them as MODIFIERS on the state transition graph, not as primary behavioral axes. A SHY nightmare transitions Dormant→Aware more easily but Aware→Aggressive less easily. An AGGRESSIVE nightmare transitions Aware→Aggressive more easily.

### Step 6.4: Nightmare Taxonomy
Define 3-5 nightmare archetypes that emerge from different Glint/domain affinities. Each archetype should:
- Favor different states
- Respond differently to player tools
- Create different tactical challenges
- Require different approaches to capture vs banish

### Step 6.5: Update Page
Update `nightmare-ai` page with the new model. Update `nightmanul` as the first concrete example.

**Deliverable:** Updated `nightmare-ai` page. Nightmare behavior grounded in the universal system.

---

## Phase 7: Environmental Interaction (Layer 2 — Spatial Gameplay)

**Objective:** Define how rooms, objects, and spaces interact with Glint, domains, and world states. This is what makes the game an immersive sim rather than a monster hunting game.

**Format:** A new GameDoc page, `environmental-interaction`, parented under `game-design`.

**Process (use `level-designer` skill + `systems-designer` skill):**

### Step 7.1: Glint in Spaces
How does Glint distribute in physical spaces?
- Does it pool in certain room types? (dark rooms, rooms with water, rooms with metal?)
- Does it flow between connected spaces?
- Does architecture affect Glint flow? (narrow corridors, open halls, sealed rooms?)
- Do phosphor vines (existing lore) indicate Glint concentration?

### Step 7.2: State-Aware Objects
Define how objects in the world hold and transition between states:
- A door can be Dormant (normal), Anchored (sealed by talisman), or Corrupted (warped by Glint)
- A light source can be Dormant (off), Aware (on, normal), or Unstable (flickering, Glint-contaminated)
- A mirror can be Dormant, Manifested (showing the Dream Layer), or Corrupted

### Step 7.3: Player-Environment Manipulation
What can the player DO to the environment?
- Block Glint flow (close doors, place barriers)
- Redirect Glint flow (open paths, use talismans as conduits)
- Concentrate Glint (seal a room to build up Glint for a trap)
- Purge Glint (ventilate a room, use silver to disperse)
- Change room states (turn lights on/off, break mirrors, seal vents)

### Step 7.4: Tactical Implications
How does environmental manipulation serve the movement/tactics pillar?
- Creating escape routes by purging Glint from a corridor
- Funneling a nightmare into a containment zone by manipulating Glint flow
- Cutting off a nightmare's Glint supply by sealing a room
- Using Glint concentration as a lure or trap

### Step 7.5: Publish
Publish `environmental-interaction` page to GameDoc. Parent: `game-design`.

**Deliverable:** `environmental-interaction` page. Spatial gameplay grounded in the universal system.

---

## Phase 8: Systems Index & Dependency Map (Meta — Project Organization)

**Objective:** Decompose the full game into all systems, map dependencies, and create the systems index. This organizes everything designed in Phases 1-7 plus identifies remaining systems.

**Format:** A new GameDoc page, `systems-index`, parented under `game-design`.

**Process (use `map-systems` skill):**

### Step 8.1: Systems Enumeration
Enumerate ALL systems the game needs, based on:
- The existing concept doc (mission types, time system, camera)
- The new systems designed in Phases 1-7
- Implicit systems (UI, save/load, networking, progression, economy)

### Step 8.2: Dependency Mapping
Map which systems depend on which. The layer cake should be clear:
- Layer 0: Glint Laws (no dependencies)
- Layer 1: World States (depends on Glint Laws), Supernatural Domains (depends on Glint Laws)
- Layer 2: Capture/Banish (depends on States + Domains + Glint), Tools (depends on Glint + Domains), Nightmare AI (depends on Glint + States), Environment (depends on Glint + States + Domains)
- Layer 3: Mission System (depends on Capture/Banish + Nightmare AI), Progression (depends on Capture rewards), Economy (depends on Glint as resource)

### Step 8.3: Priority Assignment
Assign each system to MVP / Vertical Slice / Alpha / Full Vision tiers.

### Step 8.4: Design Order
Produce the recommended design order based on dependencies + priorities.

### Step 8.5: Publish
Publish `systems-index` page to GameDoc. Parent: `game-design`.

**Deliverable:** `systems-index` page. The project roadmap for all gameplay systems.

---

## Phase 9: Cross-System Consistency Review

**Objective:** Verify that all designed systems are internally consistent and no contradictions exist between layers.

**Process (use `design-review` skill):**

### Step 9.1: Layer Compliance Audit
For each Layer 2 system, trace every mechanic back to a Layer 0 law or Layer 1 state/domain. Flag any mechanic that:
- Cannot be traced to a law (orphan mechanic)
- Contradicts a law (violation)
- Uses a concept not defined in Layer 1 (undefined term)

### Step 9.2: State Coverage Audit
Verify every world state is:
- Reachable by at least one entity type
- Triggered by at least one player action
- Relevant to at least one gameplay decision

### Step 9.3: Domain Coverage Audit
Verify every domain is:
- Manipulable by at least one player tool
- Affected by at least one nightmare behavior
- Perceptible to the player (directly or indirectly)

### Step 9.4: Glint Law Stress Test
Present edge cases and verify the laws hold:
- What happens when Glint concentration reaches zero in a room with a manifested nightmare?
- What happens when two talismans with conflicting patterns are placed in the same room?
- What happens when a nightmare is contained but the Glint supply is cut off?

### Step 9.5: Report
Produce a consistency report. Flag any issues for resolution in a follow-up session.

**Deliverable:** Consistency report. Confidence that the system is coherent.

---

## Summary of Deliverables

| Phase | Deliverable | Page ID | Parent |
|-------|------------|---------|--------|
| 1 | The Laws of Glint | `laws-of-glint` | `game-design` |
| 2 | World State System | `world-states` | `game-design` |
| 3 | Supernatural Domains | `supernatural-domains` | `game-design` |
| 4 | Capture vs Banish | `capture-vs-banish` | `game-design` |
| 5 | Tool & Talisman System | `tool-system` | `game-design` |
| 6 | Nightmare Behavior Model | `nightmare-ai` (updated) | `game-design` |
| 7 | Environmental Interaction | `environmental-interaction` | `game-design` |
| 8 | Systems Index | `systems-index` | `game-design` |
| 9 | Consistency Report | (conversation/doc) | — |

## Recommended Execution Order

1. **Phase 0** (alignment) — 1 session, conversation only
2. **Phase 1** (Glint laws) — 1-2 sessions, this is the hardest and most important
3. **Phase 2** (world states) — 1 session
4. **Phase 3** (domains) — 1 session
5. **Phase 4** (capture vs banish) — 1-2 sessions
6. **Phase 5** (tools) — 1 session
7. **Phase 6** (nightmare rewrite) — 1 session
8. **Phase 7** (environment) — 1 session
9. **Phase 8** (systems index) — 1 session
10. **Phase 9** (consistency review) — 1 session

**Total: ~10-12 design sessions.** Each session is one focused conversation with the `game-designer` or `systems-designer` skill loaded.

## Key Constraint

**Do not skip ahead.** Every phase depends on the one before it. Designing tools (Phase 5) before Glint laws (Phase 1) is exactly the mistake this plan exists to prevent. If a later phase reveals a problem with an earlier layer, go back and fix the layer — don't patch around it.

## Open Questions to Resolve in Phase 1

These are the questions that MUST be answered before any other design work begins:

1. **What does Glint want to do?** (gather / pattern / consciousness / stories / something else)
2. **Is Glint a substance, a field, or an energy?** (This affects whether it can be "contained" vs "projected" vs "concentrated")
3. **Can Glint be created or destroyed, or only transformed/moved?**
4. **Does Glint have a "purity" axis?** (clean Glint vs corrupted Glint — or is corruption just a world state applied to any Glint?)
5. **What is Glint's relationship to the Dream Layer?** (Is the Dream Layer made of Glint? Does Glint leak FROM the Dream Layer? Does Glint CREATE the Dream Layer?)

These questions should be the first thing Phase 1 addresses. Everything downstream depends on them.
