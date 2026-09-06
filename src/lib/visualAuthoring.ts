import type {
  AnalysisReadinessPreview,
  AuthoringUnit,
  BackendAssembly,
  BackendBOMItem,
  BackendElectronicsComponent,
  BackendManufacturingOption,
  BackendPart,
  BackendProject,
  BackendProjectFile,
  BackendProjectPanelData,
  BackendRouteEndpoint,
  BackendVector3,
  BackendWireSegment,
  BackendWiringRuleSet,
  BackendWiringRoute,
  CADJointType,
  CADPrimitiveShape,
  ReferenceDesign,
} from '../types';
import { mapProjectPanelDataToReferenceDesign } from './backendMapper';

export const unitOptions: Array<{ value: AuthoringUnit; label: string; factorToMm: number }> = [
  { value: 'mm', label: 'millimeters', factorToMm: 1 },
  { value: 'cm', label: 'centimeters', factorToMm: 10 },
  { value: 'm', label: 'meters', factorToMm: 1000 },
  { value: 'in', label: 'inches', factorToMm: 25.4 },
];

const unitFactor = (unit: AuthoringUnit): number => unitOptions.find((option) => option.value === unit)?.factorToMm ?? 1;

export const lengthFromMm = (valueMm: number, unit: AuthoringUnit): number => valueMm / unitFactor(unit);

export const lengthToMm = (value: number, unit: AuthoringUnit): number => value * unitFactor(unit);

export const formatLength = (valueMm: number, unit: AuthoringUnit, maximumFractionDigits = unit === 'm' ? 3 : 2): string => (
  `${new Intl.NumberFormat('en-US', { maximumFractionDigits }).format(lengthFromMm(valueMm, unit))} ${unit}`
);

const cloneProject = (project: BackendProject): BackendProject => structuredClone(project);

const isRecord = (value: unknown): value is Record<string, unknown> => value != null && typeof value === 'object' && !Array.isArray(value);

const numberValue = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null;

const visualMetadata = (project: BackendProject): Record<string, unknown> => {
  const metadata = isRecord(project.metadata) ? { ...project.metadata } : {};
  const visual = isRecord(metadata.visual_authoring) ? { ...metadata.visual_authoring } : {};
  metadata.visual_authoring = visual;
  project.metadata = metadata;
  return visual;
};

const normalizePartVisualAuthoring = (part: BackendPart): Record<string, unknown> => {
  const metadata = isRecord(part.metadata) ? { ...part.metadata } : {};
  const visual = isRecord(metadata.visual_authoring) ? { ...metadata.visual_authoring } : {};
  metadata.visual_authoring = visual;
  part.metadata = metadata;
  return visual;
};

const flattenParts = (project: BackendProject): BackendPart[] => project.assemblies.flatMap((assembly) => assembly.parts);

const findAssembly = (project: BackendProject, assemblyId: string): BackendAssembly | null => (
  project.assemblies.find((assembly) => assembly.id === assemblyId) ?? null
);

const findPart = (project: BackendProject, partId: string): BackendPart | null => (
  flattenParts(project).find((part) => part.id === partId) ?? null
);

const activeManufacturingOption = (part: BackendPart): BackendManufacturingOption | undefined => {
  const preferred = typeof part.metadata?.preferred_manufacturing_process === 'string'
    ? part.metadata.preferred_manufacturing_process
    : undefined;
  return part.manufacturing_options.find((option) => option.process === preferred) ?? part.manufacturing_options[0];
};

const projectManufacturingOptions = (project: BackendProject) => project.assemblies.flatMap((assembly) =>
  assembly.parts.map((part) => ({
    part_id: part.id,
    part_name: part.name,
    material_id: part.material_id,
    options: part.manufacturing_options,
  })),
);

const projectBomItems = (project: BackendProject): BackendBOMItem[] => {
  const items = new Map<string, BackendBOMItem>();
  for (const part of flattenParts(project)) {
    const option = activeManufacturingOption(part);
    items.set(`bom-${part.id}`, {
      id: `bom-${part.id}`,
      part_id: part.id,
      name: part.name,
      quantity: 1,
      unit: 'part',
      price: option?.cost ?? null,
      lead_time_days_min: option?.lead_time_days_min ?? null,
      lead_time_days_max: option?.lead_time_days_max ?? null,
      license_or_terms: option
        ? 'Estimated from active visual authoring manufacturing option; not a supplier quote.'
        : 'Derived from visual authoring project metadata; price review required.',
    });
  }
  for (const component of project.electronics_components ?? []) {
    for (const id of component.bom_item_ids ?? []) {
      if (!items.has(id)) {
        items.set(id, {
          id,
          part_id: component.mounted_part_id ?? null,
          name: component.name,
          quantity: 1,
          unit: 'each',
          price: null,
          lead_time_days_min: null,
          lead_time_days_max: null,
          license_or_terms: 'Visual authoring electronics BOM placeholder; review required.',
        });
      }
    }
  }
  for (const segment of project.wire_segments ?? []) {
    if (!segment.bom_item_id || items.has(segment.bom_item_id)) continue;
    items.set(segment.bom_item_id, {
      id: segment.bom_item_id,
      part_id: null,
      name: segment.name,
      quantity: Math.max(0.1, Number(((segment.length_mm ?? 100) / 1000).toFixed(3))),
      unit: 'm',
      price: null,
      lead_time_days_min: null,
      lead_time_days_max: null,
      license_or_terms: 'Visual authoring harness BOM placeholder; review required.',
    });
  }
  return [...items.values()];
};

