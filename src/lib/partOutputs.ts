import type {
  AuthoringUnit,
  Part,
  PartAuthoringHolePattern,
  PartAuthoringSketchState,
  ReferenceDesign,
  TaskRequirement,
} from '../types';
import { buildPartLifecycleEvidence, type PartLifecycleEvidence } from './designLifecycle';
import type { RobotArmLoadSizingFinding, RobotArmLoadSizingResult } from './loadSizing';

export interface FastenerCatalogOption {
  id: string;
  label: string;
  spec: string;
  clearanceHoleMm: number;
  minEdgeDistanceMm: number;
  clampRatingLb: number;
  source: string;
}

export interface PartDrawingPreview {
  drawingNumber: string;
  title: string;
  units: AuthoringUnit;
  material: string;
  process: string;
  dimensions: Array<{ label: string; value: string; valueMm: number; note: string }>;
  holeCallouts: string[];
  fastenerCallouts: string[];
  notes: string[];
}

export interface PartFeaInputPreview {
  id: string;
  title: string;
  units: string;
  geometry: {
    primitive: string;
    source: string;
    dimensionsMm: Record<string, number>;
    sketchPlane: string;
    holePattern: PartAuthoringHolePattern | null;
  };
  material: {
    name: string;
    properties: Record<string, unknown>;
    provenance: string;
  };
  loads: {
    payloadLb: number | null;
    assemblySelfWeightLb: number | null;
    reviewLoadLb: number | null;
    safetyFactor: number | null;
    reachMeters: number | null;
    selectedPartCheck: string;
  };
  constraints: string[];
  fasteners: string[];
  assumptions: string[];
  reviewRequired: string[];
}

export interface PartOutputPreview {
  drawing: PartDrawingPreview;
  feaInput: PartFeaInputPreview;
  lifecycleEvidence: PartLifecycleEvidence;
}

const UNIT_FACTOR_TO_MM: Record<AuthoringUnit, number> = {
  mm: 1,
  cm: 10,
  m: 1000,
  in: 25.4,
};

export const fastenerCatalogOptions: FastenerCatalogOption[] = [
  {
    id: 'm4-socket-head',
    label: 'M4 socket head screw',
    spec: 'M4 class 8.8 socket head cap screw',
    clearanceHoleMm: 4.5,
    minEdgeDistanceMm: 8,
    clampRatingLb: 54,
    source: 'ISO clearance seed, local deterministic fixture',
  },
  {
    id: 'm5-socket-head',
    label: 'M5 socket head screw',
    spec: 'M5 class 8.8 socket head cap screw',
    clearanceHoleMm: 5.5,
    minEdgeDistanceMm: 10,
    clampRatingLb: 76,
    source: 'ISO clearance seed, local deterministic fixture',
  },
  {
    id: 'm6-socket-head',
    label: 'M6 socket head screw',
    spec: 'M6 class 10.9 socket head cap screw',
    clearanceHoleMm: 6.6,
    minEdgeDistanceMm: 12,
    clampRatingLb: 112,
    source: 'ISO clearance seed, local deterministic fixture',
  },
  {
    id: 'm8-socket-head',
    label: 'M8 socket head screw',
    spec: 'M8 class 10.9 socket head cap screw',
    clearanceHoleMm: 9,
    minEdgeDistanceMm: 16,
    clampRatingLb: 170,
    source: 'ISO clearance seed, local deterministic fixture',
  },
  {
    id: 'quarter-20-socket-head',
    label: '1/4-20 socket head screw',
    spec: '1/4-20 UNC socket head cap screw',
    clearanceHoleMm: 6.9,
    minEdgeDistanceMm: 12.7,
    clampRatingLb: 112,
    source: 'ANSI clearance seed, local deterministic fixture',
  },
];

const formatNumber = (value: number, maximumFractionDigits = 2): string => new Intl.NumberFormat('en-US', { maximumFractionDigits }).format(value);

const lengthFromMm = (valueMm: number, units: AuthoringUnit): number => valueMm / UNIT_FACTOR_TO_MM[units];

const formatLength = (valueMm: number, units: AuthoringUnit): string => `${formatNumber(lengthFromMm(valueMm, units), units === 'm' ? 3 : 2)} ${units}`;

const dimensionEntriesMm = (part: Part): Record<string, number> => {
  const dimensions = part.authoring.dimensionsMm;
  return Object.fromEntries([
    ['length_mm', dimensions.lengthMm],
    ['width_mm', dimensions.widthMm],
    ['height_mm', dimensions.heightMm],
    ['diameter_mm', dimensions.diameterMm],
    ['thickness_mm', dimensions.thicknessMm],
  ].filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1]) && entry[1] > 0));
};

