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

const moneyRange = (cost?: { min?: number | null; max?: number | null; currency?: string } | null): string => {
  if (!cost || (cost.min == null && cost.max == null)) return 'Cost pending supplier adapter';
  const currency = cost.currency ?? 'USD';
  const formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 });
  if (cost.min != null && cost.max != null) return `${formatter.format(cost.min)}-${formatter.format(cost.max)}`;
  return formatter.format(cost.min ?? cost.max ?? 0);
};

const leadTime = (option: BackendManufacturingOption): string => {
  if (option.lead_time_days_min == null && option.lead_time_days_max == null) return 'Lead time pending';
  if (option.lead_time_days_min != null && option.lead_time_days_max != null) {
    return `${option.lead_time_days_min}-${option.lead_time_days_max} days`;
  }
  return `${option.lead_time_days_min ?? option.lead_time_days_max} days`;
};

const materialProcess = (material: BackendMaterial, fallback?: string): string =>
  toTitle(material.compatible_processes[0] ?? fallback ?? 'unknown');

const materialCost = (material: BackendMaterial): number => {
  const low = material.cost?.min ?? 2;
  const high = material.cost?.max ?? low;
  return (low + high) / 2;
};

const estimatePayload = (
  part: BackendPart,
  material: BackendMaterial | undefined,
  taskPayload: number | null,
): number | null => {
  if (taskPayload == null) return null;
  const thickness = part.dimensions.thickness_mm ?? part.dimensions.height_mm ?? 5;
  const base = taskPayload + thickness * 3;
  if (!material) return base;
  if (material.family.includes('polymer')) return round(base * 0.55, 0);
  if (material.family.includes('steel')) return round(base * 1.85, 0);
  if (material.family.includes('aluminum')) return round(base * 1.25, 0);
  return round(base, 0);
};

const ratingStatus = (
  payloadLb: number | null,
  taskPayload: number | null,
  safetyFactor: number | null,
): RatingStatus => {
  if (payloadLb == null || taskPayload == null || safetyFactor == null) return 'watch';
  if (payloadLb < taskPayload) return 'fails';
  if (safetyFactor < 2) return 'watch';
  return 'passes';
};

const jobStatus = (status: string): JobStatus => {
  if (status === 'completed' || status === 'complete') return 'complete';
  if (status === 'blocked_missing_adapter' || status === 'failed' || status === 'blocked') return 'blocked';
  if (status === 'running') return 'running';
  return 'queued';
};

