// Phase 1 baseline — proves the harness itself before any product scenario is
// layered on. Reuses the shipped seedScene() so a harness bug can't hide behind
// a scenario-authoring bug.
import { seedScene } from '../../../src/lib/hexel/types';
import { assert, type Scenario } from '../lib';

export const baseline: Scenario = {
  key: 'baseline-seed',
  title: 'Baseline — shipped seed scene',
  build: () => seedScene(),
  expect: (g) => {
    assert.ok(g.spaces.length >= 2, `expected garden + house, got ${g.spaces.length} spaces`);
    assert.ok(g.features.some((f) => f.kind === 'chest'), 'expected a chest feature');
    assert.ok(g.relations.some((r) => r.kind === 'door'), 'expected a door relation');
  },
};