const primaryEnvelopeMm = (part: Part): { length: number; width: number; height: number } => {
  const dimensions = part.authoring.dimensionsMm;
  const diameter = dimensions.diameterMm ?? dimensions.widthMm ?? dimensions.lengthMm ?? 50;
  if (part.authoring.primitive === 'cylinder_joint') {
    return {
      length: diameter,
      width: diameter,
      height: dimensions.heightMm ?? dimensions.lengthMm ?? diameter,
    };
  }
  return {
    length: dimensions.lengthMm ?? diameter,
    width: dimensions.widthMm ?? diameter,
    height: dimensions.heightMm ?? dimensions.thicknessMm ?? Math.max(12, (dimensions.widthMm ?? 36) * 0.55),
  };
};

const fastenerIdFromPart = (part: Part): string | null => {
  const text = part.fasteners.join(' ').toLowerCase();
  if (text.includes('1/4') || text.includes('quarter')) return 'quarter-20-socket-head';
  if (text.includes('m8')) return 'm8-socket-head';
  if (text.includes('m6')) return 'm6-socket-head';
  if (text.includes('m5')) return 'm5-socket-head';
  if (text.includes('m4')) return 'm4-socket-head';
  return null;
};

export const fastenerOptionById = (fastenerId: string | null | undefined): FastenerCatalogOption => (
  fastenerCatalogOptions.find((option) => option.id === fastenerId) ?? fastenerCatalogOptions[2]!
);

export const defaultFastenerForPart = (part: Part): FastenerCatalogOption => {
  const explicit = fastenerOptionById(fastenerIdFromPart(part));
  if (fastenerIdFromPart(part)) return explicit;
  const envelope = primaryEnvelopeMm(part);
  if (envelope.length >= 180 || part.authoring.primitive === 'base_plate') return fastenerOptionById('m8-socket-head');
  if (envelope.length >= 80 || part.authoring.primitive === 'beam' || part.authoring.primitive === 'motor_block') return fastenerOptionById('m6-socket-head');
  if (part.authoring.primitive === 'electronics' || part.authoring.primitive === 'connector') return fastenerOptionById('m4-socket-head');
  return explicit;
};

export const buildDefaultHolePattern = (part: Part, fastener: FastenerCatalogOption = defaultFastenerForPart(part)): PartAuthoringHolePattern => ({
  id: `hole-pattern-${part.id}`,
  label: 'Centered clearance hole from viewport',
  fastenerId: fastener.id,
  fastenerLabel: fastener.label,
  fastenerSpec: fastener.spec,
  holeDiameterMm: fastener.clearanceHoleMm,
  offsetFromBottomMm: 50.8,
  centeredOnWidth: true,
  count: part.authoring.primitive === 'base_plate' || part.authoring.primitive === 'beam' ? 2 : 1,
  source: 'viewport-fastener-default',
  notes: [
    'Default example places the hole 2 in from the bottom and centered on width.',
    `${fastener.label} selects a ${formatNumber(fastener.clearanceHoleMm, 1)} mm clearance hole and ${formatNumber(fastener.minEdgeDistanceMm, 1)} mm minimum edge-distance seed.`,
    'Verify final hole tolerances, countersink, thread engagement, and bearing fits before release.',
  ],
});

export const defaultSketchStateForPart = (part: Part): PartAuthoringSketchState => {
  const envelope = primaryEnvelopeMm(part);
  return {
    plane: part.authoring.featureRecipe?.plane ?? 'Front plane',
    profile: part.authoring.featureRecipe?.profile ?? (part.authoring.primitive === 'cylinder_joint' ? 'Concentric circle profile with bore' : 'Centered rectangle profile with construction centerlines'),
    constraintSummary: part.authoring.primitive === 'cylinder_joint'
      ? 'Concentric OD/ID, diameter constraints, slot centerline constrained through origin.'
      : 'Centered profile, equal side constraints where symmetric, hole center locked to construction centerline.',
    extrudeDepthMm: envelope.height,
    operation: part.authoring.featureRecipe ? 'cut' : 'sketch',
    definitionState: part.authoring.featureRecipe ? 'provisional' : 'under-defined',
    provenance: part.authoring.featureRecipe ? 'inferred' : 'defaulted',
    notes: [
      'Viewport operation state is stored with the project as visual authoring metadata.',
      'Real parametric constraints must be rebuilt by a CAD worker before manufacturing release.',
    ],
  };
};