export const panelDataFromProject = (
  project: BackendProject,
  analysisReadinessPreviews: AnalysisReadinessPreview[] = [],
): BackendProjectPanelData => {
  const visual = isRecord(project.metadata?.visual_authoring) ? project.metadata.visual_authoring : {};
  const reachMm = numberValue(visual.reach_mm);
  const reachTask = reachMm == null ? [] : [{
    id: 'task-visual-authoring-reach',
    kind: 'reach',
    description: 'Visual authoring reach target from the local CAD workspace.',
    target_value: reachMm / 1000,
    unit: 'm',
    safety_factor_min: null,
    validation_method: 'review',
    assumptions: ['Reach target is used to prefill MVP geometry only; it is not a motion solver result.'],
  }];
  return {
    project,
    task_requirements: [...(project.active_task ? [project.active_task] : []), ...reachTask],
    bom_items: projectBomItems(project),
    manufacturing_options: projectManufacturingOptions(project),
    electronics_components: project.electronics_components ?? [],
    wire_segments: project.wire_segments ?? [],
    wiring_rules: project.wiring_rules ?? [],
    wiring_routes: project.assemblies.flatMap((assembly) => assembly.wiring_routes ?? []),
    wiring_review: null,
    reports: project.reports ?? [],
    analysis_readiness_previews: analysisReadinessPreviews,
    analysis_job_queue: null,
  };
};

export const remapDesignFromProject = (
  current: ReferenceDesign,
  project: BackendProject,
  selectedAnalysisReadinessPreviews: AnalysisReadinessPreview[] = current.analysisReadinessPreviews,
): ReferenceDesign => {
  const mapped = mapProjectPanelDataToReferenceDesign(
    panelDataFromProject(project, selectedAnalysisReadinessPreviews),
    undefined,
    current.backend.apiBaseUrl,
  );
  return {
    ...mapped,
    task: {
      ...mapped.task,
      cycleTimeSeconds: mapped.task.cycleTimeSeconds ?? current.task.cycleTimeSeconds,
      serviceGoal: mapped.task.serviceGoal ?? current.task.serviceGoal,
      safetyFactorMin: mapped.task.safetyFactorMin ?? current.task.safetyFactorMin,
      validationMethod: mapped.task.validationMethod ?? current.task.validationMethod,
    },
    sourceUrl: current.sourceUrl,
    license: current.license,
    formats: current.formats,
    backend: {
      ...mapped.backend,
      source: current.backend.source,
      apiBaseUrl: current.backend.apiBaseUrl,
      concepts: current.backend.concepts,
      advisoryNotice: current.backend.advisoryNotice,
      integrationStubs: current.backend.integrationStubs,
    },
  };
};

const projectWithDesignAuthoring = (design: ReferenceDesign): BackendProject => {
  const next = cloneProject(design.backendProject);
  next.units = design.units;
  const projectVisual = visualMetadata(next);
  projectVisual.units = design.units;
  if (design.task.reachMeters != null) projectVisual.reach_mm = design.task.reachMeters * 1000;
  const designParts = new Map(design.assemblies.flatMap((assembly) => assembly.parts.map((part) => [part.id, part])));
  for (const part of flattenParts(next)) {
    const source = designParts.get(part.id);
    if (!source) continue;
    const visual = normalizePartVisualAuthoring(part);
    Object.assign(visual, {
      authored: source.authoring.authored,
      primitive: source.authoring.primitive,
      position_mm: source.authoring.positionMm,
      rotation_deg: source.authoring.rotationDeg,
      color: source.authoring.color,
      parent_part_id: source.authoring.parentPartId,
      joint_type: source.authoring.jointType,
      assigned_to_part_id: source.authoring.assignedToPartId,
      connector_id: source.authoring.connectorId,
    });
    part.dimensions = {
      ...part.dimensions,
      length_mm: source.authoring.dimensionsMm.lengthMm ?? part.dimensions.length_mm,
      width_mm: source.authoring.dimensionsMm.widthMm ?? part.dimensions.width_mm,
      height_mm: source.authoring.dimensionsMm.heightMm ?? part.dimensions.height_mm,
      diameter_mm: source.authoring.dimensionsMm.diameterMm ?? part.dimensions.diameter_mm,
      thickness_mm: source.authoring.dimensionsMm.thicknessMm ?? part.dimensions.thickness_mm,
    };
  }
  return next;
};

