import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockBackendMetadata, mockProjectPanelData } from '../data/mockDesign';
import { loadCockpitDesign } from './api';

describe('loadCockpitDesign', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('uses bundled mock data when no backend URL is configured', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '');

    const design = await loadCockpitDesign();

    expect(design.name).toContain('Robot arm visual MVP task-preserving edit demo');
    expect(design.backend.source).toBe('bundled-mock');
    expect(design.analysisJobs.some((job) => job.worker === 'freecad-worker')).toBe(true);
  });

  it('loads project panel data from the configured backend URL', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://api.test/');
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/metadata')) return Response.json(mockBackendMetadata);
      if (url.endsWith('/api/projects/project-open-gripper-demo/panel-data')) return Response.json(mockProjectPanelData);
      return new Response('Not found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const design = await loadCockpitDesign();

    expect(fetchMock).toHaveBeenCalledWith('http://api.test/api/metadata');
    expect(fetchMock).toHaveBeenCalledWith('http://api.test/api/projects/project-open-gripper-demo/panel-data');
    expect(design.name).toBe('Robot arm visual MVP task-preserving edit demo');
    expect(design.backend.source).toBe('backend-panel-data');
  });

  it('falls back directly to bundled data when panel data is unavailable', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://api.test/');
    const fetchMock = vi.fn(async () => new Response('Not found', { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);

    const design = await loadCockpitDesign();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(design.backend.source).toBe('bundled-mock-after-error');
  });
});
