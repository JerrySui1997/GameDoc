/**
 * crossref.ts
 * Run: npm run crossref
 * Checks that all IDs in `recombines` resolve to actual nightmares.
 */
import { ALL_NIGHTMARES } from '../src/data/nightmares/index';

const ids = new Set(ALL_NIGHTMARES.map(n => n.id));
let allOk = true;

console.log('Cross-reference audit\n');

for (const n of ALL_NIGHTMARES) {
  const refs = n.recombines ?? [];
  const broken = refs.filter(r => !ids.has(r));

  if (broken.length > 0) {
    allOk = false;
    console.error(`[${n.id} ${n.codename}]  BROKEN refs: ${broken.join(', ')}`);
  } else if (refs.length > 0) {
    console.log(`[${n.id} ${n.codename}]  recombines: ${refs.join(', ')}  ✓`);
  } else {
    console.log(`[${n.id} ${n.codename}]  (no recombines)`);
  }
}

// Orphan check: Tier 2+ with no recombines
const orphans = ALL_NIGHTMARES.filter(
  n => (n.tier === 2 || n.tier === 3) && (!n.recombines || n.recombines.length === 0)
);
if (orphans.length > 0) {
  console.warn('\n⚠ Tier 2/3 nightmares with no recombines (consider linking to lower-tier foundations):');
  orphans.forEach(n => console.warn(`  ${n.id} ${n.codename}`));
}

console.log('\n' + (allOk ? '✅ All cross-references resolved.' : '❌ Broken references found.'));
process.exit(allOk ? 0 : 1);
