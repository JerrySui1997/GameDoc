import type { NightmareRecord } from '@/lib/schema/nightmare';

export { T01_LOOKUP }   from './t-01-lookup';
export { T02_SKITTISH } from './t-02-skittish';
export { T03_MEDDLER }  from './t-03-meddler';
export { T04_SLOW_BURN } from './t-04-slow-burn';
export { T05_PACK }     from './t-05-pack';
export { T06_MIMIC }    from './t-06-mimic';
export { T07_STALKER }  from './t-07-stalker';
export { T08_REVENANT } from './t-08-revenant';
export { T09_CHORUS }   from './t-09-chorus';

import { T01_LOOKUP }    from './t-01-lookup';
import { T02_SKITTISH }  from './t-02-skittish';
import { T03_MEDDLER }   from './t-03-meddler';
import { T04_SLOW_BURN } from './t-04-slow-burn';
import { T05_PACK }      from './t-05-pack';
import { T06_MIMIC }     from './t-06-mimic';
import { T07_STALKER }   from './t-07-stalker';
import { T08_REVENANT }  from './t-08-revenant';
import { T09_CHORUS }    from './t-09-chorus';

/** All nightmares in teaching-ladder order (T-01 first). */
export const ALL_NIGHTMARES: NightmareRecord[] = [
  T01_LOOKUP,
  T02_SKITTISH,
  T03_MEDDLER,
  T04_SLOW_BURN,
  T05_PACK,
  T06_MIMIC,
  T07_STALKER,
  T08_REVENANT,
  T09_CHORUS,
];

/** Look up a nightmare by its stable ID. */
export function getNightmareById(id: string): NightmareRecord | undefined {
  return ALL_NIGHTMARES.find(n => n.id === id);
}
