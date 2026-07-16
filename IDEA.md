GameDoc is a collaborative, Notion-style game design documentation platform — a living wiki where a game's narrative, characters, worlds, and systems are authored, visualized, and kept in sync by both humans and AI agents.

The problem it solves: game design docs traditionally rot in scattered FigJams, Google Docs, and spreadsheets — disconnected from each other, hard to keep consistent, and invisible to the AI tools now doing much of the writing. GameDoc replaces that with one canonical, structured, real-time source of truth.

What it actually is:

A custom block-based editor (homegrown, not BlockNote/Notion) — pages are built from typed v2 blocks: prose, headings, and rich game-design widgets.
Game-design-native widgets, which is the real differentiator: Character Studio cards that mirror across pages from a single source of truth, a Narrative Timeline (acts/moments ribbon with draggable characters and environments), the Hexel Map (a rotatable isometric 3D paint tool where painted spaces get their meaning inferred), page color legends, and beat/screenplay-style sequence tooling.
Real-time multi-user collaboration via Yjs/y-websocket with a relay server and LevelDB persistence — multiple people (and agents) edit the same page live.
An MCP server + agent API, so AI agents (like me, or a "team-narrative" skill crew) can read and publish real doc pages programmatically. The docs are also being evolved into a typed semantic graph (nodes + edges) rather than just a page tree.
Deployed on Railway (Next.js 15 / React 19), with the live store as the authoritative data source.
Who it's for: right now, primarily you — it's documenting an actual game project (the Hero's Journey / HaiQin Li / Orange Concession narrative canon lives in it). But the recent work shows it growing toward a multi-user product: real per-user accounts, a workspace dashboard, email/link-based workspace sharing with view-only guest access, and a payment scaffold. The target audience shape is small game dev teams and their AI collaborators — writers, narrative designers, and world-builders who want design docs that are structured, visual, live-collaborative, and machine-readable rather than static text.

Current state: core editor, collab, live deployment, and the MCP integration are done and verified; you're mid-flight on Phase 4–5 of the multi-workspace/account plan (sharing shipped, account settings next), on a branch fixing collections UX and block-drag overlap.
