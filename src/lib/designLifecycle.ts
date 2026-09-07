import type { AuthoringUnit, CADDefinitionState, CADValueProvenance, Part, ReferenceDesign } from '../types';
import type { RobotArmLoadSizingFinding } from './loadSizing';

export type CanvasEditableKind = 'dimension' | 'constraint' | 'feature' | 'hole' | 'material' | 'mate' | 'load' | 'drawing';

export interface PartLifecycleItem {
  id: string;
  label: string;
  value: string;
  editableKind: CanvasEditableKind;
  definitionState: CADDefinitionState;
  provenance: CADValueProvenance;
  downstreamImpacts: string[];
  reviewableFixes: string[];
}

export interface PartLifecycleEvidence {
  partId: string;
  partName: string;
  overallDefinitionState: CADDefinitionState;
  loopStage: string;
  items: PartLifecycleItem[];
  downstreamImpactSummary: string[];
  automationBoundary: string;
}

const unitFactor = (unit: AuthoringUnit): number => ({ mm: 1, cm: 10, m: 1000, in: 25.4 })[unit];

const formatNumber = (value: number, maximumFractionDigits = 2) => new Intl.NumberFormat('en-US', {
  maximumFractionDigits,
  minimumFractionDigits: 0,
}).format(value);

const formatLength = (valueMm: number | null | undefined, unit: AuthoringUnit): string => {
  if (valueMm == null || !Number.isFinite(valueMm)) return 'unresolved';
  return `${formatNumber(valueMm / unitFactor(unit), unit === 'm' ? 3 : 2)} ${unit}`;
};

const requiredDimensionKeys = (part: Part) => (
  part.authoring.primitive === 'cylinder_joint'
    ? ['diameterMm', 'heightMm'] as const
    : ['lengthMm', 'widthMm', 'heightMm'] as const
);

const dimensionsComplete = (part: Part): boolean => requiredDimensionKeys(part).every((key) => {
  const value = part.authoring.dimensionsMm[key];
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
});

const dimensionState = (part: Part): CADDefinitionState => {
  const values = Object.values(part.authoring.dimensionsMm).filter((value): value is number => typeof value === 'number');
  if (values.some((value) => !Number.isFinite(value) || value <= 0)) return 'over-defined';
  return dimensionsComplete(part) ? 'fully-defined' : 'under-defined';
};

const dimensionValue = (part: Part, units: AuthoringUnit): string => {
  const dims = part.authoring.dimensionsMm;
  if (part.authoring.primitive === 'cylinder_joint') {
    return `OD ${formatLength(dims.diameterMm ?? dims.widthMm, units)}, height ${formatLength(dims.heightMm ?? dims.lengthMm, units)}`;
  }
  return `L ${formatLength(dims.lengthMm, units)}, W ${formatLength(dims.widthMm, units)}, H ${formatLength(dims.heightMm ?? dims.thicknessMm, units)}`;
};

const sketchDefinitionState = (part: Part): CADDefinitionState => {
  const sketch = part.authoring.sketchState;
  if (sketch?.definitionState) return sketch.definitionState;
  if (!sketch) return part.authoring.featureRecipe ? 'provisional' : 'under-defined';
  const summary = sketch.constraintSummary.toLowerCase();
  if (summary.includes('conflict') || summary.includes('over-defined') || summary.includes('invalid')) return 'over-defined';
  if (summary.includes('review') || summary.includes('missing')) return 'under-defined';
  return sketch.operation === 'finish' ? 'fully-defined' : 'provisional';
};

const holeDefinitionState = (part: Part): CADDefinitionState => {
  const hole = part.authoring.holePattern;
  if (!hole) return 'under-defined';
  const dims = part.authoring.dimensionsMm;
  const availableHeight = dims.heightMm ?? dims.lengthMm ?? dims.diameterMm ?? null;
  const edgeDistance = hole.holeDiameterMm * 1.5;
  if (availableHeight != null && (hole.offsetFromBottomMm < edgeDistance || hole.offsetFromBottomMm > availableHeight - edgeDistance)) {
    return 'over-defined';
  }
  return hole.centeredOnWidth ? 'fully-defined' : 'provisional';
};

