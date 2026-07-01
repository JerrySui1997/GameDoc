import type { NightmareRecord } from '@/lib/schema/nightmare';

export const T06_MIMIC: NightmareRecord = {
  id: 't-06',
  codename: 'MIMIC',
  tier: 3,
  teaches: 'see-through-the-fake — the advanced Distortion flashcard',
  recombines: [],
  evidence: [
    { type: 'Echo',        reliability: 'reliable'     },
    { type: 'Marking',     reliability: 'reliable'     },
    { type: 'Frequency',   reliability: 'reliable'     },
    { type: 'Distortion',  reliability: 'inconsistent' }, // one of the three reads above is faked
  ],
  personality: 'MISCHIEF',
  fearOfLight: false,
  hunt: ['Opportunistic'],
  haunt: 'none',
  states: 'Normal patrol, but actively manufactures a false evidence read to misdirect identification.',
  signature: 'one of the three reads is faked — the fake is legible against the stable background by its artifact (flicker, bleed, disagreement). Skill is spotting which one lies, not distrusting all of them.',
  capture: 'confirm the two honest reads, identify the fake by its tell, then capture.',
  failLooksLike: 'crew trusts the fake, mis-IDs, brings the wrong approach — wasted run, no death. "Ohhh it faked the Echo."',
  personaFixed: [
    'exactly one faked evidence with a spottable artifact',
    'the other reads stay honest',
    'never debut before players are fluent with Distortion',
  ],
  personaFree: ['what it mimics', 'how the fake manifests visually'],
};
