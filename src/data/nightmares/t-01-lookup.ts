import type { NightmareRecord } from '@/lib/schema/nightmare';

export const T01_LOOKUP: NightmareRecord = {
  id: 't-01',
  codename: 'LOOKUP',
  tier: 1,
  teaches: 'the core gather-three-and-match loop, clean',
  recombines: [],
  evidence: [
    { type: 'Glint',    variant: 'Blue', reliability: 'reliable' },
    { type: 'Marking',                   reliability: 'reliable' },
    { type: 'Echo',                      reliability: 'reliable' },
  ],
  personality: 'SHY',
  fearOfLight: false,
  hunt: ['Docile'],
  haunt: 'none',
  states: 'Patrol → Flee on sight. Never enters Combat unrevealed.',
  signature: 'none — the teaching floor. Identification is a lookup.',
  capture: 'Reveal with camera, no time pressure. Capture/banish while unrevealed is allowed.',
  failLooksLike: 'slips past, re-hides, re-tracked via Glint. A redo, not a punishment.',
  personaFixed: ['harmless', 'shy', 'evidence stable'],
  personaFree: ['all visual identity', 'theme', 'sound', 'what dream it is born from'],
};