export const buildLocalProjectFile = (design: ReferenceDesign): BackendProjectFile => ({
  format: 'mechaflow-cad.project',
  schema_version: '1.0',
  metadata: {
    exported_at: new Date().toISOString(),
    source_api_version: '0.1.0-local-visual-authoring',
    exported_by: 'mechaflow-cad-visual-authoring-workspace',
    notes: [
      'Local visual CAD authoring MVP project file.',
      'Parts, assembly chain metadata, units, equipment blocks, connectors, and wire route polylines are persisted as schema data.',
      'This is not parametric CAD, FEA, exact electrical validation, or a supplier quote.',
    ],
  },
  project: projectWithDesignAuthoring(design),
  analysis_readiness_previews: design.analysisReadinessPreviews,
  extensions: {
    visual_authoring_mvp: {
      renderer: 'react-svg-xyz-grid',
      limitation: 'MVP visual primitives only. Future FreeCAD workers must replace this with real CAD geometry artifacts.',
    },
  },
});

export const updateProjectUnits = (project: BackendProject, units: AuthoringUnit): BackendProject => {
  const next = cloneProject(project);
  next.units = units;
  const visual = visualMetadata(next);
  visual.units = units;
  next.updated_at = new Date().toISOString();
  return next;
};

export const updateProjectTargets = (
  project: BackendProject,
  updates: { payloadLb?: number | null; reachMm?: number | null },
): BackendProject => {
  const next = cloneProject(project);
  if (updates.payloadLb != null && next.active_task) {
    next.active_task = {
      ...next.active_task,
      kind: 'lift_payload',
      target_value: updates.payloadLb,
      unit: 'lb',
      validation_method: next.active_task.validation_method ?? 'heuristic',
    };
  }
  if (updates.reachMm != null) {
    const visual = visualMetadata(next);
    visual.reach_mm = updates.reachMm;
  }
  next.updated_at = new Date().toISOString();
  return next;
};

const setPartInProject = (project: BackendProject, partId: string, updater: (part: BackendPart) => BackendPart): BackendProject => ({
  ...project,
  assemblies: project.assemblies.map((assembly) => ({
    ...assembly,
    parts: assembly.parts.map((part) => part.id === partId ? updater(part) : part),
  })),
  updated_at: new Date().toISOString(),
});

export const updatePartGeometry = (
  project: BackendProject,
  partId: string,
  updates: {
    dimensions?: Partial<{ lengthMm: number; widthMm: number; heightMm: number; diameterMm: number; thicknessMm: number }>;
    position?: Partial<BackendVector3>;
    rotationZDeg?: number;
    materialId?: string;
    manufacturingProcess?: string;
  },
): BackendProject => {
  const next = cloneProject(project);
  return setPartInProject(next, partId, (part) => {
    const visual = normalizePartVisualAuthoring(part);
    if (updates.position) {
      visual.position_mm = {
        ...(isRecord(visual.position_mm) ? visual.position_mm : {}),
        ...updates.position,
      };
    }
    if (updates.rotationZDeg != null) {
      visual.rotation_deg = {
        ...(isRecord(visual.rotation_deg) ? visual.rotation_deg : {}),
        z: updates.rotationZDeg,
      };
    }
    const nextDimensions = { ...part.dimensions };
    if (updates.dimensions) {
      if (updates.dimensions.lengthMm != null) nextDimensions.length_mm = updates.dimensions.lengthMm;
      if (updates.dimensions.widthMm != null) nextDimensions.width_mm = updates.dimensions.widthMm;
      if (updates.dimensions.heightMm != null) nextDimensions.height_mm = updates.dimensions.heightMm;
      if (updates.dimensions.diameterMm != null) nextDimensions.diameter_mm = updates.dimensions.diameterMm;
      if (updates.dimensions.thicknessMm != null) nextDimensions.thickness_mm = updates.dimensions.thicknessMm;
    }
    const metadata = { ...(isRecord(part.metadata) ? part.metadata : {}) };
    if (updates.manufacturingProcess) metadata.preferred_manufacturing_process = updates.manufacturingProcess;
    return {
      ...part,
      material_id: updates.materialId ?? part.material_id,
      dimensions: nextDimensions,
      mass_kg: updates.dimensions || updates.materialId ? null : part.mass_kg,
      metadata,
    };
  });
};

const slug = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item';

const uniqueId = (existing: Set<string>, prefix: string): string => {
  for (let index = existing.size + 1; index < existing.size + 200; index += 1) {
    const id = `${prefix}-${index}`;
    if (!existing.has(id)) return id;
  }
  return `${prefix}-${Date.now()}`;
};

