import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockBackendMetadata, mockProjectPanelData } from '../data/mockDesign';
import { loadCockpitDesign, runLocalPreSolverAnalysis } from './api';

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

  it('runs a local pre-solver job against the configured backend', async () => {
    const backendJob = {
      id: 'job-local-presolver',
      job_type: 'run_fea',
      status: 'completed',
      target_id: 'part-finger-link',
      project_id: 'project-open-gripper-demo',
      adapter_name: 'local-pre-solver-runner',
      local_compute_preferred: true,
      input_summary: {},
      result_summary: {
        message: 'Local pre-solver screening completed. This is not a real FEA result; review remains required.',
        progress: 100,
        review_status: 'review_required',
        trust_label: 'demo_pre_solver_not_fea',
      },
      artifacts: [{
        kind: 'fea_summary',
        title: 'Local pre-solver screening package, not FEA',
        summary: 'No FreeCAD geometry prep, Gmsh mesh, or CalculiX solve was run.',
        confidence: 'estimated_from_heuristic',
        generated_by: 'local-pre-solver-runner',
      }],
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('http://api.test/api/projects/project-open-gripper-demo/analysis-jobs/pre-solver-runs');
      expect(init?.method).toBe('POST');
      expect(init?.body).toBe(JSON.stringify({ target_id: 'part-finger-link' }));
      return Response.json(backendJob);
    });
    vi.stubGlobal('fetch', fetchMock);

    const job = await runLocalPreSolverAnalysis(
      'http://api.test/',
      'project-open-gripper-demo',
      'part-finger-link',
    );

    expect(job.status).toBe('complete');
    expect(job.progress).toBe(100);
    expect(job.worker).toBe('local-pre-solver-runner');
    expect(job.artifacts[0]?.title).toContain('not FEA');
    expect(job.reviewStatus).toBe('review_required');
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