export const normalizeHolePattern = (
  part: Part,
  updates: Partial<PartAuthoringHolePattern>,
): PartAuthoringHolePattern => {
  const previous = part.authoring.holePattern ?? buildDefaultHolePattern(part);
  const fastener = fastenerOptionById(updates.fastenerId ?? previous.fastenerId);
  const offsetFromBottomMm = typeof updates.offsetFromBottomMm === 'number' && Number.isFinite(updates.offsetFromBottomMm) && updates.offsetFromBottomMm > 0
    ? updates.offsetFromBottomMm
    : previous.offsetFromBottomMm;
  const count = typeof updates.count === 'number' && Number.isFinite(updates.count) && updates.count > 0
    ? Math.round(updates.count)
    : previous.count;
  return {
    ...previous,
    ...updates,
    id: previous.id,
    fastenerId: fastener.id,
    fastenerLabel: fastener.label,
    fastenerSpec: fastener.spec,
    holeDiameterMm: fastener.clearanceHoleMm,
    offsetFromBottomMm,
    centeredOnWidth: updates.centeredOnWidth ?? previous.centeredOnWidth,
    count,
    source: 'viewport-fastener-default',
    notes: [
      'Hole placement was edited from the viewport-anchored inspector.',
      `Hole center is ${formatNumber(offsetFromBottomMm, 1)} mm from the bottom${updates.centeredOnWidth ?? previous.centeredOnWidth ? ' and centered on width' : ''}.`,
      `${fastener.label} drives a ${formatNumber(fastener.clearanceHoleMm, 1)} mm clearance hole from the local deterministic fastener table.`,
    ],
  };
};

const dimensionRows = (part: Part, units: AuthoringUnit): PartDrawingPreview['dimensions'] => {
  const dimensions = part.authoring.dimensionsMm;
  const rows: PartDrawingPreview['dimensions'] = [];
  const add = (label: string, valueMm: number | null | undefined, note: string) => {
    if (typeof valueMm === 'number' && Number.isFinite(valueMm) && valueMm > 0) {
      rows.push({ label, value: formatLength(valueMm, units), valueMm, note });
    }
  };
  add('Length', dimensions.lengthMm, 'Primary envelope or link span');
  add('Width', dimensions.widthMm, 'Secondary envelope or bracket width');
  add('Height', dimensions.heightMm, 'Extrude height, plate thickness, or block height');
  add('Diameter', dimensions.diameterMm, 'Outer cylinder diameter or joint body diameter');
  add('Wall thickness', dimensions.thicknessMm, 'Seed wall, sheet, or rib thickness');
  return rows;
};

export const buildPartDrawingPreview = (part: Part, units: AuthoringUnit): PartDrawingPreview => {
  const holePattern = part.authoring.holePattern ?? buildDefaultHolePattern(part);
  return {
    drawingNumber: `MFCAD-${part.id.toUpperCase()}`,
    title: `${part.name} machinist drawing preview`,
    units,
    material: part.material,
    process: part.manufacturingProcess,
    dimensions: dimensionRows(part, units),
    holeCallouts: [
      `${holePattern.count}x ${formatLength(holePattern.holeDiameterMm, units)} clearance hole for ${holePattern.fastenerLabel}.`,
      `Hole center ${formatLength(holePattern.offsetFromBottomMm, units)} from bottom, ${holePattern.centeredOnWidth ? 'centered on width' : 'offset requires review'}.`,
    ],
    fastenerCallouts: [holePattern.fastenerSpec, ...part.fasteners.filter((fastener) => fastener !== holePattern.fastenerSpec)].slice(0, 4),
    notes: [
      `Sketch plane: ${part.authoring.sketchState?.plane ?? part.authoring.featureRecipe?.plane ?? 'Front plane review required'}.`,
      `Sketch profile: ${part.authoring.sketchState?.profile ?? part.authoring.featureRecipe?.profile ?? 'Visual primitive envelope profile'}.`,
      'Export preview is deterministic local metadata, not a released drawing or supplier quote.',
      'Add tolerances, datum scheme, surface finish, named CAD faces, and inspection plan before release.',
    ],
  };
};

