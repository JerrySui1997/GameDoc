// Hexel product stress-test runner (plans/03-hexel-stress-test.md).
//   npm run hexel-scenarios            # build + infer + assert every scenario
//   npm run hexel-scenarios -- --publish  # also write out/<key>.json page bodies
import { runScenarios } from './lib';
import { baseline } from './scenarios/baseline';
import { dungeonUnrolled, dungeonStackedCollapse } from './scenarios/dungeon-multifloor';
import { cityBlock } from './scenarios/city-block';
import { mansionAnnotations } from './scenarios/mansion-annotations';
import { rtsSkirmish } from './scenarios/rts-skirmish';
import { originalTacticalMap } from './scenarios/original-tactical-map';
import { originalCityPlan } from './scenarios/original-city-plan';

runScenarios([
  baseline,
  dungeonUnrolled,
  dungeonStackedCollapse,
  cityBlock,
  mansionAnnotations,
  rtsSkirmish,
  originalTacticalMap,
  originalCityPlan,
]);