const materialProvenance = (part: Part): CADValueProvenance => {
  if (!part.authoring.materialId) return 'unresolved';
  return part.authoring.authored ? 'user-defined' : 'inferred';
};

const holeProvenance = (part: Part): CADValueProvenance => {
  const source = part.authoring.holePattern?.source.toLowerCase();
  if (!source) return 'unresolved';
  if (source.includes('default')) return 'defaulted';
  if (source.includes('viewport') || source.includes('user')) return 'user-defined';
  return 'inferred';
};

const requirementsState = (task: ReferenceDesign['task'], loadFinding?: RobotArmLoadSizingFinding): CADDefinitionState => {
  if (task.targetPayloadLb == null || task.reachMeters == null) return 'requirements-incomplete';
  if (loadFinding?.status === 'undersized') return 'over-defined';
  if (loadFinding?.status === 'watch') return 'provisional';
  return 'fully-defined';
};

const priority: Record<CADDefinitionState, number> = {
  'fully-defined': 0,
  provisional: 1,
  'under-defined': 2,
  'requirements-incomplete': 3,
  'over-defined': 4,
};

const overallState = (items: PartLifecycleItem[]): CADDefinitionState => (
  items.reduce((current, item) => priority[item.definitionState] > priority[current] ? item.definitionState : current, 'fully-defined' as CADDefinitionState)
);

