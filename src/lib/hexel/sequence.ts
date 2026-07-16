// Pure editable-level-sequence operations. A sequence is a chain of sparse
// deltas over the base scene, so terrain and annotation edits remain editable
// without duplicating thousands of cells in every presentation step.

import {
  cellKey,
  type Annotation,
  type Cell,
  type HexelScene,
  type Rotation,
  type SequenceAnnotationChange,
  type SequenceCamera,
  type SequenceCellChange,
  type SequenceLayers,
  type SequenceStep,
} from './types';

export type SequenceDefaults = {
  camera: SequenceCamera;
  layers: SequenceLayers;
};

export function sequenceDefaults(scene: HexelScene): SequenceDefaults {
  return {
    camera: { rotation: scene.defaultRot as Rotation, floorZ: 0, zoom: 1, tx: 0, ty: 0 },
    layers: { semantics: true, routes: true, routeId: null, routeProgress: 0 },
  };
}

export function applyCellChanges(cells: Cell[], changes: SequenceCellChange[]): Cell[] {
  const byKey = new Map(cells.map((cell) => [cellKey(cell), { ...cell }]));
  for (const change of changes) {
    const key = cellKey(change);
    if (change.t === null) byKey.delete(key);
    else byKey.set(key, { x: change.x, y: change.y, z: change.z, t: change.t });
  }
  return [...byKey.values()];
}

export function applyAnnotationChanges(
  annotations: Annotation[],
  changes: SequenceAnnotationChange[],
): Annotation[] {
  const byId = new Map(annotations.map((annotation) => [annotation.id, cloneAnnotation(annotation)]));
  for (const change of changes) {
    if (change.action === 'remove') {
      byId.delete(change.id);
    } else if (change.annotation) {
      byId.set(change.id, cloneAnnotation(change.annotation));
    }
  }
  return [...byId.values()];
}

export function resolveSequence(scene: HexelScene, index: number): HexelScene {
  const steps = scene.sequence ?? [];
  if (index < 0 || steps.length === 0) return scene;
  let cells = scene.cells.map((cell) => ({ ...cell }));
  let annotations = scene.annotations.map(cloneAnnotation);
  for (const step of steps.slice(0, index + 1)) {
    cells = applyCellChanges(cells, step.cellChanges);
    annotations = applyAnnotationChanges(annotations, step.annotationChanges);
  }
  return { ...scene, cells, annotations };
}

export function diffCells(base: Cell[], next: Cell[]): SequenceCellChange[] {
  const before = new Map(base.map((cell) => [cellKey(cell), cell]));
  const after = new Map(next.map((cell) => [cellKey(cell), cell]));
  const keys = new Set([...before.keys(), ...after.keys()]);
  const changes: SequenceCellChange[] = [];
  for (const key of keys) {
    const prior = before.get(key);
    const current = after.get(key);
    if (!current) {
      if (prior) changes.push({ x: prior.x, y: prior.y, z: prior.z, t: null });
    } else if (!prior || prior.t !== current.t) {
      changes.push({ x: current.x, y: current.y, z: current.z, t: current.t });
    }
  }
  return changes;
}

export function diffAnnotations(base: Annotation[], next: Annotation[]): SequenceAnnotationChange[] {
  const before = new Map(base.map((annotation) => [annotation.id, annotation]));
  const after = new Map(next.map((annotation) => [annotation.id, annotation]));
  const ids = new Set([...before.keys(), ...after.keys()]);
  const changes: SequenceAnnotationChange[] = [];
  for (const id of ids) {
    const prior = before.get(id);
    const current = after.get(id);
    if (!current) {
      changes.push({ id, action: 'remove', annotation: null });
    } else if (!prior || JSON.stringify(prior) !== JSON.stringify(current)) {
      changes.push({ id, action: 'upsert', annotation: cloneAnnotation(current) });
    }
  }
  return changes;
}

export function updateSequenceStep(
  source: HexelScene,
  index: number,
  resolved: HexelScene,
): HexelScene {
  const prior = resolveSequence(source, index - 1);
  const steps = source.sequence ?? [];
  const current = steps[index];
  if (!current) return source;
  const sequence = steps.map((step, stepIndex) => stepIndex === index
    ? {
        ...step,
        cellChanges: diffCells(prior.cells, resolved.cells),
        annotationChanges: diffAnnotations(prior.annotations, resolved.annotations),
      }
    : step);
  return { ...source, sequence };
}

export function updateSequenceStepPresentation(
  source: HexelScene,
  index: number,
  patch: {
    camera?: Partial<SequenceCamera>;
    layers?: Partial<SequenceLayers>;
    overlays?: SequenceStep['overlays'];
    title?: string;
    narration?: string;
  },
): HexelScene {
  const steps = source.sequence ?? [];
  if (!steps[index]) return source;
  const sequence = steps.map((step, stepIndex) => stepIndex === index
    ? {
        ...step,
        title: patch.title ?? step.title,
        narration: patch.narration ?? step.narration,
        camera: patch.camera ? { ...step.camera, ...patch.camera } : step.camera,
        layers: patch.layers ? { ...step.layers, ...patch.layers } : step.layers,
        overlays: patch.overlays ?? step.overlays,
      }
    : step);
  return { ...source, sequence };
}

export function makeSequenceStep(
  source: HexelScene,
  title: string,
  camera?: SequenceCamera,
  layers?: SequenceLayers,
): SequenceStep {
  const defaults = sequenceDefaults(source);
  return {
    id: `step-${Date.now().toString(36)}-${(source.sequence ?? []).length + 1}`,
    title,
    narration: '',
    durationMs: null,
    cellChanges: [],
    annotationChanges: [],
    camera: camera ?? defaults.camera,
    layers: layers ?? defaults.layers,
    overlays: [],
  };
}

export function appendSequenceStep(
  source: HexelScene,
  title: string,
  camera?: SequenceCamera,
  layers?: SequenceLayers,
): { scene: HexelScene; index: number } {
  const step = makeSequenceStep(source, title, camera, layers);
  const sequence = source.sequence ?? [];
  return { scene: { ...source, sequence: [...sequence, step] }, index: sequence.length };
}

function cloneAnnotation(annotation: Annotation): Annotation {
  return {
    ...annotation,
    anchor: { ...annotation.anchor },
    withAnchor: annotation.withAnchor ? { ...annotation.withAnchor } : null,
    links: [...annotation.links],
    path: (annotation.path ?? []).map((point) => ({ ...point })),
  };
}
