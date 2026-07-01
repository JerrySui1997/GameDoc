import type { NightmareRecord } from '@/lib/schema/nightmare';

export const T07_STALKER: NightmareRecord = {
  id: 't-07',
  codename: 'STALKER',
  tier: 3,
  teaches: 'the behavioral read under pressure — the chase as fail-state, not as a hunt you opt into',
  recombines: ['t-03', 't-06'],
  evidence: [
    { type: 'Marking',     reliability: 'reliable' },
    { type: 'Frequency',   reliability: 'reliable' },
    { type: 'Temperature', variant: 'Hot', reliability: 'reliable' },
    { type: 'Hunt',        reliability: 'inconsistent' }, // reads true only once it has spotted someone
  ],
  personality: 'AGGRESSIVE',
  fearOfLight: false,
  hunt: ['Opportunistic', 'Aggressive'],
  haunt: 'none',
  states: 'Patrol/Seek → on sighting a player, enters Combat and pursues. The chase is the punishment for being seen.',
  signature: 'identify it before it identifies you — once spotted, the verb flips from investigate to survive-and-re-hide until it loses the trail.',
  capture: 'confirm evidence while unseen, set the capture, trigger from concealment. If caught first, break line of sight and reset.',
  failLooksLike: 'a frantic chase through the site, screaming, someone possessed and acting funny, crew scatters and regroups — high-clip-value chaos.',
  personaFixed: [
    'aggressive pursuit on sight',
    'possession on engagement',
    'chase is a fail-state',
  ],
  personaFree: ['how it moves', 'what possession looks/sounds like', 'all theme'],
};