export const buildPartLifecycleEvidence = (
  part: Part,
  units: AuthoringUnit,
  task: ReferenceDesign['task'],
  loadFinding?: RobotArmLoadSizingFinding,
): PartLifecycleEvidence => {
  const sketch = part.authoring.sketchState;
  const feature = part.authoring.featureRecipe;
  const hole = part.authoring.holePattern;
  const mateState: CADDefinitionState = !part.authoring.parentPartId
    ? 'under-defined'
    : part.authoring.jointType === 'unassigned' ? 'under-defined' : 'fully-defined';
  const reqState = requirementsState(task, loadFinding);
  const items: PartLifecycleItem[] = [
    {
      id: 'dimension-definition',
      label: 'Dimension definition',
      value: dimensionValue(part, units),
      editableKind: 'dimension',
      definitionState: dimensionState(part),
      provenance: part.authoring.authored ? 'user-defined' : 'inferred',
      downstreamImpacts: ['geometry envelope', 'hole edge distance', 'self-weight estimate', 'drawing dimensions', 'mesh size seeds'],
      reviewableFixes: ['Add missing width, length, height or diameter callouts', 'Resolve impossible or zero dimensions before export'],
    },
    {
      id: 'sketch-relations',
      label: 'Sketch relations',
      value: sketch ? `${sketch.plane}: ${sketch.constraintSummary}` : 'No explicit sketch relations yet',
      editableKind: 'constraint',
      definitionState: sketchDefinitionState(part),
      provenance: sketch?.provenance ?? (sketch ? 'user-defined' : 'unresolved'),
      downstreamImpacts: ['feature regeneration intent', 'drawing constraint notes', 'configuration table fields'],
      reviewableFixes: ['Add centerline, concentric, equal, parallel, or distance relations', 'Mark and resolve over-defined relation conflicts'],
    },
    {
      id: 'feature-history',
      label: 'Feature history',
      value: feature ? `${feature.history.length} steps: ${feature.history.map((step) => step.kind).join(', ') || 'callouts only'}` : 'Feature recipe not generated yet',
      editableKind: 'feature',
      definitionState: feature ? 'provisional' : 'under-defined',
      provenance: feature ? 'inferred' : 'unresolved',
      downstreamImpacts: ['feature tree', 'manufacturing operations', 'drawing views', 'CAD worker recipe'],
      reviewableFixes: ['Add extrude, cut, revolve, chamfer, or fillet operations', 'Confirm feature order before released CAD'],
    },
    {
      id: 'hole-fastener-fit',
      label: 'Hole and fastener fit',
      value: hole ? `${hole.count}x ${formatLength(hole.holeDiameterMm, units)} clearance, ${formatLength(hole.offsetFromBottomMm, units)} from bottom, ${hole.fastenerLabel}` : 'Hole and fastener unresolved',
      editableKind: 'hole',
      definitionState: holeDefinitionState(part),
      provenance: holeProvenance(part),
      downstreamImpacts: ['fastener BOM', 'edge distance review', 'mate or fixture connectors', 'FEA connector assumptions'],
      reviewableFixes: ['Choose off-the-shelf screw size', 'Move the hole away from invalid edge distance', 'Mark centered or offset placement'],
    },
    {
      id: 'material-process',
      label: 'Material and process',
      value: `${part.material}; ${part.manufacturingProcess}`,
      editableKind: 'material',
      definitionState: part.authoring.materialId ? 'fully-defined' : 'requirements-incomplete',
      provenance: materialProvenance(part),
      downstreamImpacts: ['mass estimate', 'yield and stiffness checks', 'process notes', 'BOM cost ranges', 'FEA material card'],
      reviewableFixes: ['Select material and compatible process', 'Review density, yield, modulus, heat limit, and stock form'],
    },
    {
      id: 'assembly-mate',
      label: 'Assembly relation',
      value: part.authoring.parentPartId ? `${part.authoring.jointType} mate to ${part.authoring.parentPartId}` : 'Top-level or unassigned relation',
      editableKind: 'mate',
      definitionState: mateState,
      provenance: part.authoring.parentPartId ? 'user-defined' : 'unresolved',
      downstreamImpacts: ['assembly transform chain', 'wiring route endpoints', 'load path', 'contact and fixture assumptions'],
      reviewableFixes: ['Pick a parent part', 'Choose fixed, revolute, prismatic, or tool-mount mate intent'],
    },
    {
      id: 'requirements-analysis',
      label: 'Requirements and analysis',
      value: task.targetPayloadLb == null
        ? 'Payload unresolved'
        : `${formatNumber(task.targetPayloadLb)} lb payload${task.reachMeters == null ? ', reach unresolved' : ` at ${formatNumber(task.reachMeters, 2)} m reach`}`,
      editableKind: 'load',
      definitionState: reqState,
      provenance: 'estimated',
      downstreamImpacts: ['load sizing highlights', 'actuator and fastener upgrades', 'self-weight estimate', 'analysis job inputs'],
      reviewableFixes: loadFinding?.fix ? [loadFinding.fix.buttonLabel, ...loadFinding.fix.changes] : ['Set payload, reach, safety factor, and self-weight assumptions'],
    },
    {
      id: 'drawing-export',
      label: 'Drawing/BOM/export evidence',
      value: 'Part drawing, BOM row, export metadata, and FEA input preview update from the same selected values',
      editableKind: 'drawing',
      definitionState: 'provisional',
      provenance: 'inferred',
      downstreamImpacts: ['machinist drawing preview', 'BOM/export package', 'revision notes', 'supplier review handoff'],
      reviewableFixes: ['Review tolerances, surface finish, process notes, and exported CAD from future workers'],
    },
  ];
  const state = overallState(items);
  return {
    partId: part.id,
    partName: part.name,
    overallDefinitionState: state,
    loopStage: 'rough sketch -> dimensions/relations -> features -> mates -> analysis -> revise -> drawings/BOM/exports',
    items,
    downstreamImpactSummary: Array.from(new Set(items.flatMap((item) => item.downstreamImpacts))).slice(0, 12),
    automationBoundary: 'Plain-language automation may propose values, but every user-defined, inferred, defaulted, estimated, unresolved, or invalid item stays visible, editable, and review-required before release.',
  };
};
