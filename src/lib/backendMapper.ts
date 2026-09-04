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
  JobStatus,
  ManufacturingOption,
  MaterialOption,
  Part,
  PartVisual,
  RatingStatus,
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

const estimatePayload = (
  part: BackendPart,
  material: BackendMaterial | undefined,
  taskPayload: number | null,
): number | null => {
  const thickness = part.dimensions.thickness_mm ?? part.dimensions.height_mm;
  if (taskPayload == null || thickness == null || !material) return null;
  const base = taskPayload + thickness * 3;
  if (material.family.includes('polymer')) return base * 0.55;
  if (material.family.includes('steel')) return base * 1.85;
  if (material.family.includes('aluminum')) return base * 1.25;
  return base;
};

const ratingStatus = (
  payloadLb: number | null,
  taskPayload: number | null,
  safetyFactor: number | null,
  taskSafetyFactorMin: number | null,
): RatingStatus => {
  if (payloadLb == null || taskPayload == null || safetyFactor == null) return 'watch';
  if (payloadLb < taskPayload) return 'fails';
  if (taskSafetyFactorMin == null || safetyFactor < taskSafetyFactorMin) return 'watch';
  return 'passes';
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

const visualFor = (part: BackendPart, index: number, nodeExplode?: { x: number; y: number }): PartVisual => {
  const presets: Array<Omit<PartVisual, 'color'>> = [
    { x: 16, y: 34, width: 20, height: 34, explodeX: -18, explodeY: -12 },
    { x: 42, y: 62, width: 34, height: 14, explodeX: 0, explodeY: 18 },
    { x: 42, y: 38, width: 22, height: 22, explodeX: 8, explodeY: 8 },
    { x: 64, y: 32, width: 18, height: 38, explodeX: 18, explodeY: -10 },
    { x: 26, y: 22, width: 14, height: 44, explodeX: -26, explodeY: -2 },
  ];
  const preset = presets[index % presets.length];
  return {
    ...preset,
    explodeX: nodeExplode ? Math.sign(nodeExplode.x || preset.explodeX) * Math.max(10, Math.abs(nodeExplode.x) / 4) : preset.explodeX,
    explodeY: nodeExplode ? Math.sign(nodeExplode.y || preset.explodeY) * Math.max(4, Math.abs(nodeExplode.y) / 4) : preset.explodeY,
    color: colors[index % colors.length],
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

const mapPart = (
  part: BackendPart,
  index: number,
  assembly: BackendAssembly,
  materialsById: Map<string, BackendMaterial>,
  taskPayload: number | null,
  taskSafetyFactorMin: number | null,
): Part => {
  const material = part.material_id ? materialsById.get(part.material_id) : undefined;
  const rawPayloadLb = estimatePayload(part, material, taskPayload);
  const rawSafetyFactor = rawPayloadLb != null && taskPayload != null && taskPayload > 0
    ? rawPayloadLb / taskPayload
    : null;
  const node = assembly.nodes.find((candidate) => candidate.part_ids.includes(part.id));
  const manufacturingOption = activeManufacturingOption(part);
  const status = ratingStatus(rawPayloadLb, taskPayload, rawSafetyFactor, taskSafetyFactorMin);
  const ratingSummary = taskPayload == null
    ? `${part.name} has no payload rating because the active task does not provide a pound target; review is required.`
    : rawPayloadLb == null || rawSafetyFactor == null
      ? `${part.name} has incomplete payload evidence; engineering review is required.`
      : rawPayloadLb != null && rawPayloadLb < taskPayload
        ? `${part.name} falls below the preserved ${taskPayload} lb payload target.`
        : taskSafetyFactorMin == null
          ? `${part.name} has no active safety-factor minimum; engineering review is required.`
          : rawSafetyFactor != null && rawSafetyFactor < taskSafetyFactorMin
            ? `${part.name}'s estimated safety factor is below the preserved ${taskSafetyFactorMin.toFixed(1)} minimum; engineering review is required.`
            : `${part.name} is heuristically rated against the preserved ${taskPayload} lb task and ${taskSafetyFactorMin.toFixed(1)} safety-factor minimum until real workers run.`;
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
      status,
      payloadLb: rawPayloadLb,
      safetyFactor: rawSafetyFactor,
      summary: ratingSummary,
      warning: part.wiring_route_ids.length > 0 ? 'Linked wiring routes require clearance checks after geometry edits.' : undefined,
    },
    visual: visualFor(part, index, node?.exploded_transform.translation_mm),
  };
};

const mapMaterialOptions = (
  parts: BackendPart[],
  materials: BackendMaterial[],
  taskPayload: number | null,
  taskSafetyFactorMin: number | null,
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
      const materialOnlyPayloadLb = estimatePayload(part, material, taskPayload);
      const materialOnlySafetyFactor = materialOnlyPayloadLb != null && taskPayload != null && taskPayload > 0
        ? materialOnlyPayloadLb / taskPayload
        : null;
      const materialOnlyStatus = ratingStatus(
        materialOnlyPayloadLb,
        taskPayload,
        materialOnlySafetyFactor,
        taskSafetyFactorMin,
      );
      const currentThicknessMm = part.dimensions.thickness_mm;
      const nextThicknessMm = materialOnlyStatus === 'fails' && currentThicknessMm != null
        ? currentThicknessMm + 2
        : null;
      const dimensionChanges: Record<string, number> = nextThicknessMm == null
        ? {}
        : { thickness_mm: nextThicknessMm };
      const previewPart = nextThicknessMm == null
        ? part
        : { ...part, dimensions: { ...part.dimensions, ...dimensionChanges } };
      const rawPayloadLb = estimatePayload(previewPart, material, taskPayload);
      const rawSafetyFactor = rawPayloadLb != null && taskPayload != null && taskPayload > 0
        ? rawPayloadLb / taskPayload
        : null;
      const status = ratingStatus(rawPayloadLb, taskPayload, rawSafetyFactor, taskSafetyFactorMin);
      const manufacturingProcess = compatibleProcesses[0];
      const currentDensity = currentMaterial?.properties.density_kg_m3;
      const nextDensity = material.properties.density_kg_m3;
      const thicknessRatio = nextThicknessMm != null && currentThicknessMm != null
        ? nextThicknessMm / currentThicknessMm
        : 1;
      const weightDeltaLb = part.mass_kg != null && currentDensity != null && currentDensity > 0 && nextDensity != null
        ? round(part.mass_kg * (nextDensity / currentDensity * thicknessRatio - 1) * 2.20462, 2)
        : null;
      const manufacturingOption = part.manufacturing_options.find(
        (option) => option.process === manufacturingProcess,
      );
      const previewScope = nextThicknessMm == null
        ? 'Material-only preview'
        : `Combined material-and-geometry preview at ${nextThicknessMm} mm thickness`;
      return {
        id: `${part.id}-${material.id}`,
        partId: part.id,
        material: material.name,
        process: toTitle(manufacturingProcess),
        payloadLb: rawPayloadLb,
        safetyFactor: rawSafetyFactor,
        weightDeltaLb,
        costRangeUsd: usdCostRange(manufacturingOption?.cost),
        taskImpact: taskPayload == null || rawPayloadLb == null || rawSafetyFactor == null
          ? 'Payload target or rating is unknown; engineering review is required.'
          : status === 'fails'
            ? `${previewScope} is rated at ${round(rawPayloadLb, 2)} lb and remains below the preserved ${taskPayload} lb task.`
            : taskSafetyFactorMin == null
              ? `${previewScope}: the active safety-factor minimum is unknown; engineering review is required.`
              : status === 'watch'
                ? `${previewScope} has an estimated safety factor below the preserved ${taskSafetyFactorMin.toFixed(1)} minimum; engineering review is required.`
                : `${previewScope} keeps the preserved ${taskPayload} lb task active with a ${rawSafetyFactor.toFixed(1)} safety factor estimate.`,
        wiringImpact: part.wiring_route_ids.length > 0
          ? 'Backend modification report would require a wiring clearance and bend-radius worker check.'
          : 'No linked wiring route is known for this part in the sample project.',
        manufacturingImpact: `${previewScope} uses ${toTitle(manufacturingProcess)} and remains advisory until supplier and manufacturing workers run.`,
        status,
        backendModification: {
          endpoint: `/api/projects/${projectId}/modifications`,
          method: 'POST',
          payload: {
            id: `mod-${part.id}-${material.id}`,
            target_part_id: part.id,
            description: `${previewScope} for ${part.name} using ${material.name} while preserving the active task.`,
            material_id: material.id,
            dimension_changes: dimensionChanges,
            manufacturing_process: manufacturingProcess,
          },
          reportTitle: `Advisory edit report for ${part.name}`,
          reportSummary: nextThicknessMm != null
            ? 'Local preview would return requires_review because payload, fatigue, wiring, and manufacturability need real workers.'
            : 'Local preview would update project metadata and attach an advisory report before real CAD geometry changes exist.',
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
  const taskSafetyFactorMin = typeof task.safety_factor_min === 'number' ? task.safety_factor_min : null;
  const materialsById = new Map(project.materials.map((material) => [material.id, material]));
  const assemblies = backendAssemblies.map((assembly) => ({
    id: assembly.id,
    name: assembly.name,
    explodedProgress: explodedViewProgress(project.analysis_jobs, assembly.id),
    parts: assembly.parts.map((part, index) =>
      mapPart(part, index, assembly, materialsById, taskPayload, taskSafetyFactorMin)),
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
      taskPayload,
      taskSafetyFactorMin,
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
