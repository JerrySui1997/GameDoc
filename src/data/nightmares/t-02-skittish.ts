import type { NightmareRecord } from '@/lib/schema/nightmare';

export const T02_SKITTISH: NightmareRecord = {
  id: 't-02',
  codename: 'SKITTISH',
  tier: 1,
  teaches: 'Fear of Light + light-cornering technique',
  recombines: [],
  evidence: [
    { type: 'Temperature', variant: 'Cold', reliability: 'reliable' },
    { type: 'Glint',       variant: 'Blue', reliability: 'reliable' },
    { type: 'Frequency',                    reliability: 'reliable' },
  ],
  personality: 'SHY',
  fearOfLight: true,
  hunt: ['Docile'],
  haunt: 'none',
  states: 'Patrol → Flee on sight → trapped into Combat when caught between two light sources.',
  signature: 'will not hold still to be photographed; must be pinned between lamps/flashes first, then revealed.',
  capture: 'herd it with placed lights, close the gap, reveal, capture.',
  failLooksLike: 'it escapes the light gap and bolts; crew re-positions lamps and tries again. Funny scramble, no loss.',
  personaFixed: ['flees light', 'evidence stable', 'never aggressive'],
  personaFree: ['everything else'],
};