const processLabel = (process: string): string => process.replaceAll('_', ' ');

const defaultManufacturingOptions = (kind: CADPrimitiveShape): BackendManufacturingOption[] => {
  const commonCost = { currency: 'USD', min: 12, max: 65, confidence: 'estimated_from_heuristic' };
  if (kind === 'motor_block') {
    return [{
      id: 'mfg-visual-motor-buy',
      process: 'off_the_shelf',
      description: 'Off-the-shelf motor or actuator block placeholder for visual layout.',
      cost: { currency: 'USD', min: 45, max: 260, confidence: 'estimated_from_heuristic' },
      lead_time_days_min: 2,
      lead_time_days_max: 14,
      supplier_url: null,
      risk_notes: ['Motor torque, thermal rise, controller sizing, and fit are review-required.'],
      confidence: 'estimated_from_heuristic',
    }];
  }
  if (kind === 'connector') {
    return [{
      id: 'mfg-visual-connector-buy',
      process: 'off_the_shelf',
      description: 'Connector block placeholder for harness authoring.',
      cost: { currency: 'USD', min: 3, max: 28, confidence: 'estimated_from_heuristic' },
      lead_time_days_min: 2,
      lead_time_days_max: 10,
      supplier_url: null,
      risk_notes: ['Connector current, pinout, and environmental rating need review.'],
      confidence: 'estimated_from_heuristic',
    }];
  }
  if (kind === 'bracket') {
    return [{
      id: 'mfg-visual-bracket-sheet',
      process: 'sheet_metal',
      description: 'Sheet metal bracket placeholder with bend and hole pattern review required.',
      cost: commonCost,
      lead_time_days_min: 3,
      lead_time_days_max: 9,
      supplier_url: null,
      risk_notes: ['Bend allowance, tolerance stack, and fastener edge distance are not solved.'],
      confidence: 'estimated_from_heuristic',
    }];
  }
  return [{
    id: `mfg-visual-${kind}-cnc`,
    process: 'cnc_machining',
    description: `${processLabel(kind)} visual primitive with editable dimensions.`,
    cost: commonCost,
    lead_time_days_min: 3,
    lead_time_days_max: 10,
    supplier_url: null,
    risk_notes: ['Visual authoring dimensions are not a supplier quote or a manufactured drawing.'],
    confidence: 'estimated_from_heuristic',
  }];
};

const defaultDimensions = (kind: CADPrimitiveShape) => {
  if (kind === 'base_plate') return { length_mm: 220, width_mm: 160, height_mm: 10, thickness_mm: 10, metadata: {} };
  if (kind === 'beam') return { length_mm: 220, width_mm: 42, height_mm: 34, thickness_mm: 6, metadata: {} };
  if (kind === 'cylinder_joint') return { length_mm: 72, width_mm: 72, height_mm: 72, diameter_mm: 72, thickness_mm: 12, metadata: { bearing_bore_mm: 28 } };
  if (kind === 'bracket') return { length_mm: 88, width_mm: 54, height_mm: 74, thickness_mm: 6, metadata: {} };
  if (kind === 'motor_block') return { length_mm: 84, width_mm: 72, height_mm: 72, diameter_mm: 52, thickness_mm: null, metadata: {} };
  if (kind === 'connector') return { length_mm: 34, width_mm: 24, height_mm: 18, thickness_mm: null, metadata: {} };
  return { length_mm: 96, width_mm: 58, height_mm: 12, thickness_mm: 2, metadata: {} };
};

const defaultPartName = (kind: CADPrimitiveShape): string => {
  if (kind === 'base_plate') return 'Base plate';
  if (kind === 'beam') return 'Link beam';
  if (kind === 'cylinder_joint') return 'Cylinder joint';
  if (kind === 'bracket') return 'Mounting bracket';
  if (kind === 'motor_block') return 'Motor block';
  if (kind === 'connector') return 'Harness connector';
  if (kind === 'tool') return 'Tool plate';
  return 'Electronics block';
};

const defaultMaterialId = (project: BackendProject, kind: CADPrimitiveShape): string | null => {
  const preferred = kind === 'motor_block'
    ? 'mat-low-carbon-steel'
    : kind === 'connector' || kind === 'electronics'
      ? 'mat-fr4-generic'
      : 'mat-aluminum-6061-t6';
  return project.materials.some((material) => material.id === preferred) ? preferred : project.materials[0]?.id ?? null;
};

const nextPosition = (assembly: BackendAssembly): BackendVector3 => {
  const visualPositions = assembly.parts.map((part) => {
    const visual = isRecord(part.metadata?.visual_authoring) ? part.metadata.visual_authoring : {};
    const position = isRecord(visual.position_mm) ? visual.position_mm : {};
    return {
      x: numberValue(position.x) ?? 0,
      y: numberValue(position.y) ?? 0,
      z: numberValue(position.z) ?? 30,
    };
  });
  const maxX = visualPositions.length ? Math.max(...visualPositions.map((position) => position.x)) : 0;
  return { x: maxX + 130, y: visualPositions.length % 2 === 0 ? 60 : -60, z: 36 };
};

