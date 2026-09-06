import { mockBackendMetadata, mockProjectPanelData, mockReferenceDesign } from '../data/mockDesign';
import { mapBackendAnalysisJob, mapProjectPanelDataToReferenceDesign } from './backendMapper';
import { panelDataFromProject } from './visualAuthoring';
import type {
  AnalysisJob,
  BackendAnalysisJob,
  BackendApiMetadata,
  BackendMaterialSubstitutionPreview,
  BackendProjectFile,
  BackendProjectFileImportResponse,
  BackendProjectPanelData,
  LocalSolverReadinessSummary,
  MaterialOption,
  ReferenceDesign,
} from '../types';

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

const DEFAULT_PROJECT_ID = 'project-open-gripper-demo';

const toTitle = (value: string): string => value
  .split(/[_-]/)
  .filter(Boolean)
  .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
  .join(' ');

export const getApiBaseUrl = (): string | undefined => {
  const configured = import.meta.env.VITE_API_BASE_URL?.trim();
  return configured ? trimTrailingSlash(configured) : undefined;
};

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = init === undefined ? await fetch(url) : await fetch(url, init);
  if (!response.ok) {
    let detail = '';
    try {
      const payload = await response.json() as { detail?: unknown; error?: unknown };
      const rawDetail = payload.detail ?? payload.error;
      detail = typeof rawDetail === 'string' ? `: ${rawDetail}` : rawDetail ? `: ${JSON.stringify(rawDetail)}` : '';
    } catch {
      detail = '';
    }
    throw new Error(`${url} returned ${response.status}${detail}`);
  }
  return (await response.json()) as T;
}

async function loadMetadata(apiBaseUrl: string): Promise<BackendApiMetadata | undefined> {
  try {
    return await fetchJson<BackendApiMetadata>(`${apiBaseUrl}/api/metadata`);
  } catch (error) {
    console.warn('MechaFlow backend metadata endpoint is unavailable.', error);
    return undefined;
  }
}

async function loadProjectPanelData(apiBaseUrl: string, projectId: string): Promise<ReferenceDesign> {
  const metadata = await loadMetadata(apiBaseUrl);
  const endpoint = projectId === 'sample' ? '/api/projects/sample/panel-data' : `/api/projects/${projectId}/panel-data`;
  const panelData = await fetchJson<BackendProjectPanelData>(`${apiBaseUrl}${endpoint}`);
  return mapProjectPanelDataToReferenceDesign(panelData, metadata, apiBaseUrl);
}

export async function exportProjectFile(apiBaseUrl: string, projectId: string): Promise<BackendProjectFile> {
  return fetchJson<BackendProjectFile>(
    `${trimTrailingSlash(apiBaseUrl)}/api/projects/${projectId}/export-file`,
  );
}

export async function importProjectFile(apiBaseUrl: string, projectFile: unknown): Promise<ReferenceDesign> {
  const trimmedApiBaseUrl = trimTrailingSlash(apiBaseUrl);
  const metadata = await loadMetadata(trimmedApiBaseUrl);
  const imported = await fetchJson<BackendProjectFileImportResponse>(
    `${trimmedApiBaseUrl}/api/projects/import-file`,
    {
      body: JSON.stringify(projectFile),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    },
  );
  return mapProjectPanelDataToReferenceDesign(imported.panel_data, metadata, trimmedApiBaseUrl);
}

export function importLocalProjectFile(projectFile: unknown): ReferenceDesign {
  if (projectFile == null || typeof projectFile !== 'object') throw new Error('invalid project file');
  const file = projectFile as Partial<BackendProjectFile>;
  if (file.format !== 'mechaflow-cad.project' || file.schema_version !== '1.0' || file.project == null) {
    throw new Error('unsupported project file');
  }
  const project = file.project;
  const panelData: BackendProjectPanelData = panelDataFromProject(project, file.analysis_readiness_previews ?? []);
  return mapProjectPanelDataToReferenceDesign(panelData, mockBackendMetadata);
}

export interface MaterialSubstitutionResult {
  mode: 'preview' | 'applied';
  persisted: boolean;
  design: ReferenceDesign;
  option: MaterialOption;
  reportSummary: string;
}

