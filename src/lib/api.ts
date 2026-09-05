import { mockBackendMetadata, mockProjectPanelData, mockReferenceDesign } from '../data/mockDesign';
import { mapBackendAnalysisJob, mapProjectPanelDataToReferenceDesign } from './backendMapper';
import type {
  AnalysisJob,
  BackendAnalysisJob,
  BackendApiMetadata,
  BackendProjectFile,
  BackendProjectFileImportResponse,
  BackendProjectPanelData,
  ReferenceDesign,
} from '../types';

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

const DEFAULT_PROJECT_ID = 'project-open-gripper-demo';

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