export const createPrimitivePart = (
  project: BackendProject,
  assemblyId: string,
  kind: CADPrimitiveShape,
  parentPartId: string | null,
): { project: BackendProject; partId: string } => {
  const next = cloneProject(project);
  const assembly = findAssembly(next, assemblyId) ?? next.assemblies[0];
  if (!assembly) return { project: next, partId: '' };
  const existingIds = new Set([
    ...next.assemblies.map((candidate) => candidate.id),
    ...flattenParts(next).map((part) => part.id),
    ...next.assemblies.flatMap((candidate) => candidate.nodes.map((node) => node.id)),
  ]);
  const baseName = defaultPartName(kind);
  const partId = uniqueId(existingIds, `part-${slug(baseName)}`);
  const position = nextPosition(assembly);
  const colorByKind: Record<CADPrimitiveShape, string> = {
    base_plate: '#64748b',
    beam: '#38bdf8',
    cylinder_joint: '#a78bfa',
    bracket: '#f59e0b',
    motor_block: '#fb7185',
    connector: '#f97316',
    electronics: '#22c55e',
    tool: '#f472b6',
  };
  const part: BackendPart = {
    id: partId,
    name: `${baseName} ${assembly.parts.length + 1}`,
    category: kind.replaceAll('_', ' '),
    purpose: kind === 'motor_block'
      ? 'Visual motor or actuator equipment block placed in the assembly. Torque, heat, fit, and electrical checks are review-required.'
      : kind === 'connector'
        ? 'Visual connector block for harness routing and service-loop layout. Exact pinout and electrical validation remain review-required.'
        : 'Visual CAD primitive authored in the MVP workspace. Real parametric CAD generation is future work.',
    material_id: defaultMaterialId(next, kind),
    dimensions: defaultDimensions(kind),
    mass_kg: null,
    manufacturing_options: defaultManufacturingOptions(kind),
    related_fasteners: [],
    wiring_route_ids: [],
    source_file: null,
    metadata: {
      preferred_manufacturing_process: defaultManufacturingOptions(kind)[0]?.process,
      created_by_visual_authoring: true,
      visual_authoring: {
        authored: true,
        primitive: kind,
        position_mm: position,
        rotation_deg: { x: 0, y: 0, z: 0 },
        color: colorByKind[kind],
        parent_part_id: parentPartId,
        joint_type: kind === 'cylinder_joint' || kind === 'motor_block' ? 'revolute' : parentPartId ? 'fixed' : 'unassigned',
        assigned_to_part_id: kind === 'motor_block' ? parentPartId : null,
        connector_id: null,
      },
      demo_design_criteria: {
        load_capacity_lb: null,
        load_capacity_status: 'review-required',
        load_capacity_note: 'Visual authoring primitive. Strength and payload are review-required until real CAD and FEA workers validate it.',
      },
    },
  };
  assembly.parts = [...assembly.parts, part];
  assembly.nodes = [...assembly.nodes, {
    id: uniqueId(existingIds, `node-${slug(baseName)}`),
    name: `${part.name} node`,
    assembly_id: assembly.id,
    part_id: part.id,
    part_ids: [part.id],
    child_assembly_ids: [],
    exploded_transform: {
      translation_mm: { x: 60, y: 30, z: 20 },
      rotation_deg: { x: 0, y: 0, z: 0 },
    },
  }];
  next.updated_at = new Date().toISOString();
  return { project: next, partId };
};

export const createAssemblyWithBase = (project: BackendProject): { project: BackendProject; assemblyId: string; partId: string } => {
  const next = cloneProject(project);
  const existingIds = new Set([
    ...next.assemblies.map((assembly) => assembly.id),
    ...flattenParts(next).map((part) => part.id),
  ]);
  const assemblyId = uniqueId(existingIds, 'asm-visual-authoring');
  const rootNodeId = `node-${assemblyId}`;
  next.assemblies = [...next.assemblies, {
    id: assemblyId,
    name: `Visual assembly ${next.assemblies.length + 1}`,
    root_node_id: rootNodeId,
    nodes: [{
      id: rootNodeId,
      name: 'Assembly root',
      assembly_id: assemblyId,
      part_ids: [],
      child_assembly_ids: [],
      exploded_transform: { translation_mm: { x: 0, y: 0, z: 0 }, rotation_deg: { x: 0, y: 0, z: 0 } },
    }],
    parts: [],
    wiring_routes: [],
    assembly_structure_confidence: 'estimated_from_heuristic',
  }];
  const created = createPrimitivePart(next, assemblyId, 'base_plate', null);
  return { project: created.project, assemblyId, partId: created.partId };
};

