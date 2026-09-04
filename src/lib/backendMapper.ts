import type {
  AdvisoryReport,
  AnalysisJob,
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

const leadTime = (option: BackendManufacturingOption): string => {
  if (option.lead_time_days_min == null && option.lead_time_days_max == null) return 'Lead time pending';
  if (option.lead_time_days_min != null && option.lead_time_days_max != null) {
    return `${option.lead_time_days_min}-${option.lead_time_days_max} days`;
  }
  if (option.lead_time_days_min != null) return `From ${option.lead_time_days_min} days`;
  return `Up to ${option.lead_time_days_max} days`;
};

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
    return part.manufacturing_options.find((option) => option.process === preferredProcess);
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

const buildDesignCriteria = (
  part: BackendPart,
  material: BackendMaterial | undefined,
  manufacturingOption: BackendManufacturingOption | undefined,
): DesignCriterion[] => {
  const demoCriteria = metadataRecord(part.metadata.demo_design_criteria);
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

const mapPart = (
  part: BackendPart,
  index: number,
  assembly: BackendAssembly,
  materialsById: Map<string, BackendMaterial>,
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
    return materials.flatMap((material) => {
      const compatibleProcesses = material.compatible_processes.filter(
        (process) => process !== 'unknown' && partProcesses.has(process),
      );
      if (material.id === currentMaterialId || compatibleProcesses.length === 0) return [];
      const manufacturingProcess = compatibleProcesses[0];
      const currentDensity = currentMaterial?.properties.density_kg_m3;
      const nextDensity = material.properties.density_kg_m3;
      const weightDeltaLb = part.mass_kg != null && currentDensity != null && currentDensity > 0 && nextDensity != null
        ? round(part.mass_kg * (nextDensity / currentDensity - 1) * 2.20462, 2)
        : null;
      const manufacturingOption = part.manufacturing_options.find(
        (option) => option.process === manufacturingProcess,
      );
      const previewScope = 'Material-only preview';
      return {
        id: `${part.id}-${material.id}`,
        partId: part.id,
        material: material.name,
        process: toTitle(manufacturingProcess),
        payloadLb: null,
        safetyFactor: null,
        weightDeltaLb,
        costRangeUsd: usdCostRange(manufacturingOption?.cost),
        taskImpact: `${previewScope} has no worker-supplied payload rating; engineering review is required.`,
        wiringImpact: part.wiring_route_ids.length > 0
          ? 'Backend modification report would require a wiring clearance and bend-radius worker check.'
          : 'No linked wiring route is known for this part in the sample project.',
        manufacturingImpact: `${previewScope} uses ${toTitle(manufacturingProcess)} and remains advisory until supplier and manufacturing workers run.`,
        status: 'watch',
        backendModification: {
          endpoint: `/api/projects/${projectId}/modifications`,
          method: 'POST',
          payload: {
            id: `mod-${part.id}-${material.id}`,
            target_part_id: part.id,
            description: `${previewScope} for ${part.name} using ${material.name} while preserving the active task.`,
            material_id: material.id,
            dimension_changes: {},
            manufacturing_process: manufacturingProcess,
          },
          reportTitle: `Advisory edit report for ${part.name}`,
          reportSummary: 'Local preview would update project metadata and attach an advisory report before real CAD geometry changes exist.',
          reportStatus: 'requires_review',
        },
      };
    });
  });

const mapJob = (job: BackendAnalysisJob): AnalysisJob => {
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
    expectedArtifact: job.artifacts[0]?.kind ?? undefined,
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
      leadTimeDays: null,
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
  const assemblies = backendAssemblies.map((assembly) => ({
    id: assembly.id,
    name: assembly.name,
    explodedProgress: explodedViewProgress(project.analysis_jobs, assembly.id),
    parts: assembly.parts.map((part, index) =>
      mapPart(part, index, assembly, materialsById)),
  }));
  const defaultAssemblyIndex = Math.max(0, backendAssemblies.findIndex((assembly) => assembly.parts.length > 0));
  const assembly = assemblies[defaultAssemblyIndex]!;
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
    analysisJobs: project.analysis_jobs.map(mapJob),
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
      concepts: metadata?.concepts ?? ['projects', 'task_requirements', 'bom_items', 'manufacturing_options', 'wiring_routes', 'reports'],
      advisoryNotice:
        metadata?.advisory_notice ??
        'Engineering checks are local advisory mock data until FreeCAD, FEA, wiring, and supplier workers validate them.',
      integrationStubs: metadata?.integration_stubs.map((stub) => stub.name ?? stub.capability ?? 'unknown-worker') ?? [
        'freecad-worker',
        'calculix-fea-worker',
        'kicad-electronics-worker',
        'wireviz-harness-worker',
        'supplier-options-worker',
      ],
    },
  };
}