export const buildPartFeaInputPreview = (
  part: Part,
  task: TaskRequirement,
  loadSizingResult: RobotArmLoadSizingResult | null = null,
  loadSizingFinding?: RobotArmLoadSizingFinding,
): PartFeaInputPreview => {
  const readiness = part.analysisReadiness;
  const materialProperties = readiness.material_properties;
  const holePattern = part.authoring.holePattern ?? null;
  return {
    id: `fea-input-${part.id}`,
    title: `${part.name} FEA input preview`,
    units: 'mm, N, MPa',
    geometry: {
      primitive: part.authoring.primitive,
      source: readiness.solver_inputs.geometry_source ?? 'visual primitive dimensions, CAD worker source file still required',
      dimensionsMm: dimensionEntriesMm(part),
      sketchPlane: part.authoring.sketchState?.plane ?? part.authoring.featureRecipe?.plane ?? 'Front plane review required',
      holePattern,
    },
    material: {
      name: materialProperties?.material_name ?? part.material,
      properties: materialProperties?.properties ?? {},
      provenance: materialProperties?.provenance ?? 'review-required seed material',
    },
    loads: {
      payloadLb: task.targetPayloadLb,
      assemblySelfWeightLb: loadSizingResult?.requirement.assemblySelfWeightLb ?? null,
      reviewLoadLb: loadSizingResult?.designReviewLoadLb ?? null,
      safetyFactor: task.safetyFactorMin ?? loadSizingResult?.requirement.safetyFactor ?? null,
      reachMeters: task.reachMeters,
      selectedPartCheck: loadSizingFinding
        ? `${loadSizingFinding.componentRole}: ${loadSizingFinding.status}, required ${formatNumber(loadSizingFinding.requiredValue)} ${loadSizingFinding.unit}.`
        : 'No selected-part load finding is active. Use requirement sizing before solving.',
    },
    constraints: [
      ...readiness.constraints.map((constraint) => `${constraint.name}: ${constraint.region} (${constraint.constraint_type})`),
      ...(holePattern ? [`Fastener support around ${holePattern.fastenerLabel}, hole ${formatNumber(holePattern.holeDiameterMm, 1)} mm, offset ${formatNumber(holePattern.offsetFromBottomMm, 1)} mm from bottom.`] : []),
    ].slice(0, 5),
    fasteners: [holePattern?.fastenerSpec, ...part.fasteners].filter((fastener): fastener is string => Boolean(fastener)).slice(0, 5),
    assumptions: [
      `Payload plus self-weight: ${loadSizingResult ? `${formatNumber(loadSizingResult.workingLoadLb)} lb working load, ${formatNumber(loadSizingResult.designReviewLoadLb)} lb review load` : 'run requirement sizing for current self-weight estimate'}.`,
      `Reach: ${task.reachMeters == null ? 'review required' : `${formatNumber(task.reachMeters, 3)} m`}; safety factor: ${task.safetyFactorMin ?? loadSizingResult?.requirement.safetyFactor ?? 'review required'}.`,
      ...readiness.solver_inputs.notes,
    ],
    reviewRequired: [
      ...readiness.review_required,
      'Verify hole edge distance, fastener preload, and contact regions before meshing.',
      'Replace visual primitive geometry with named CAD faces before a real solve.',
    ].slice(0, 8),
  };
};

export const buildPartOutputPreview = (
  part: Part,
  units: AuthoringUnit,
  task: TaskRequirement,
  loadSizingResult: RobotArmLoadSizingResult | null = null,
  loadSizingFinding?: RobotArmLoadSizingFinding,
): PartOutputPreview => ({
  drawing: buildPartDrawingPreview(part, units),
  feaInput: buildPartFeaInputPreview(part, task, loadSizingResult, loadSizingFinding),
  lifecycleEvidence: buildPartLifecycleEvidence(part, units, task, loadSizingFinding),
});

export const buildAllPartOutputPreviews = (design: ReferenceDesign): PartOutputPreview[] => {
  const fallbackSelfWeightLb = Number(design.assemblies.flatMap((assembly) => assembly.parts)
    .reduce((sum, part) => sum + (part.weightLb ?? 0), 0).toFixed(1));
  const syntheticLoadSizing = design.task.targetPayloadLb == null ? null : {
    requirement: {
      payloadLb: design.task.targetPayloadLb,
      assemblySelfWeightLb: fallbackSelfWeightLb,
      reachMeters: design.task.reachMeters ?? 0,
      safetyFactor: design.task.safetyFactorMin ?? 1,
    },
    designReviewLoadLb: Number(((design.task.targetPayloadLb + fallbackSelfWeightLb) * (design.task.safetyFactorMin ?? 1)).toFixed(1)),
    workingLoadLb: Number((design.task.targetPayloadLb + fallbackSelfWeightLb).toFixed(1)),
  } as RobotArmLoadSizingResult;
  return design.assemblies.flatMap((assembly) => assembly.parts.map((part) => buildPartOutputPreview(part, design.units, design.task, syntheticLoadSizing)));
};