export const duplicatePart = (project: BackendProject, assemblyId: string, partId: string): { project: BackendProject; partId: string } => {
  const next = cloneProject(project);
  const assembly = findAssembly(next, assemblyId);
  const source = assembly?.parts.find((part) => part.id === partId);
  if (!assembly || !source) return { project: next, partId: '' };
  const existingIds = new Set([
    ...next.assemblies.map((candidate) => candidate.id),
    ...flattenParts(next).map((part) => part.id),
    ...next.assemblies.flatMap((candidate) => candidate.nodes.map((node) => node.id)),
  ]);
  const duplicateId = uniqueId(existingIds, `${source.id}-copy`);
  const copy = structuredClone(source);
  copy.id = duplicateId;
  copy.name = `${source.name} copy`;
  copy.source_file = null;
  copy.mass_kg = null;
  copy.wiring_route_ids = [];
  const visual = normalizePartVisualAuthoring(copy);
  visual.authored = true;
  visual.position_mm = {
    ...(isRecord(visual.position_mm) ? visual.position_mm : {}),
    x: (numberValue(isRecord(visual.position_mm) ? visual.position_mm.x : null) ?? 0) + 55,
    y: (numberValue(isRecord(visual.position_mm) ? visual.position_mm.y : null) ?? 0) + 45,
  };
  copy.metadata = { ...copy.metadata, created_by_visual_authoring: true, visual_authoring: visual };
  assembly.parts = [...assembly.parts, copy];
  assembly.nodes = [...assembly.nodes, {
    id: uniqueId(existingIds, `node-${slug(copy.name)}`),
    name: `${copy.name} node`,
    assembly_id: assembly.id,
    part_id: copy.id,
    part_ids: [copy.id],
    child_assembly_ids: [],
    exploded_transform: { translation_mm: { x: 60, y: 30, z: 20 }, rotation_deg: { x: 0, y: 0, z: 0 } },
  }];
  next.updated_at = new Date().toISOString();
  return { project: next, partId: duplicateId };
};

export const deleteVisualPart = (project: BackendProject, assemblyId: string, partId: string): { project: BackendProject; deleted: boolean; nextPartId: string } => {
  const next = cloneProject(project);
  const assembly = findAssembly(next, assemblyId);
  const part = assembly?.parts.find((candidate) => candidate.id === partId);
  if (!assembly || !part) return { project: next, deleted: false, nextPartId: '' };
  const authored = Boolean(part.metadata?.created_by_visual_authoring || (isRecord(part.metadata?.visual_authoring) && part.metadata.visual_authoring.authored));
  const hasWiring = part.wiring_route_ids.length > 0 || assembly.wiring_routes.some((route) => [route.from_connector.part_id, route.to_connector.part_id].includes(part.id));
  const hasElectronics = (next.electronics_components ?? []).some((component) => component.mounted_part_id === part.id);
  if (!authored || hasWiring || hasElectronics || assembly.parts.length <= 1) {
    return { project: next, deleted: false, nextPartId: partId };
  }
  for (const candidateAssembly of next.assemblies) {
    for (const candidate of candidateAssembly.parts) {
      const visual = isRecord(candidate.metadata?.visual_authoring) ? candidate.metadata.visual_authoring : null;
      if (visual?.parent_part_id !== partId) continue;
      const normalized = normalizePartVisualAuthoring(candidate);
      normalized.parent_part_id = null;
      normalized.joint_type = 'unassigned';
    }
  }
  assembly.parts = assembly.parts.filter((candidate) => candidate.id !== partId);
  assembly.nodes = assembly.nodes.filter((node) => node.part_id !== partId && !node.part_ids.includes(partId));
  next.updated_at = new Date().toISOString();
  return { project: next, deleted: true, nextPartId: assembly.parts[0]?.id ?? '' };
};

export const connectPartToParent = (
  project: BackendProject,
  partId: string,
  parentPartId: string | null,
  jointType: CADJointType,
): BackendProject => {
  const next = cloneProject(project);
  const part = findPart(next, partId);
  const parent = parentPartId ? findPart(next, parentPartId) : null;
  if (!part || (parentPartId && !parent)) return next;
  const visited = new Set<string>();
  let current = parent;
  while (current) {
    if (current.id === partId || visited.has(current.id)) return next;
    visited.add(current.id);
    const visual = isRecord(current.metadata?.visual_authoring) ? current.metadata.visual_authoring : null;
    const ancestorId = typeof visual?.parent_part_id === 'string' ? visual.parent_part_id : null;
    current = ancestorId ? findPart(next, ancestorId) : null;
  }
  return setPartInProject(next, partId, (part) => {
    const visual = normalizePartVisualAuthoring(part);
    visual.parent_part_id = parentPartId;
    visual.joint_type = jointType;
    return { ...part, metadata: { ...part.metadata, visual_authoring: visual } };
  });
};

