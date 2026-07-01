/**
 * validate-nightmares.ts
 * Run: npm run validate
 * Checks every nightmare in ALL_NIGHTMARES against the Zod schema.
 */
import { ALL_NIGHTMARES } from '../src/data/nightmares/index';
import { NightmareRecord } from '../src/lib/schema/nightmare';

let allPassed = true;

for (const nightmare of ALL_NIGHTMARES) {
  const result = NightmareRecord.safeParse(nightmare);
  if (result.success) {
    console.log(`[${nightmare.id} ${nightmare.codename}]  PASS ✓`);
  } else {
    allPassed = false;
    console.error(`[${nightmare.id} ${nightmare.codename}]  FAIL ✗`);
    for (const issue of result.error.issues) {
      console.error(`  • ${issue.path.join('.')}: ${issue.message}`);
    }
  }
}

console.log('\n' + (allPassed ? '✅ All nightmares valid.' : '❌ Validation failed.'));
process.exit(allPassed ? 0 : 1);
