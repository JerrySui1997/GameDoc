// ── Constant-time compare (Edge-safe) ───────────────────────────────────────
// Survives from the retired shared-password gate (see plans/06 Phase 1) as the
// one still-needed piece: the GAMEDOC_AGENT_TOKEN bearer check (middleware.ts's
// hasValidAgentBearer, agentToken.ts's checkAgentToken, and collab-core.ts's WS
// agent bypass) all need a timing-safe compare and run in three different
// runtimes (Edge middleware, Node route handlers, plain Node WS server), so
// this stays dependency-free (Web Crypto + no `node:` imports) rather than
// living in any one of those call sites.

/**
 * Constant-time compare of a candidate token against the expected value. The
 * loop's running time depends only on the expected length, never on where a
 * mismatch falls, so it can't be used as a timing oracle.
 */
export function safeEqual(candidate: string | undefined | null, expected: string): boolean {
  if (!candidate || candidate.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= candidate.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}
