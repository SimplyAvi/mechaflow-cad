import type {
  AdvisoryReport,
  AnalysisJob,
  AnalysisReadinessPreview,
  BackendApiMetadata,
  BackendAnalysisJob,
  BackendAnalysisReport,
  BackendAssembly,
  BackendBOMItem,
  BackendManufacturingOption,
  BackendMaterial,
  BackendMoneyRange,
  BackendPart,
  BackendPartManufacturingOptions,
  BackendProjectPanelData,
  BackendTaskRequirement,
  BackendWiringRoute,
  BOMItem,
  DesignCriterion,
  JobStatus,
  ManufacturingOption,
  MaterialOption,
  Part,
  PartVisual,
  ReferenceDesign,
  RiskLevel,
  UsdRange,
  WiringRoute,
} from '../types';

const colors = ['#38bdf8', '#60a5fa', '#a78bfa', '#f97316', '#34d399', '#f472b6'];

const toTitle = (value: string): string =>
  value
    .split(/[_-]/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

const round = (value: number, decimals = 1): number => Number(value.toFixed(decimals));

const formatMeasurement = (value: number, maximumFractionDigits = 2): string => new Intl.NumberFormat('en-US', {
  maximumFractionDigits,
}).format(value);

const formatUsd = (value: number): string => {
  const fractionDigits = Number.isInteger(value) ? 0 : 2;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
};

const usdCostRange = (cost?: BackendMoneyRange | null): UsdRange | null => {
  if (!cost || typeof cost.currency !== 'string') return null;
  if (cost.currency.trim().toUpperCase() !== 'USD') return null;
  const min = cost.min ?? null;
  const max = cost.max ?? null;
  if (
    (min != null && (!Number.isFinite(min) || min < 0))
    || (max != null && (!Number.isFinite(max) || max < 0))
    || (min != null && max != null && min > max)
  ) return null;
  return min == null && max == null ? null : { min, max };
};

const formatUsdRange = (cost: UsdRange): string => {
  if (cost.min != null && cost.max != null) {
    if (cost.min === cost.max) return formatUsd(cost.min);
    return `${formatUsd(cost.min)}-${formatUsd(cost.max)}`;
  }
  if (cost.min != null) return `From ${formatUsd(cost.min)}`;
  return `Up to ${formatUsd(cost.max ?? 0)}`;
};

const moneyRange = (cost?: BackendMoneyRange | null): string => {
  const usdCost = usdCostRange(cost);
  if (!usdCost) return 'Cost review required';
  return formatUsdRange(usdCost);
};

const formatLeadTimeRange = (min?: number | null, max?: number | null): string => {
  if (min == null && max == null) return 'Lead time review required';
  if (min != null && max != null) {
    if (min === max) return `${min} day${min === 1 ? '' : 's'}`;
    return `${min}-${max} days`;
  }
  if (min != null) return `From ${min} days`;
  return `Up to ${max} days`;
};

const leadTime = (option: BackendManufacturingOption): string => formatLeadTimeRange(
  option.lead_time_days_min,
  option.lead_time_days_max,
);

const jobStatus = (status: string): JobStatus => {
  if (status === 'completed' || status === 'complete') return 'complete';
  if (status === 'failed') return 'failed';
  if (status === 'blocked_missing_adapter' || status === 'blocked') return 'blocked';
  if (status === 'running') return 'running';
  return 'queued';
};

const riskFromPart = (part: BackendPart): RiskLevel => {
  if (part.mass_kg == null) return 'unknown';
  if (part.mass_kg > 0.2) return 'high';
  if (part.wiring_route_ids.length > 0) return 'medium';
  return 'low';
};

const replacementRisk = (part: BackendPart): RiskLevel => {
  if (part.wiring_route_ids.length > 0) return 'medium';
  if (part.related_fasteners.length > 3) return 'medium';
  return 'low';
};

const visualShape = (value: unknown): PartVisual['shape'] | undefined => {
  if (value === 'base' || value === 'joint' || value === 'link' || value === 'plate' || value === 'tool' || value === 'pcb') {
    return value;
  }
  return undefined;
};

const visualFor = (part: BackendPart, index: number, nodeExplode?: { x: number; y: number }): PartVisual => {
  const presets: Array<Omit<PartVisual, 'color'>> = [
    { x: 14, y: 68, width: 24, height: 16, explodeX: -18, explodeY: 18, shape: 'base', zIndex: 2 },
    { x: 25, y: 54, width: 16, height: 16, explodeX: -14, explodeY: 10, shape: 'joint', zIndex: 5 },
    { x: 35, y: 43, width: 28, height: 12, explodeX: -4, explodeY: -6, shape: 'link', rotationDeg: -18, zIndex: 4 },
    { x: 58, y: 34, width: 14, height: 14, explodeX: 10, explodeY: -10, shape: 'joint', zIndex: 6 },
    { x: 67, y: 29, width: 22, height: 10, explodeX: 20, explodeY: -16, shape: 'link', rotationDeg: -9, zIndex: 4 },
    { x: 83, y: 24, width: 11, height: 13, explodeX: 28, explodeY: -18, shape: 'plate', zIndex: 7 },
    { x: 90, y: 20, width: 10, height: 22, explodeX: 34, explodeY: -20, shape: 'tool', zIndex: 8 },
    { x: 18, y: 82, width: 20, height: 10, explodeX: -24, explodeY: 24, shape: 'pcb', zIndex: 3 },
  ];
  const preset = presets[index % presets.length];
  const metadataVisual = metadataRecord(part.metadata.mvp_visual);
  const numberOr = (value: unknown, fallback: number): number => numberMetadata(value) ?? fallback;
  return {
    ...preset,
    x: numberOr(metadataVisual.x, preset.x),
    y: numberOr(metadataVisual.y, preset.y),
    width: numberOr(metadataVisual.width, preset.width),
    height: numberOr(metadataVisual.height, preset.height),
    explodeX: numberOr(
      metadataVisual.explodeX,
      nodeExplode ? Math.sign(nodeExplode.x || preset.explodeX) * Math.max(10, Math.abs(nodeExplode.x) / 4) : preset.explodeX,
    ),
    explodeY: numberOr(
      metadataVisual.explodeY,
      nodeExplode ? Math.sign(nodeExplode.y || preset.explodeY) * Math.max(4, Math.abs(nodeExplode.y) / 4) : preset.explodeY,
    ),
    color: stringMetadata(metadataVisual.color) ?? colors[index % colors.length],
    shape: visualShape(metadataVisual.shape) ?? preset.shape,
    rotationDeg: numberOr(metadataVisual.rotationDeg, preset.rotationDeg ?? 0),
    zIndex: numberOr(metadataVisual.zIndex, preset.zIndex ?? 2),
  };
};

const activeTaskFrom = (tasks: BackendTaskRequirement[], projectTask?: BackendTaskRequirement | null): BackendTaskRequirement =>
  projectTask ?? tasks[0] ?? {
    id: 'task-unspecified',
    kind: 'custom',
    description: 'No active task supplied by the backend yet.',
    target_value: null,
    unit: null,
    safety_factor_min: null,
    validation_method: 'unknown',
    assumptions: [],
  };

const taskValue = (tasks: BackendTaskRequirement[], kind: string, unit: string): number | null => {
  const task = tasks.find((candidate) => candidate.kind === kind && candidate.unit === unit);
  return typeof task?.target_value === 'number' ? task.target_value : null;
};

const explodedViewProgress = (jobs: BackendAnalysisJob[], assemblyId: string): number | null => {
  const job = jobs.find(
    (candidate) => candidate.job_type === 'generate_exploded_view' && candidate.target_id === assemblyId,
  );
  const progress = job?.result_summary.progress;
  if (typeof progress === 'number') return Math.max(0, Math.min(100, progress));
  return job?.status === 'completed' ? 100 : null;
};

const projectAssemblies = (panelData: BackendProjectPanelData): BackendAssembly[] =>
  panelData.project.assemblies.length > 0 ? panelData.project.assemblies : [{
    id: 'empty-assembly',
    name: 'Empty assembly',
    root_node_id: 'root',
    nodes: [],
    parts: [],
    wiring_routes: [],
  }];

const activeManufacturingOption = (part: BackendPart): BackendManufacturingOption | undefined => {
  const preferredProcess = part.metadata.preferred_manufacturing_process;
  if (typeof preferredProcess === 'string') {
    return part.manufacturing_options.find((option) => option.process === preferredProcess)
      ?? part.manufacturing_options[0];
  }
  return part.manufacturing_options[0];
};

const criterionStatus = (confidence?: unknown): DesignCriterion['status'] => {
  if (confidence === 'measured') return 'measured';
  if (confidence === 'unknown_or_needs_review' || confidence === 'review' || confidence === 'review-required') {
    return 'review-required';
  }
  if (typeof confidence === 'string' && confidence.trim() !== '') return 'estimated';
  return 'review-required';
};

const metadataRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

const numberMetadata = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const stringMetadata = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value : undefined;

const materialValue = (
  value: number | null | undefined,
  unit: string,
  decimals = 1,
): string => (value == null ? 'Review required' : `${formatMeasurement(value, decimals)} ${unit}`);

const confidenceLabel = (value?: unknown): string => {
  if (value === 'measured') return 'measured source';
  if (typeof value === 'string' && value.trim() !== '') return toTitle(value);
  return 'review-required source';
};

const criterionSource = (source: string, confidence?: unknown): string => `${source} - ${confidenceLabel(confidence)}`;

const demoDesignCriteria = (part: BackendPart): Record<string, unknown> => metadataRecord(part.metadata.demo_design_criteria);

const buildDesignCriteria = (
  part: BackendPart,
  material: BackendMaterial | undefined,
  manufacturingOption: BackendManufacturingOption | undefined,
): DesignCriterion[] => {
  const demoCriteria = demoDesignCriteria(part);
  const demoLoadCapacityLb = numberMetadata(demoCriteria.load_capacity_lb);
  const loadStatus = criterionStatus(demoCriteria.load_capacity_status);
  const materialStatus = criterionStatus(material?.confidence);
  const processStatus = criterionStatus(manufacturingOption?.confidence);
  const stiffnessGpa = material?.properties.elastic_modulus_gpa ?? null;
  const yieldMpa = material?.properties.yield_strength_mpa ?? null;
  const heatLimitC = material?.properties.heat_deflection_temp_c ?? material?.properties.max_service_temp_c ?? null;
  return [
    {
      id: 'load-capacity',
      label: 'Intended load or lift role',
      value: demoLoadCapacityLb == null ? 'Review required' : `${formatMeasurement(demoLoadCapacityLb)} lb demo limit`,
      status: demoLoadCapacityLb == null ? 'review-required' : loadStatus,
      plainEnglish: stringMetadata(demoCriteria.load_capacity_note)
        ?? 'This is a seed or heuristic capacity for demo triage only. It is not an FEA result.',
      sourceConfidence: criterionSource('Part metadata demo estimate', demoCriteria.load_capacity_status),
    },
    {
      id: 'elasticity-stiffness',
      label: 'Elasticity and stiffness',
      value: materialValue(stiffnessGpa, 'GPa elastic modulus'),
      status: stiffnessGpa == null ? 'review-required' : materialStatus,
      plainEnglish: stiffnessGpa == null
        ? 'No stiffness value is available for this material yet.'
        : 'Higher modulus usually means the part bends less under the same load. This seed is material-level only, not a part deflection calculation.',
      sourceConfidence: criterionSource('Seeded material guidance', material?.confidence),
    },
    {
      id: 'temperature-limit',
      label: 'Heat or temperature limitation',
      value: materialValue(heatLimitC, 'C'),
      status: heatLimitC == null ? 'review-required' : materialStatus,
      plainEnglish: heatLimitC == null
        ? 'Temperature limits are missing and need material datasheet review.'
        : 'Keep the part below this seeded material temperature limit until a sourced datasheet and thermal check confirm it.',
      sourceConfidence: criterionSource('Seeded material guidance', material?.confidence),
    },
    {
      id: 'material-strength',
      label: 'Material strength seed',
      value: materialValue(yieldMpa, 'MPa yield strength'),
      status: yieldMpa == null ? 'review-required' : materialStatus,
      plainEnglish: yieldMpa == null
        ? 'Yield strength is not available for this material seed.'
        : 'Yield strength is a material property. Real part strength still depends on geometry, fasteners, load direction, and validation.',
      sourceConfidence: criterionSource('Seeded material guidance', material?.confidence),
    },
    {
      id: 'manufacturing-process',
      label: 'Manufacturing process',
      value: manufacturingOption == null ? 'Review required' : toTitle(manufacturingOption.process),
      status: manufacturingOption == null ? 'review-required' : processStatus,
      plainEnglish: manufacturingOption?.risk_notes[0]
        ?? manufacturingOption?.description
        ?? 'Process compatibility needs review before release.',
      sourceConfidence: criterionSource('Manufacturing option seed', manufacturingOption?.confidence),
    },
  ];
};

const buildFallbackAnalysisReadiness = (
  part: BackendPart,
  material: BackendMaterial | undefined,
  task: BackendTaskRequirement,
  projectId: string,
): AnalysisReadinessPreview => {
  const demoCriteria = demoDesignCriteria(part);
  const demoLoadCapacityLb = numberMetadata(demoCriteria.load_capacity_lb);
  const hasPayloadTask = task.kind === 'lift_payload' && typeof task.target_value === 'number';
  const hasGeometry = typeof part.source_file === 'string' && part.source_file.trim() !== '';
  const hasMaterial = Boolean(material);
  const dimensionsReady = Object.values(part.dimensions).some((value) => typeof value === 'number' && Number.isFinite(value));
  const blockingReview = [
    ...(!hasGeometry ? ['No source CAD file reference is attached to this part.'] : []),
    ...(!hasMaterial ? ['No material property set is attached to this part.'] : []),
    ...(!hasPayloadTask ? ['No load-bearing task was available for an explicit structural load case.'] : []),
    ...(!dimensionsReady ? ['Geometry dimensions are incomplete for mesh sizing.'] : []),
  ];
  const state = blockingReview.length > 0 ? 'blocked_missing_inputs' : 'pre_solver_ready';
  return {
    project_id: projectId,
    target_id: part.id,
    target_name: part.name,
    target_kind: 'part',
    state,
    trust_label: 'pre_solver_input',
    summary: state === 'pre_solver_ready'
      ? 'Pre-solver ready: explicit loads, constraints, material properties, and expected solver artifacts are recorded. This is not a real FEA result.'
      : 'Review required before meshing or solving: one or more required analysis inputs are missing. No FEA was run.',
    criteria: [
      'Load path: tie the active task load to named CAD faces, fasteners, bearings, or contact pads.',
      'Stiffness: elastic modulus is material input only; real displacement must come from a solver or test.',
      'Thermal: heat-deflection or service temperature is a screening limit, not a thermal result.',
      'Manufacturing: process, grain direction, print orientation, and fastener preload remain review-required.',
    ],
    load_cases: hasPayloadTask ? [{
      id: `load-${part.id}-active-task`,
      name: 'Preserved task static payload screening load',
      description: `Use the active task target of ${task.target_value} ${task.unit ?? ''} as a pre-solver static load. Load direction and contact patch must be reviewed before any real solve.`,
      load_type: 'force',
      target_part_ids: [part.id],
      magnitude: task.target_value,
      unit: task.unit,
      direction: { x: 0, y: 0, z: -1 },
      application_region: 'estimated grip or reaction region from seed metadata',
      confidence: 'estimated_from_heuristic',
      review_required: true,
    }] : [],
    constraints: [{
      id: `constraint-${part.id}-fixtures`,
      name: 'Fixture and fastener support set',
      constraint_type: 'pinned',
      target_part_ids: [part.id],
      region: part.related_fasteners.join(', ') || 'fixture faces need CAD naming',
      degrees_of_freedom: ['translation_x', 'translation_y', 'translation_z'],
      confidence: 'estimated_from_heuristic',
      review_required: true,
    }],
    material_properties: material ? {
      material_id: material.id,
      material_name: material.name,
      properties: material.properties,
      provenance: material.confidence,
      source: material.source,
      review_notes: [...material.notes, 'Replace seed properties with a sourced material record before engineering use.'],
    } : null,
    thermal_guidance: {
      max_service_temp_c: material?.properties.max_service_temp_c ?? null,
      heat_deflection_temp_c: material?.properties.heat_deflection_temp_c ?? null,
      guidance: material == null
        ? 'Material selection is missing, so thermal limits cannot be screened yet.'
        : 'Seed material temperature guidance is present but not a thermal simulation. Use a sourced datasheet and thermal load case before heat-sensitive release decisions.',
      confidence: material?.confidence ?? 'unknown_or_needs_review',
      review_required: true,
    },
    solver_inputs: {
      geometry_source: hasGeometry ? part.source_file!.trim() : null,
      units: 'mm, N, MPa',
      mesh_size_mm: dimensionsReady ? 4 : null,
      freecad_document: 'future FreeCAD document or STEP import path',
      gmsh_model: 'future Gmsh .geo or API-generated mesh model',
      calculix_input_deck: 'future CalculiX .inp deck',
      notes: ['Units and coordinate frames must be normalized by the worker before solve.'],
    },
    expected_result_artifacts: [
      { kind: 'geometry_prep', title: 'FreeCAD analysis geometry package', file_format: 'STEP or BREP plus part-map JSON', produced_by: 'freecad-fea-prep-worker', replaces_demo_estimate: true, review_required_before_release: true },
      { kind: 'mesh', title: 'Gmsh finite-element mesh', file_format: '.msh plus mesh-quality JSON', produced_by: 'gmsh-meshing-worker', replaces_demo_estimate: true, review_required_before_release: true },
      { kind: 'solver_deck', title: 'CalculiX static structural input deck', file_format: '.inp', produced_by: 'calculix-fea-worker', replaces_demo_estimate: true, review_required_before_release: true },
      { kind: 'solver_results', title: 'Stress, displacement, and safety-factor result package', file_format: '.frd, .vtk, and advisory JSON report', produced_by: 'calculix-fea-worker', replaces_demo_estimate: true, review_required_before_release: true },
    ],
    solver_pipeline: [
      { order: 1, adapter_name: 'freecad-fea-prep-worker', open_source_tool: 'FreeCAD', action: 'Prepare defeatured analysis geometry, named faces, and units.', consumes: ['source_file', 'assembly nodes', 'part metadata'], produces: ['STEP or BREP analysis solid', 'part-map JSON', 'named-face set'], status: 'ready_for_worker', review_notes: ['Geometry prep is a contract only; the desktop demo does not import FreeCAD yet.'] },
      { order: 2, adapter_name: 'gmsh-meshing-worker', open_source_tool: 'Gmsh', action: 'Generate mesh with quality metrics and element-size provenance.', consumes: ['analysis solid', 'named faces', 'mesh sizing policy'], produces: ['.msh mesh', 'mesh-quality JSON'], status: 'stub_contract', review_notes: ['Mesh convergence and local refinement rules are future work.'] },
      { order: 3, adapter_name: 'calculix-fea-worker', open_source_tool: 'CalculiX', action: 'Run static structural solve from explicit loads, constraints, and material properties.', consumes: ['.msh mesh', 'material property JSON', 'load and constraint JSON'], produces: ['.inp deck', '.frd results', '.dat solver log'], status: 'stub_contract', review_notes: ['No solver is invoked by the readiness preview.'] },
    ],
    demo_estimates: [
      ...(demoLoadCapacityLb == null ? [] : [`Demo estimate only: seeded capacity ${formatMeasurement(demoLoadCapacityLb)} lb. This must be replaced by solver and test evidence.`]),
      ...(stringMetadata(demoCriteria.load_capacity_note) ? [stringMetadata(demoCriteria.load_capacity_note)!] : []),
    ],
    review_required: [
      'Named faces, contact regions, and fixture assumptions must be reviewed in CAD before solving.',
      'A qualified reviewer must approve any factor-of-safety interpretation before release.',
      ...blockingReview,
    ],
    recommended_job_request: {
      job_type: 'run_fea',
      target_id: part.id,
      project_id: projectId,
      local_compute_preferred: true,
      input_summary: { readiness_state: state },
    },
  };
};

const buildFallbackAssemblyReadiness = (
  assembly: BackendAssembly,
  materialsById: Map<string, BackendMaterial>,
  task: BackendTaskRequirement,
  projectId: string,
): AnalysisReadinessPreview => {
  const partIds = assembly.parts.map((part) => part.id);
  const materialIds = new Set(assembly.parts.map((part) => part.material_id));
  const aggregateMaterialId = materialIds.size === 1 ? [...materialIds][0] : undefined;
  const aggregateMaterial = aggregateMaterialId ? materialsById.get(aggregateMaterialId) : undefined;
  const allGeometryReady = assembly.parts.length > 0 && assembly.parts.every(
    (part) => typeof part.source_file === 'string' && part.source_file.trim() !== '',
  );
  const allDimensionsReady = assembly.parts.length > 0 && assembly.parts.every(
    (part) => Object.values(part.dimensions).some((value) => typeof value === 'number' && Number.isFinite(value)),
  );
  const base = buildFallbackAnalysisReadiness(
    assembly.parts[0] ?? {
      id: assembly.id,
      name: assembly.name,
      category: 'assembly',
      dimensions: { metadata: {} },
      manufacturing_options: [],
      related_fasteners: [],
      wiring_route_ids: [],
      metadata: {},
    },
    aggregateMaterial,
    task,
    projectId,
  );
  const loadCases = base.load_cases.map((load) => ({ ...load, id: `load-${assembly.id}-active-task`, target_part_ids: partIds }));
  const constraints = base.constraints.map((constraint) => ({
    ...constraint,
    id: `constraint-${assembly.id}-fixtures`,
    constraint_type: 'review_required',
    target_part_ids: partIds,
    region: 'assembly fixtures and contact sets need CAD naming',
  }));
  const blockingReview = [
    ...(!allGeometryReady ? ['Aggregate assembly geometry source references are incomplete.'] : []),
    ...(!aggregateMaterial ? ['Aggregate assembly material properties are incomplete or mixed.'] : []),
    ...(!allDimensionsReady ? ['Aggregate assembly dimensions are incomplete for mesh sizing.'] : []),
    ...(!base.load_cases.length ? ['No load-bearing task was available for an explicit structural load case.'] : []),
  ];
  const state = blockingReview.length > 0 ? 'blocked_missing_inputs' : 'pre_solver_ready';
  const sourceFile = allGeometryReady ? assembly.parts.map((part) => part.source_file).join(', ') : null;
  return {
    ...base,
    target_id: assembly.id,
    target_name: assembly.name,
    target_kind: 'assembly',
    state,
    summary: state === 'pre_solver_ready'
      ? 'Pre-solver ready: aggregate assembly loads, constraints, material properties, and expected solver artifacts are recorded. This is not a real FEA result.'
      : 'Review required before meshing or solving: aggregate assembly inputs are missing. No FEA was run.',
    criteria: [
      'Assembly load path: review how the active task load transfers across included parts, fixtures, and contacts.',
      'Assembly stiffness: material modulus is input only; real displacement must come from a solver or test.',
      'Assembly thermal limits: review each included material before heat-sensitive release decisions.',
      `Assembly scope: includes ${partIds.length} part${partIds.length === 1 ? '' : 's'} from the selected assembly.`,
    ],
    load_cases: loadCases,
    constraints,
    material_properties: aggregateMaterial ? base.material_properties : null,
    solver_inputs: {
      ...base.solver_inputs,
      geometry_source: sourceFile,
      mesh_size_mm: allDimensionsReady ? 4 : null,
    },
    demo_estimates: [],
    review_required: [
      'Aggregate assembly fixtures, contacts, and material assumptions must be reviewed before solving.',
      'A qualified reviewer must approve any factor-of-safety interpretation before release.',
      ...blockingReview,
    ],
    recommended_job_request: base.recommended_job_request
      ? { ...base.recommended_job_request, target_id: assembly.id, input_summary: { readiness_state: state, target_part_ids: partIds } }
      : null,
  };
};

const mapPart = (
  part: BackendPart,
  index: number,
  assembly: BackendAssembly,
  materialsById: Map<string, BackendMaterial>,
  task: BackendTaskRequirement,
  projectId: string,
  readinessPreview?: AnalysisReadinessPreview,
): Part => {
  const material = part.material_id ? materialsById.get(part.material_id) : undefined;
  const node = assembly.nodes.find((candidate) => candidate.part_ids.includes(part.id));
  const manufacturingOption = activeManufacturingOption(part);
  return {
    id: part.id,
    name: part.name,
    subassembly: node?.name ?? part.category,
    purpose: part.purpose ?? 'Purpose metadata has not been extracted yet.',
    material: material?.name ?? part.material_id ?? 'Unknown material',
    manufacturingProcess: toTitle(manufacturingOption?.process ?? 'unknown'),
    weightLb: part.mass_kg == null ? null : round(part.mass_kg * 2.20462, 2),
    costRangeUsd: usdCostRange(manufacturingOption?.cost),
    stressRisk: riskFromPart(part),
    replacementDifficulty: replacementRisk(part),
    fasteners: part.related_fasteners,
    relatedWires: part.wiring_route_ids,
    rating: {
      status: 'watch',
      payloadLb: null,
      safetyFactor: null,
      summary: `${part.name} has no worker-supplied payload rating; engineering review is required.`,
      warning: part.wiring_route_ids.length > 0 ? 'Linked wiring routes require clearance checks after geometry edits.' : undefined,
    },
    designCriteria: buildDesignCriteria(part, material, manufacturingOption),
    analysisReadiness: readinessPreview ?? buildFallbackAnalysisReadiness(part, material, task, projectId),
    visual: visualFor(part, index, node?.exploded_transform.translation_mm),
  };
};

const mapMaterialOptions = (
  parts: BackendPart[],
  materials: BackendMaterial[],
  projectId: string,
): MaterialOption[] =>
  parts.flatMap((part) => {
    const currentMaterialId = part.material_id;
    const currentMaterial = materials.find((candidate) => candidate.id === currentMaterialId);
    const partProcesses = new Set(
      part.manufacturing_options.map((option) => option.process).filter((process) => process !== 'unknown'),
    );
    const currentProcess = activeManufacturingOption(part)?.process ?? null;
    return materials.flatMap((material) => {
      const compatibleProcesses = material.compatible_processes.filter(
        (process) => process !== 'unknown' && partProcesses.has(process),
      );
      if (material.id === currentMaterialId || compatibleProcesses.length === 0) return [];
      return compatibleProcesses.map((manufacturingProcess) => {
        const currentDensity = currentMaterial?.properties.density_kg_m3;
        const nextDensity = material.properties.density_kg_m3;
        const weightDeltaLb = part.mass_kg != null && currentDensity != null && currentDensity > 0 && nextDensity != null
          ? round(part.mass_kg * (nextDensity / currentDensity - 1) * 2.20462, 2)
          : null;
        const manufacturingOption = part.manufacturing_options.find(
          (option) => option.process === manufacturingProcess,
        );
        const heatLimitC = material.properties.heat_deflection_temp_c ?? material.properties.max_service_temp_c ?? null;
        const previewScope = 'Material and process substitution preview';
        return {
          id: `${part.id}-${material.id}-${manufacturingProcess}`,
          partId: part.id,
          material: material.name,
          materialId: material.id,
          process: toTitle(manufacturingProcess),
          processValue: manufacturingProcess,
          currentMaterial: currentMaterial?.name ?? currentMaterialId ?? null,
          currentProcess: currentProcess == null ? null : toTitle(currentProcess),
          payloadLb: null,
          safetyFactor: null,
          weightDeltaLb,
          costRangeUsd: usdCostRange(manufacturingOption?.cost),
          leadTimeRangeDays: {
            min: manufacturingOption?.lead_time_days_min ?? null,
            max: manufacturingOption?.lead_time_days_max ?? null,
          },
          stiffnessGpa: material.properties.elastic_modulus_gpa ?? null,
          yieldStrengthMpa: material.properties.yield_strength_mpa ?? null,
          heatLimitC,
          materialConfidence: material.confidence,
          manufacturingConfidence: manufacturingOption?.confidence ?? 'unknown_or_needs_review',
          reviewRequired: true,
          blockedReasons: [],
          warnings: [
            'This is a preview only until applied to the backend project.',
            ...material.notes,
            ...(manufacturingOption?.risk_notes ?? []),
          ],
          taskImpact: `${previewScope} has no worker-supplied payload rating; engineering review is required.`,
          wiringImpact: part.wiring_route_ids.length > 0
            ? 'Backend modification report requires a wiring clearance and bend-radius worker check after apply.'
            : 'No linked wiring route is known for this part in the sample project.',
          manufacturingImpact: `${previewScope} uses ${toTitle(manufacturingProcess)}. Cost and lead time are heuristic ranges, not supplier quotes.`,
          status: 'watch',
          backendModification: {
            endpoint: `/api/projects/${projectId}/material-substitutions/preview then /apply`,
            method: 'POST',
            payload: {
              id: `mod-${part.id}-${material.id}-${manufacturingProcess}`,
              target_part_id: part.id,
              description: `${previewScope} for ${part.name} using ${material.name} with ${toTitle(manufacturingProcess)} while preserving the active task.`,
              material_id: material.id,
              dimension_changes: {},
              manufacturing_process: manufacturingProcess,
            },
            reportTitle: `Advisory edit report for ${part.name}`,
            reportSummary: 'Preview returns projected BOM, manufacturing, and analysis-readiness data without persisting. Apply commits the same validated substitution.',
            reportStatus: 'requires_review',
          },
        };
      });
    });
  });

export const mapBackendAnalysisJob = (job: BackendAnalysisJob): AnalysisJob => {
  const status = jobStatus(job.status);
  const progress = job.result_summary.progress;
  return {
    id: job.id,
    name: toTitle(job.job_type),
    worker: job.adapter_name,
    status,
    progress: typeof progress === 'number' ? Math.max(0, Math.min(100, progress)) : null,
    summary:
      typeof job.result_summary.message === 'string'
        ? job.result_summary.message
        : `Adapter ${job.adapter_name} is reserved for ${toTitle(job.job_type)} handoff.`,
    expectedArtifact: job.artifacts.at(-1)?.kind ?? job.artifacts[0]?.kind ?? undefined,
    artifacts: job.artifacts.map((artifact) => ({
      kind: artifact.kind,
      title: artifact.title,
      summary: artifact.summary,
      confidence: artifact.confidence,
      generatedBy: artifact.generated_by,
    })),
    reviewStatus: typeof job.result_summary.review_status === 'string' ? job.result_summary.review_status : undefined,
    trustLabel: typeof job.result_summary.trust_label === 'string' ? job.result_summary.trust_label : undefined,
  };
};

const bomSourceFromPart = (part?: Part): BOMItem['source'] | null => {
  if (!part || part.manufacturingProcess === 'Unknown') return null;
  if (part.manufacturingProcess === 'Off The Shelf') return 'off the shelf';
  if (part.manufacturingProcess === 'Wire Harness') return 'wire harness';
  return 'fabricate';
};

const mapBOM = (items: BackendBOMItem[], parts: Part[]): BOMItem[] => {
  if (items.length === 0) {
    return parts.map((part) => ({
      id: `bom-${part.id}`,
      item: part.name,
      quantity: 1,
      source: bomSourceFromPart(part) ?? 'open design',
      unitCostRangeUsd: null,
      leadTimeDays: null,
      leadTimeRange: null,
    }));
  }

  return items.map((item) => {
    const price = usdCostRange(item.price);
    const part = item.part_id ? parts.find((candidate) => candidate.id === item.part_id) : undefined;
    const source = bomSourceFromPart(part)
      ?? (item.supplier || item.supplier_part_number ? 'off the shelf' : item.part_id ? 'open design' : 'off the shelf');
    return {
      id: item.id,
      item: item.name,
      quantity: item.quantity,
      source,
      unitCostRangeUsd: price,
      leadTimeDays: item.lead_time_days_min ?? item.lead_time_days_max ?? null,
      leadTimeRange: {
        min: item.lead_time_days_min ?? null,
        max: item.lead_time_days_max ?? null,
      },
    };
  });
};

const mapManufacturing = (partOptions: BackendPartManufacturingOptions[]): ManufacturingOption[] =>
  partOptions.flatMap((partOption) =>
    partOption.options.map((option) => ({
      id: `${partOption.part_id}-${option.id}`,
      label: partOption.part_name,
      process: toTitle(option.process),
      costDisplay: moneyRange(option.cost),
      leadTime: leadTime(option),
      riskNote: option.risk_notes[0] ?? `${option.description} Confidence: ${toTitle(option.confidence)}.`,
      partName: partOption.part_name,
    })),
  );

const mapWiring = (routes: BackendWiringRoute[]): WiringRoute[] =>
  routes.map((route) => ({
    id: route.id,
    name: route.name,
    connectedParts: [route.from_connector.part_id, route.to_connector.part_id].filter((value): value is string => Boolean(value)),
    clearanceStatus: 'watch',
    bendRadiusMm: route.bend_radius_min_mm ?? null,
    serviceLoop: null,
    note: route.risk_notes[0] ?? `Connects ${route.from_connector.name} to ${route.to_connector.name}.`,
  }));

const mapReport = (report: BackendAnalysisReport): AdvisoryReport => ({
  id: report.id,
  title: report.title,
  status: report.status,
  summary: report.summary,
  risks: report.risks,
  recommendations: report.recommendations,
  unknowns: report.unknowns,
});

export function mapProjectPanelDataToReferenceDesign(
  panelData: BackendProjectPanelData,
  metadata?: BackendApiMetadata,
  apiBaseUrl?: string,
): ReferenceDesign {
  const project = panelData.project;
  const backendAssemblies = projectAssemblies(panelData);
  const task = activeTaskFrom(panelData.task_requirements, project.active_task);
  const taskPayload = task.unit === 'lb' && typeof task.target_value === 'number' ? task.target_value : null;
  const materialsById = new Map(project.materials.map((material) => [material.id, material]));
  const readinessByTargetId = new Map(
    (panelData.analysis_readiness_previews ?? []).map((preview) => [preview.target_id, preview]),
  );
  const assemblies = backendAssemblies.map((assembly) => ({
    id: assembly.id,
    name: assembly.name,
    explodedProgress: explodedViewProgress(project.analysis_jobs, assembly.id),
    analysisReadiness: readinessByTargetId.get(assembly.id)
      ?? buildFallbackAssemblyReadiness(assembly, materialsById, task, project.id),
    parts: assembly.parts.map((part, index) =>
      mapPart(part, index, assembly, materialsById, task, project.id, readinessByTargetId.get(part.id))),
  }));
  const defaultAssemblyIndex = Math.max(0, backendAssemblies.findIndex((assembly) => assembly.parts.length > 0));
  const assembly = assemblies[defaultAssemblyIndex] ?? {
    id: 'empty-assembly',
    name: 'Empty assembly',
    explodedProgress: null,
    analysisReadiness: buildFallbackAssemblyReadiness({
      id: 'empty-assembly',
      name: 'Empty assembly',
      root_node_id: 'root',
      nodes: [],
      parts: [],
      wiring_routes: [],
    }, materialsById, task, project.id),
    parts: [],
  };
  const allBackendParts = backendAssemblies.flatMap((candidate) => candidate.parts);
  const allParts = assemblies.flatMap((candidate) => candidate.parts);
  const reports = (panelData.reports.length > 0 ? panelData.reports : project.reports).map(mapReport);
  const isDemoReference = project.reference_design_id === 'ref-open-gripper-demo';

  return {
    id: project.reference_design_id ?? project.id,
    name: project.name,
    sourceUrl: isDemoReference ? 'https://github.com/SimplyAvi/mechaflow-cad' : null,
    license: isDemoReference ? 'MIT' : 'Review required',
    formats: isDemoReference ? ['STEP', 'FreeCAD', 'glTF', 'KiCad', 'WireViz'] : [],
    task: {
      label: task.description,
      targetPayloadLb: taskPayload,
      cycleTimeSeconds: taskValue(panelData.task_requirements, 'cycle_time', 's'),
      reachMeters: taskValue(panelData.task_requirements, 'reach', 'm'),
      serviceGoal: 'Preserve serviceability and wiring clearance while editing parts.',
      safetyFactorMin: task.safety_factor_min ?? undefined,
      validationMethod: task.validation_method,
    },
    assembly,
    assemblies,
    materialOptions: mapMaterialOptions(
      allBackendParts,
      project.materials,
      project.id,
    ),
    bom: mapBOM(panelData.bom_items, allParts),
    manufacturingOptions: mapManufacturing(panelData.manufacturing_options),
    analysisJobs: project.analysis_jobs.map(mapBackendAnalysisJob),
    wiringRoutes: mapWiring(
      panelData.wiring_routes.length > 0
        ? panelData.wiring_routes
        : backendAssemblies.flatMap((candidate) => candidate.wiring_routes),
    ),
    reports,
    backend: {
      source: apiBaseUrl ? 'backend-panel-data' : 'bundled-mock',
      apiBaseUrl,
      projectId: project.id,
      endpoint: `/api/projects/${project.id}/panel-data`,
      concepts: metadata?.concepts ?? ['projects', 'task_requirements', 'analysis_readiness', 'bom_items', 'manufacturing_options', 'wiring_routes', 'reports'],
      advisoryNotice:
        metadata?.advisory_notice ??
        'Engineering checks are local advisory mock data until FreeCAD, FEA, wiring, and supplier workers validate them.',
      integrationStubs: metadata?.integration_stubs.map((stub) => stub.name ?? stub.capability ?? 'unknown-worker') ?? [
        'freecad-worker',
        'freecad-fea-prep-worker',
        'gmsh-meshing-worker',
        'calculix-fea-worker',
        'kicad-electronics-worker',
        'wireviz-harness-worker',
        'supplier-options-worker',
      ],
    },
  };
}
