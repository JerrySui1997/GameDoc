import type { NightmareRecord } from '@/lib/schema/nightmare';

export const T05_PACK: NightmareRecord = {
  id: 't-05',
  codename: 'PACK',
  tier: '2-3',
  teaches: 'co-op coordination — splitting the crew and cross-referencing distributed evidence',
  recombines: [],
  evidence: [
    { type: 'Echo',        reliability: 'reliable' },
    { type: 'Temperature', variant: 'Cold', reliability: 'reliable' },
    { type: 'Glint',       variant: 'Blue', reliability: 'reliable' },
  ],
  personality: 'SHY',
  fearOfLight: false,
  hunt: ['Docile'],
  haunt: 'Multi-Target',
  states: 'Multiple bodies patrol independently; evidence only resolves when reads from separate locations are combined.',
  signature: 'no single player can confirm it alone — forces the four-person team to actually split and cross-reference.',
  capture: 'isolate and capture bodies in sequence; the haunt targets whoever is alone.',
  failLooksLike: 'everyone gets haunted at once because they clumped — comedic group panic, then they spread out.',
  personaFixed: ['plural', 'distributed evidence', 'punishes clustering'],
  personaFree: ['whether the bodies are copies, fragments, a swarm — all visual'],
};
