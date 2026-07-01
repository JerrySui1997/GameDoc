import type { NightmareRecord } from '@/lib/schema/nightmare';

// Tier 3 capstone: distributed evidence (T-05) where one body's read is faked (T-06).
export const T09_CHORUS: NightmareRecord = {
  id: 't-09',
  codename: 'CHORUS',
  tier: 3,
  teaches: 'cross-referencing distributed evidence when one of the scattered reads is a fake',
  recombines: ['t-05', 't-06'],
  evidence: [
    { type: 'Echo',                         reliability: 'reliable'     },
    { type: 'Temperature', variant: 'Cold', reliability: 'reliable'     },
    { type: 'Glint',       variant: 'Blue', reliability: 'reliable'     },
    { type: 'Distortion',                   reliability: 'inconsistent' }, // one body broadcasts a false read
  ],
  personality: 'MISCHIEF',
  fearOfLight: false,
  hunt: ['Opportunistic'],
  haunt: 'Multi-Target',
  states: 'Multiple bodies patrol separately; the true fingerprint only resolves when reads from different locations agree — and one body deliberately disagrees.',
  signature: 'the crew must split to gather distributed evidence, then spot which scattered read is faked — the lie is the body whose report fails to corroborate the others.',
  capture: 'collect reads from every location, cross-reference to expose the non-corroborating fake, then capture the bodies in sequence.',
  failLooksLike: 'the crew trusts the loud fake, chases the wrong body, and the Multi-Target haunt catches the stragglers — "it was the third one lying the whole time."',
  personaFixed: [
    'plural bodies with distributed evidence',
    'exactly one body broadcasts a fake read',
    'truth emerges only from cross-referencing locations',
  ],
  personaFree: ['what the bodies are', 'how the fake stands out once compared', 'all visual/sound'],
};