const ensureWiringRule = (project: BackendProject): string => {
  const existing = project.wiring_rules?.[0]?.id;
  if (existing) return existing;
  const rule: BackendWiringRuleSet = {
    id: 'rule-visual-authoring-harness',
    name: 'Visual authoring harness heuristic',
    required_clearance_min_mm: 2,
    required_bend_radius_min_mm: 15,
    bend_radius_multiplier: null,
    required_service_loop_min_mm: 25,
    evidence_basis: 'heuristic',
    notes: ['MVP visual wiring screen only. Exact electrical validation and CAD clearance remain review-required.'],
  };
  project.wiring_rules = [rule];
  return rule.id;
};

const ensureMountedComponent = (project: BackendProject, part: BackendPart, routeSlug: string): { component: BackendElectronicsComponent; connectorId: string } => {
  const components = project.electronics_components ?? [];
  let component = components.find((candidate) => candidate.mounted_part_id === part.id);
  if (!component) {
    component = {
      id: uniqueId(new Set(components.map((candidate) => candidate.id)), `ec-${slug(part.name)}`),
      name: `${part.name} connector node`,
      component_type: part.category.toLowerCase().includes('motor') ? 'actuator' : 'connector',
      mounted_part_id: part.id,
      connector_ids: [],
      bom_item_ids: [],
      datasheet_url: null,
      notes: ['Created by visual wiring authoring. Pinout, current, and environmental rating are review-required.'],
      confidence: 'estimated_from_heuristic',
    };
    project.electronics_components = [...components, component];
  }
  const connectorId = uniqueId(new Set([
    ...project.assemblies.flatMap((assembly) => assembly.wiring_routes.flatMap((route) => [route.from_connector.id, route.to_connector.id])),
    ...component.connector_ids,
  ]), `conn-${routeSlug}-${slug(part.name)}`);
  component.connector_ids = [...component.connector_ids, connectorId];
  return { component, connectorId };
};

const partPosition = (part: BackendPart): BackendVector3 => {
  const visual = isRecord(part.metadata?.visual_authoring) ? part.metadata.visual_authoring : {};
  const position = isRecord(visual.position_mm) ? visual.position_mm : {};
  return {
    x: numberValue(position.x) ?? 0,
    y: numberValue(position.y) ?? 0,
    z: numberValue(position.z) ?? 20,
  };
};

const pathLength = (points: BackendVector3[]): number => points.slice(1).reduce((sum, point, index) => {
  const start = points[index]!;
  const dx = point.x - start.x;
  const dy = point.y - start.y;
  const dz = point.z - start.z;
  return sum + Math.sqrt(dx * dx + dy * dy + dz * dz);
}, 0);

