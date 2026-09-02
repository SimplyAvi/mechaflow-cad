import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadCockpitDesign } from './api';

describe('loadCockpitDesign', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('uses bundled mock data when no backend URL is configured', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '');

    const design = await loadCockpitDesign();

    expect(design.name).toContain('Open parallel robot gripper');
    expect(design.analysisJobs.some((job) => job.worker === 'FreeCAD')).toBe(true);
  });

  it('loads a reference design from the configured backend URL', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://api.test/');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'backend-design', name: 'Backend design' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const design = await loadCockpitDesign('backend-design');

    expect(fetchMock).toHaveBeenCalledWith('http://api.test/api/reference-designs/backend-design');
    expect(design.name).toBe('Backend design');
  });
});
