import type { NightmareRecord } from '@/lib/schema/nightmare';

// Tier 3 capstone: the delayed-haunt clock (T-04) now runs *during* an active hunt (T-07).
export const T08_REVENANT: NightmareRecord = {
  id: 't-08',
  codename: 'REVENANT',
  tier: 3,
  teaches: 'managing the delayed-haunt clock while a hunt is already live — finish the read mid-chase',
  recombines: ['t-04', 't-07'],
  evidence: [
    { type: 'Glint',       variant: 'Red', reliability: 'reliable'     },
    { type: 'Echo',                        reliability: 'reliable'     },
    { type: 'Temperature', variant: 'Hot', reliability: 'reliable'     },
    { type: 'Hunt',                        reliability: 'inconsistent' }, // confirms only once it has locked onto a target
  ],
  personality: 'AGGRESSIVE',
  fearOfLight: false,
  hunt: ['Opportunistic', 'Aggressive'],
  haunt: 'Delayed',
  states: 'Patrol/Seek until it sights a player, then enters Combat and pursues while a delayed Haunt timer matures in the background.',
  signature: 'the haunt timer keeps running while it chases — you must confirm identity and set the capture mid-pursuit, before the delayed payload lands.',
  capture: 'split roles: one crew member kites the chase to buy time while the others confirm evidence and arm the capture, then trigger before the timer matures.',
  failLooksLike: 'the delayed Haunt detonates mid-chase, scatters the whole crew, and the runner gets cornered — frantic regroup, then a second attempt.',
  personaFixed: [
    'chase and haunt-clock run at the same time',
    'hunt read confirms only after it locks on',
    'pressure is the overlap, not either threat alone',
  ],
  personaFree: ['what the delayed payload does', 'how the pursuit looks/sounds', 'all theme'],
};
