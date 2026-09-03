import { mockBackendMetadata, mockProjectPanelData, mockReferenceDesign } from '../data/mockDesign';
import { mapProjectPanelDataToReferenceDesign } from './backendMapper';
import type { BackendApiMetadata, BackendProjectPanelData, ReferenceDesign } from '../types';

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

const DEFAULT_PROJECT_ID = 'project-open-gripper-demo';

export const getApiBaseUrl = (): string | undefined => {
  const configured = import.meta.env.VITE_API_BASE_URL?.trim();
  return configured ? trimTrailingSlash(configured) : undefined;
};

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
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

async function loadLegacyReferenceDesign(apiBaseUrl: string, designId: string): Promise<ReferenceDesign> {
  const design = await fetchJson<ReferenceDesign>(`${apiBaseUrl}/api/reference-designs/${designId}`);
  return {
    ...design,
    backend: {
      ...design.backend,
      source: 'legacy-reference-design',
      apiBaseUrl,
      endpoint: `/api/reference-designs/${designId}`,
    },
  };
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
    try {
      return await loadLegacyReferenceDesign(apiBaseUrl, mockReferenceDesign.id);
    } catch (legacyError) {
      console.warn('Falling back to bundled MechaFlow CAD mock design data.', legacyError);
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
}