const riskFromPart = (part: BackendPart): RiskLevel => {
  if ((part.mass_kg ?? 0) > 0.2) return 'high';
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

const selectedAssembly = (panelData: BackendProjectPanelData): BackendAssembly =>
  panelData.project.assemblies[0] ?? {
    id: 'empty-assembly',
    name: 'Empty assembly',
    root_node_id: 'root',
    nodes: [],
    parts: [],
    wiring_routes: [],
  };

const costForPart = (part: BackendPart, material?: BackendMaterial): number => {
  const massLb = (part.mass_kg ?? 0.1) * 2.20462;
  const materialBase = material ? materialCost(material) * Math.max(0.2, massLb) : 12;
  const machiningFactor = part.manufacturing_options.some((option) => option.process.includes('cnc')) ? 3 : 1.4;
  return round(Math.max(6, materialBase * machiningFactor + part.related_fasteners.length * 2), 0);
};

const mapPart = (
  part: BackendPart,
  index: number,
  assembly: BackendAssembly,
  materialsById: Map<string, BackendMaterial>,
  taskPayload: number | null,
): Part => {
  const material = part.material_id ? materialsById.get(part.material_id) : undefined;
  const payloadLb = estimatePayload(part, material, taskPayload);
  const safetyFactor = payloadLb != null && taskPayload != null && taskPayload > 0
    ? round(payloadLb / taskPayload, 1)
    : null;
  const node = assembly.nodes.find((candidate) => candidate.part_ids.includes(part.id));
  return {
    id: part.id,
    name: part.name,
    subassembly: node?.name ?? part.category,
    purpose: part.purpose ?? 'Purpose metadata has not been extracted yet.',
    material: material?.name ?? part.material_id ?? 'Unknown material',
    manufacturingProcess: toTitle(String(part.metadata.preferred_manufacturing_process ?? part.manufacturing_options[0]?.process ?? 'unknown')),
    weightLb: round((part.mass_kg ?? 0) * 2.20462, 2),
    estimatedCostUsd: costForPart(part, material),
    stressRisk: riskFromPart(part),
    replacementDifficulty: replacementRisk(part),
    fasteners: part.related_fasteners,
    relatedWires: part.wiring_route_ids,
    rating: {
      status: ratingStatus(payloadLb, taskPayload, safetyFactor),
      payloadLb,
      safetyFactor,
      summary: taskPayload == null
        ? `${part.name} has no payload rating because the active task does not provide a pound target; review is required.`
        : `${part.name} is heuristically rated against the preserved ${taskPayload} lb task until real workers run.`,
      warning: part.wiring_route_ids.length > 0 ? 'Linked wiring routes require clearance checks after geometry edits.' : undefined,
    },
    visual: visualFor(part, index, node?.exploded_transform.translation_mm),
  };
};

const mapMaterialOptions = (
  parts: BackendPart[],
  materials: BackendMaterial[],
  taskPayload: number | null,
  projectId: string,
): MaterialOption[] =>
  parts.flatMap((part) => {
    const currentMaterialId = part.material_id;
    return materials
      .filter((material) => material.id !== currentMaterialId)
      .map((material) => {
        const payloadLb = estimatePayload(part, material, taskPayload);
        const safetyFactor = payloadLb != null && taskPayload != null && taskPayload > 0
          ? round(payloadLb / taskPayload, 1)
          : null;
        const status = ratingStatus(payloadLb, taskPayload, safetyFactor);
        const manufacturingProcess = material.compatible_processes[0] ?? 'unknown';
        const currentDensity = materials.find((candidate) => candidate.id === currentMaterialId)?.properties.density_kg_m3 ?? 2700;
        const nextDensity = material.properties.density_kg_m3 ?? currentDensity;
        const weightDeltaLb = round((part.mass_kg ?? 0.1) * (nextDensity / currentDensity - 1) * 2.20462, 2);
        const costDeltaUsd = round(materialCost(material) - materialCost(materials.find((candidate) => candidate.id === currentMaterialId) ?? material), 0);
        const needsGeometryChange = status === 'fails';
        const dimensionChanges: Record<string, number> =
          needsGeometryChange && part.dimensions.thickness_mm ? { thickness_mm: part.dimensions.thickness_mm + 2 } : {};
        return {
          id: `${part.id}-${material.id}`,
          partId: part.id,
          material: material.name,
          process: materialProcess(material, manufacturingProcess),
          payloadLb,
          safetyFactor,
          weightDeltaLb,
          costDeltaUsd,
          taskImpact: taskPayload == null || payloadLb == null || safetyFactor == null
            ? 'Payload target or rating is unknown; engineering review is required.'
            : needsGeometryChange
              ? `Fails the preserved ${taskPayload} lb task unless geometry or process constraints change.`
              : `Keeps the preserved ${taskPayload} lb task active with a ${safetyFactor.toFixed(1)} safety factor estimate.`,
          wiringImpact: part.wiring_route_ids.length > 0
            ? 'Backend modification report would require a wiring clearance and bend-radius worker check.'
            : 'No linked wiring route is known for this part in the sample project.',
          manufacturingImpact: `${toTitle(manufacturingProcess)} preview is advisory until supplier and manufacturing workers run.`,
          status,
          backendModification: {
            endpoint: `/api/projects/${projectId}/modifications`,
            method: 'POST',
            payload: {
              id: `mod-${part.id}-${material.id}`,
              target_part_id: part.id,
              description: `Preview changing ${part.name} to ${material.name} while preserving the active task.`,
              material_id: material.id,
              dimension_changes: dimensionChanges,
              manufacturing_process: manufacturingProcess,
            },
            reportTitle: `Advisory edit report for ${part.name}`,
            reportSummary: needsGeometryChange
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

const mapBOM = (items: BackendBOMItem[], parts: Part[]): BOMItem[] => {
  if (items.length === 0) {
    return parts.map((part) => ({
      id: `bom-${part.id}`,
      item: part.name,
      quantity: 1,
      source: part.relatedWires.length > 0 ? 'wire harness' : 'fabricate',
      unitCostUsd: null,
      leadTimeDays: null,
    }));
  }

  return items.map((item) => {
    const unitCostUsd = item.price?.min ?? item.price?.max ?? null;
    return {
      id: item.id,
      item: item.name,
      quantity: item.quantity,
      source: item.name.toLowerCase().includes('harness') ? 'wire harness' : item.part_id ? 'fabricate' : 'off the shelf',
      unitCostUsd,
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
      estimatedCostUsd: moneyRange(option.cost),
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
    clearanceStatus: route.clearance_min_mm == null ? 'watch' : route.clearance_min_mm < 3 ? 'watch' : 'passes',
    bendRadiusMm: route.bend_radius_min_mm ?? 0,
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
  const assembly = selectedAssembly(panelData);
  const task = activeTaskFrom(panelData.task_requirements, project.active_task);
  const taskPayload = task.unit === 'lb' && typeof task.target_value === 'number' ? task.target_value : null;
  const materialsById = new Map(project.materials.map((material) => [material.id, material]));
  const parts = assembly.parts.map((part, index) => mapPart(part, index, assembly, materialsById, taskPayload));
  const reports = (panelData.reports.length > 0 ? panelData.reports : project.reports).map(mapReport);

  return {
    id: project.reference_design_id ?? project.id,
    name: project.name,
    sourceUrl: 'https://github.com/SimplyAvi/mechaflow-cad',
    license: 'MIT',
    formats: ['STEP', 'FreeCAD', 'glTF', 'KiCad', 'WireViz'],
    task: {
      label: task.description,
      targetPayloadLb: taskPayload,
      cycleTimeSeconds: taskValue(panelData.task_requirements, 'cycle_time', 's'),
      reachMeters: taskValue(panelData.task_requirements, 'reach', 'm'),
      serviceGoal: 'Preserve serviceability and wiring clearance while editing parts.',
      safetyFactorMin: task.safety_factor_min ?? undefined,
      validationMethod: task.validation_method,
    },
    assembly: {
      name: assembly.name,
      explodedProgress: explodedViewProgress(project.analysis_jobs, assembly.id),
      parts,
    },
    materialOptions: mapMaterialOptions(assembly.parts, project.materials, taskPayload, project.id),
    bom: mapBOM(panelData.bom_items, parts),
    manufacturingOptions: mapManufacturing(panelData.manufacturing_options),
    analysisJobs: project.analysis_jobs.map(mapJob),
    wiringRoutes: mapWiring(panelData.wiring_routes.length > 0 ? panelData.wiring_routes : assembly.wiring_routes),
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
        'wireviz-harness-worker',
        'supplier-options-worker',
      ],
    },
  };
}
