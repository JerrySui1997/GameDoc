import { z } from 'zod';

// ── Controlled vocabulary ─────────────────────────────────────────────────

export const GlintVariant = z.enum(['Blue', 'Red']);
export const TemperatureVariant = z.enum(['Cold', 'Hot', 'Abnormal']);
export const Reliability = z.enum(['reliable', 'inconsistent', 'variable']);
export const Personality = z.enum(['SHY', 'MISCHIEF', 'AGGRESSIVE']);
export const HuntRead = z.enum(['Docile', 'Opportunistic', 'Aggressive']);
export const HauntRead = z.enum(['Instant', 'Delayed', 'Multi-Target', 'none']);
export const Tier = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal('2-3'),
]);

// ── Evidence entries (discriminated union enforces variant rules) ──────────

export const EvidenceEntry = z.discriminatedUnion('type', [
  z.object({ type: z.literal('Glint'),       variant: GlintVariant,       reliability: Reliability }),
  z.object({ type: z.literal('Temperature'), variant: TemperatureVariant, reliability: Reliability }),
  z.object({ type: z.literal('Marking'),     reliability: Reliability }),
  z.object({ type: z.literal('Echo'),        reliability: Reliability }),
  z.object({ type: z.literal('Distortion'), reliability: Reliability }),
  z.object({ type: z.literal('Frequency'),  reliability: Reliability }),
  z.object({ type: z.literal('Haunt'),      reliability: Reliability }),
  z.object({ type: z.literal('Hunt'),       reliability: Reliability }),
]);

// ── Nightmare record ──────────────────────────────────────────────────────

export const NightmareRecord = z.object({
  /** Stable canonical ID — never changes once assigned. Format: t-01 … t-99 */
  id: z.string().regex(/^t-\d{2}$/, 'ID must be t-XX format (e.g. t-01)'),
  codename: z.string().min(1),
  tier: Tier,
  /** What gameplay skill / concept this nightmare teaches */
  teaches: z.string().min(1),
  /** IDs of earlier nightmares whose lessons this recombines or extends */
  recombines: z.array(z.string().regex(/^t-\d{2}$/)).default([]),
  /** 3 (Tier 1/2-3) or 4 (Tier 2/3) evidence entries */
  evidence: z.array(EvidenceEntry).min(3).max(4),
  personality: Personality,
  fearOfLight: z.boolean().default(false),
  /** 1–2 values; order = escalation direction */
  hunt: z.array(HuntRead).min(1).max(2),
  haunt: HauntRead,
  states: z.string().min(1),
  /** The one memorable mechanic twist that defines this skeleton */
  signature: z.string().min(1),
  capture: z.string().min(1),
  /** The funny/memorable fail scenario — keeps tone co-op, not punishing */
  failLooksLike: z.string().min(1),
  /** CONTRACT — changing these breaks the teaching chain */
  personaFixed: z.array(z.string()).min(1),
  /** Fully open for visual/theme/sound design */
  personaFree: z.array(z.string()).min(1),
}).superRefine((data, ctx) => {
  const reliable    = data.evidence.filter(e => e.reliability === 'reliable').length;
  const inconsistent = data.evidence.filter(e => e.reliability === 'inconsistent').length;
  const variable    = data.evidence.filter(e => e.reliability === 'variable').length;
  const tier = data.tier;

  if (tier === 1) {
    if (data.evidence.length !== 3 || reliable !== 3) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['evidence'],
        message: 'Tier 1: exactly 3 reliable evidence, no extras.' });
    }
  }

  if (tier === 2) {
    // Standard: 3 reliable + 1 inconsistent
    // Exception: 3 reliable + Delayed Haunt (T-04 pattern)
    const standardOk = data.evidence.length === 4 && reliable === 3 && inconsistent === 1;
    const delayedOk  = data.evidence.length === 3 && reliable === 3 && data.haunt === 'Delayed';
    if (!standardOk && !delayedOk) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['evidence'],
        message: 'Tier 2: 3 reliable + 1 inconsistent, OR 3 reliable + Delayed Haunt.' });
    }
  }

  if (tier === 3) {
    const hasDistortion = data.evidence.some(e => e.type === 'Distortion');
    const hasTwist = inconsistent > 0 || variable > 0;
    if (!hasDistortion && !hasTwist) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['evidence'],
        message: 'Tier 3: must include Distortion or a variable/inconsistent slot.' });
    }
  }

  // Distortion rule: faked reads require Distortion in evidence
  const sigLower = data.signature.toLowerCase();
  const impliesFake = /fake|false|misdirect|lying|lie|faked/.test(sigLower);
  const hasDistortion = data.evidence.some(e => e.type === 'Distortion');
  if (impliesFake && !hasDistortion) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['signature'],
      message: 'Signature implies a false read but evidence does not include Distortion.' });
  }
});

export type NightmareRecord = z.infer<typeof NightmareRecord>;
export type EvidenceEntry   = z.infer<typeof EvidenceEntry>;
export type Tier             = z.infer<typeof Tier>;
export type Personality      = z.infer<typeof Personality>;
export type HuntRead         = z.infer<typeof HuntRead>;
export type HauntRead        = z.infer<typeof HauntRead>;
export type Reliability      = z.infer<typeof Reliability>;
