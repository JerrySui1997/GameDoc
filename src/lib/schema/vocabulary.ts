/** Vocabulary constants — single source of truth for all display names and ordering. */

export const EVIDENCE_TYPES = ['Glint', 'Marking', 'Echo', 'Temperature', 'Distortion', 'Frequency', 'Haunt', 'Hunt'] as const;
export type EvidenceType = typeof EVIDENCE_TYPES[number];

export const GLINT_VARIANTS     = ['Blue', 'Red'] as const;
export const TEMP_VARIANTS      = ['Cold', 'Hot', 'Abnormal'] as const;
export const RELIABILITY_VALUES = ['reliable', 'inconsistent', 'variable'] as const;
export const PERSONALITY_VALUES = ['SHY', 'MISCHIEF', 'AGGRESSIVE'] as const;
export const HUNT_READ_VALUES   = ['Docile', 'Opportunistic', 'Aggressive'] as const;
export const HAUNT_READ_VALUES  = ['Instant', 'Delayed', 'Multi-Target', 'none'] as const;
export const STATE_VALUES       = ['Patrol', 'Seek', 'Combat', 'Flee'] as const;

/** Player toolkit — order matches the in-game tool wheel */
export const TOOLKIT = ['Camera', 'Flash', 'Glint Reader', 'Mic', 'Thermometer', 'WaveFinder'] as const;
export type ToolkitItem = typeof TOOLKIT[number];

/** Glossary definitions — rendered on /glossary and linked inline via <GlossaryLink> */
export const GLOSSARY: Record<EvidenceType, string> = {
  Glint:       'A visual light trace. Blue = passive ambient; Red = aggressive/aroused. Captured by Camera or Glint Reader.',
  Marking:     'Physical traces left on surfaces — scratches, burns, symbols. Visible to the naked eye.',
  Echo:        'Residual audio imprint. Detected by Mic. Persists after the nightmare leaves the area.',
  Temperature: 'Ambient thermal anomaly. Cold = passive presence; Hot = aroused; Abnormal = fluctuating (interaction-linked). Detected by Thermometer.',
  Distortion:  'A false or corrupted evidence reading. Only nightmares with Distortion in their signature may produce lying tool outputs. Detected by WaveFinder divergence.',
  Frequency:   'Sub-audible or super-audible waveform. Detected by WaveFinder. May only appear during specific behaviors.',
  Haunt:       'Environmental manifestation event. Timing: Instant | Delayed | Multi-Target. The Haunt is distinct from a Hunt.',
  Hunt:        'Active pursuit state. Escalates from Docile → Opportunistic → Aggressive. Hunt read confirms personality type under pressure.',
};
