import type { NightmareRecord } from '@/lib/schema/nightmare';

export const T03_MEDDLER: NightmareRecord = {
  id: 't-03',
  codename: 'MEDDLER',
  tier: 2,
  teaches: 'reading environmental tells + the wait-or-commit judgment',
  recombines: [],
  evidence: [
    { type: 'Marking',     reliability: 'reliable'     },
    { type: 'Echo',        reliability: 'reliable'     },
    { type: 'Temperature', variant: 'Abnormal', reliability: 'reliable' },
    { type: 'Frequency',   reliability: 'inconsistent' }, // only reads while mid-interaction
  ],
  personality: 'MISCHIEF',
  fearOfLight: false,
  hunt: ['Docile', 'Opportunistic'],
  haunt: 'none',
  states: 'Interacts with doors/lights during Patrol and Seek. Escapes Combat and re-hides below 60% and again below 30%.',
  signature: 'the 4th evidence only appears when it is busy meddling — wait for it to act again, or commit on 3.',
  capture: 'catch it during an interaction window when it is exposed and distracted.',
  failLooksLike: 'it kills the lights and re-hides; crew works in the dark, laughing, re-baits an interaction.',
  personaFixed: ['plays with the environment', 'retreats when hurt', 'one inconsistent evidence slot'],
  personaFree: ['what it touches and why', 'all visual/sound'],
};