export const createWireRoute = (
  project: BackendProject,
  assemblyId: string,
  fromPartId: string,
  toPartId: string,
): { project: BackendProject; routeId: string } => {
  const next = cloneProject(project);
  if (fromPartId === toPartId) return { project: next, routeId: '' };
  const assembly = findAssembly(next, assemblyId);
  const fromPart = findPart(next, fromPartId);
  const toPart = findPart(next, toPartId);
  if (!assembly || !fromPart || !toPart) return { project: next, routeId: '' };
  const existingRouteIds = new Set(next.assemblies.flatMap((candidate) => candidate.wiring_routes.map((route) => route.id)));
  const routeSlug = `${slug(fromPart.name)}-${slug(toPart.name)}`;
  const routeId = uniqueId(existingRouteIds, `route-${routeSlug}`);
  const fromComponent = ensureMountedComponent(next, fromPart, routeSlug);
  const toComponent = ensureMountedComponent(next, toPart, routeSlug);
  const fromEndpoint: BackendRouteEndpoint = { connector_id: fromComponent.connectorId, part_id: fromPart.id, pin_label: null, role: 'source', notes: [] };
  const toEndpoint: BackendRouteEndpoint = { connector_id: toComponent.connectorId, part_id: toPart.id, pin_label: null, role: 'sink', notes: [] };
  const wireId = uniqueId(new Set(next.wire_segments.map((segment) => segment.id)), `wire-${routeSlug}`);
  const wireBomId = `bom-${wireId}`;
  const start = partPosition(fromPart);
  const end = partPosition(toPart);
  const lift = Math.max(45, Math.abs(end.x - start.x) * 0.08 + Math.abs(end.y - start.y) * 0.04);
  const pathPoints = [
    { x: start.x, y: start.y, z: start.z + 35 },
    { x: start.x + (end.x - start.x) * 0.4, y: start.y + 35, z: start.z + lift },
    { x: start.x + (end.x - start.x) * 0.72, y: end.y + 20, z: end.z + lift * 0.9 },
    { x: end.x, y: end.y, z: end.z + 35 },
  ];
  const segment: BackendWireSegment = {
    id: wireId,
    name: `${fromPart.name} to ${toPart.name} harness segment`,
    conductor_count: 4,
    wire_gauge_awg: 24,
    length_mm: Number(pathLength(pathPoints).toFixed(1)),
    signal_or_power: 'visual authoring low-voltage IO or motor lead, review required',
    color: 'cyan',
    from_endpoint: fromEndpoint,
    to_endpoint: toEndpoint,
    bom_item_id: wireBomId,
    notes: ['Length is estimated from visual polyline points. This is not autorouted CAD or exact electrical validation.'],
    confidence: 'estimated_from_heuristic',
  };
  next.wire_segments = [...(next.wire_segments ?? []), segment];
  const route: BackendWiringRoute = {
    id: routeId,
    name: `${fromPart.name} to ${toPart.name} wire route`,
    from_connector: {
      id: fromComponent.connectorId,
      name: `${fromPart.name} route connector`,
      pin_count: 4,
      part_id: fromPart.id,
      component_id: fromComponent.component.id,
      kind: 'connector',
      gender: 'inline',
      pin_labels: ['24V', 'GND', 'A', 'B'],
      voltage_rating_v: 24,
      current_rating_a: 2,
      mating_connector_id: null,
      notes: ['Visual connector generated for MVP wire routing.'],
    },
    to_connector: {
      id: toComponent.connectorId,
      name: `${toPart.name} route connector`,
      pin_count: 4,
      part_id: toPart.id,
      component_id: toComponent.component.id,
      kind: 'connector',
      gender: 'inline',
      pin_labels: ['24V', 'GND', 'A', 'B'],
      voltage_rating_v: 24,
      current_rating_a: 2,
      mating_connector_id: null,
      notes: ['Visual connector generated for MVP wire routing.'],
    },
    endpoints: [fromEndpoint, toEndpoint],
    path_points_mm: pathPoints,
    wire_segment_ids: [wireId],
    electronics_component_ids: [fromComponent.component.id, toComponent.component.id],
    bend_radius_min_mm: 20,
    clearance_min_mm: 3,
    service_loop_mm: 45,
    rule_set_id: ensureWiringRule(next),
    harness_bom: [wireBomId],
    diagram_ref: `wireviz://visual-authoring/${routeId}`,
    risk_notes: ['Visual route is an MVP polyline. EMI, voltage drop, flex life, current, and CAD sweep validation remain review-required.'],
    confidence: 'estimated_from_heuristic',
  };
  assembly.wiring_routes = [...assembly.wiring_routes, route];
  assembly.parts = assembly.parts.map((part) => [fromPartId, toPartId].includes(part.id)
    ? { ...part, wiring_route_ids: [...new Set([...part.wiring_route_ids, routeId])] }
    : part);
  next.updated_at = new Date().toISOString();
  return { project: next, routeId };
};

export const applyIntentToProjectGeometry = (
  project: BackendProject,
  intentText: string,
  reachMeters: number | null,
  units: AuthoringUnit,
): BackendProject => {
  let next = updateProjectUnits(project, units);
  const visual = visualMetadata(next);
  if (reachMeters != null && Number.isFinite(reachMeters) && reachMeters > 0) {
    const reachMm = reachMeters * 1000;
    visual.reach_mm = reachMm;
    const upperLength = Math.max(120, Math.round(reachMm * 0.44));
    const forearmLength = Math.max(100, Math.round(reachMm * 0.36));
    next = updatePartGeometry(next, 'part-upper-arm-link', {
      dimensions: { lengthMm: upperLength },
      position: { x: 150 + upperLength / 2, y: 0, z: 118 },
    });
    next = updatePartGeometry(next, 'part-forearm-link', {
      dimensions: { lengthMm: forearmLength },
      position: { x: 300 + upperLength + forearmLength / 2, y: 0, z: 122 },
    });
  }
  const lowerIntent = intentText.toLowerCase();
  if (lowerIntent.includes('motor') || lowerIntent.includes('actuator')) {
    const activeAssembly = next.assemblies[0];
    const parent = findPart(next, 'part-shoulder-yoke')?.id ?? activeAssembly?.parts[0]?.id ?? null;
    if (activeAssembly && !flattenParts(next).some((part) => part.name === 'Intent motor block')) {
      const created = createPrimitivePart(next, activeAssembly.id, 'motor_block', parent);
      next = setPartInProject(created.project, created.partId, (part) => ({ ...part, name: 'Intent motor block' }));
    }
  }
  next.metadata = {
    ...(next.metadata ?? {}),
    visual_authoring: {
      ...(isRecord(next.metadata?.visual_authoring) ? next.metadata.visual_authoring : {}),
      last_design_intent: intentText,
      units,
    },
  };
  next.updated_at = new Date().toISOString();
  return next;
};
