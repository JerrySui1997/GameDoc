import type { NightmareRecord } from '@/lib/schema/nightmare';

// Tier 2 via behavioral complexity: 3 reliable evidence + Delayed Haunt (the clock IS the wait-or-commit slot)
export const T04_SLOW_BURN: NightmareRecord = {
  id: 't-04',
  codename: 'SLOW BURN',
  tier: 2,
  teaches: 'the Haunt behavioral read + soft time pressure that rewards committing',
  recombines: [],
  evidence: [
    { type: 'Glint',      variant: 'Red', reliability: 'reliable' },
    { type: 'Marking',                    reliability: 'reliable' },
    { type: 'Frequency',                  reliability: 'reliable' },
  ],
  personality: 'SHY',
  fearOfLight: false,
  hunt: ['Docile'],
  haunt: 'Delayed',
  states: 'Patrol/Seek normally. The longer the crew lingers, the larger the eventual delayed Haunt payload.',
  signature: 'identification is easy; the pressure is the clock — over-investigating is punished by a bigger haunt event.',
  capture: 'gather fast, commit on 3, leave before the timer matures.',
  failLooksLike: 'the delayed Haunt lands mid-capture — screen chaos, dropped camera, scattered crew — they regroup and finish.',
  personaFixed: ['evidence trivial', 'threat is the delayed payload', 'behavioral read is the real test'],
  personaFree: ['what the Haunt does visually/sonically', 'all theme'],
};