const materialOptionFromBackendPreview = (
  payload: BackendMaterialSubstitutionPreview,
  projectId: string,
): MaterialOption => {
  const option = payload.option;
  return {
    id: option.id,
    partId: option.part_id,
    material: option.material_name,
    materialId: option.material_id,
    process: toTitle(option.process),
    processValue: option.process,
    currentMaterial: option.current_material_name ?? option.current_material_id ?? null,
    currentProcess: option.current_process == null ? null : toTitle(option.current_process),
    payloadLb: null,
    safetyFactor: null,
    weightDeltaLb: option.weight_delta_kg == null ? null : Number((option.weight_delta_kg * 2.20462).toFixed(2)),
    costRangeUsd: option.cost_range == null || option.cost_range.currency.toUpperCase() !== 'USD'
      ? null
      : { min: option.cost_range.min ?? null, max: option.cost_range.max ?? null },
    leadTimeRangeDays: { min: option.lead_time_days_min ?? null, max: option.lead_time_days_max ?? null },
    stiffnessGpa: option.stiffness_gpa ?? null,
    yieldStrengthMpa: option.yield_strength_mpa ?? null,
    heatLimitC: option.heat_limit_c ?? null,
    materialConfidence: option.material_confidence,
    manufacturingConfidence: option.manufacturing_confidence,
    reviewRequired: option.review_required,
    blockedReasons: option.blocked_reasons,
    warnings: option.warnings,
    taskImpact: option.task_guidance,
    wiringImpact: option.wiring_guidance,
    manufacturingImpact: option.manufacturing_guidance,
    status: 'watch',
    backendModification: {
      endpoint: `/api/projects/${projectId}/material-substitutions/${payload.mode === 'applied' ? 'apply' : 'preview'}`,
      method: 'POST',
      payload: option.modification,
      reportTitle: payload.report.title,
      reportSummary: payload.report.summary,
      reportStatus: payload.report.status,
    },
  };
};

async function materialSubstitution(
  apiBaseUrl: string,
  projectId: string,
  option: MaterialOption,
  action: 'preview' | 'apply',
): Promise<MaterialSubstitutionResult> {
  const trimmedApiBaseUrl = trimTrailingSlash(apiBaseUrl);
  const metadata = await loadMetadata(trimmedApiBaseUrl);
  const response = await fetchJson<BackendMaterialSubstitutionPreview>(
    `${trimmedApiBaseUrl}/api/projects/${projectId}/material-substitutions/${action}`,
    {
      body: JSON.stringify({
        target_part_id: option.partId,
        material_id: option.materialId,
        manufacturing_process: option.processValue,
        description: option.backendModification.payload.description,
        modification_id: option.backendModification.payload.id,
      }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    },
  );
  return {
    mode: response.mode,
    persisted: response.persisted,
    design: mapProjectPanelDataToReferenceDesign(response.panel_data, metadata, trimmedApiBaseUrl),
    option: materialOptionFromBackendPreview(response, projectId),
    reportSummary: response.report.summary,
  };
}

export async function previewMaterialSubstitution(
  apiBaseUrl: string,
  projectId: string,
  option: MaterialOption,
): Promise<MaterialSubstitutionResult> {
  return materialSubstitution(apiBaseUrl, projectId, option, 'preview');
}

export async function applyMaterialSubstitution(
  apiBaseUrl: string,
  projectId: string,
  option: MaterialOption,
): Promise<MaterialSubstitutionResult> {
  return materialSubstitution(apiBaseUrl, projectId, option, 'apply');
}

export async function runLocalPreSolverAnalysis(
  apiBaseUrl: string,
  projectId: string,
  targetId: string,
): Promise<AnalysisJob> {
  const job = await fetchJson<BackendAnalysisJob>(
    `${trimTrailingSlash(apiBaseUrl)}/api/projects/${projectId}/analysis-jobs/pre-solver-runs`,
    {
      body: JSON.stringify({ target_id: targetId }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    },
  );
  return mapBackendAnalysisJob(job);
}

export async function loadLocalSolverReadiness(apiBaseUrl: string): Promise<LocalSolverReadinessSummary> {
  return fetchJson<LocalSolverReadinessSummary>(
    `${trimTrailingSlash(apiBaseUrl)}/api/local-analysis/solver-readiness`,
  );
}

export async function runLocalSolverReadinessAnalysis(
  apiBaseUrl: string,
  projectId: string,
  targetId: string,
): Promise<AnalysisJob> {
  const job = await fetchJson<BackendAnalysisJob>(
    `${trimTrailingSlash(apiBaseUrl)}/api/projects/${projectId}/analysis-jobs/solver-readiness-runs`,
    {
      body: JSON.stringify({ target_id: targetId }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    },
  );
  return mapBackendAnalysisJob(job);
}

export async function loadCockpitDesign(projectId = DEFAULT_PROJECT_ID): Promise<ReferenceDesign> {
  const apiBaseUrl = getApiBaseUrl();

  if (!apiBaseUrl) {
    return mockReferenceDesign;
  }

  try {
    return await loadProjectPanelData(apiBaseUrl, projectId);
  } catch (panelError) {
    console.warn('Falling back from MechaFlow project panel data endpoint.', panelError);
    return {
      ...mapProjectPanelDataToReferenceDesign(mockProjectPanelData, mockBackendMetadata),
      backend: {
        ...mockReferenceDesign.backend,
        source: 'bundled-mock-after-error',
        apiBaseUrl,
      },
    };
  }
}
