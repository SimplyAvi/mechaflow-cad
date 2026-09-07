import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockBackendMetadata, mockProjectPanelData } from '../data/mockDesign';
import {
  applyMaterialSubstitution,
  exportProjectFile,
  importProjectFile,
  loadCockpitDesign,
  loadLocalSolverReadiness,
  previewMaterialSubstitution,
  runLocalPreSolverAnalysis,
  runLocalSolverReadinessAnalysis,
} from './api';
import { mapProjectPanelDataToReferenceDesign } from './backendMapper';

describe('loadCockpitDesign', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('uses bundled mock data when no backend URL is configured', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '');

    const design = await loadCockpitDesign();

    expect(design.name).toContain('Robot arm with catalog-matched servo actuator demo');
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
    expect(design.name).toBe('Robot arm with catalog-matched servo actuator demo');
    expect(design.backend.source).toBe('backend-panel-data');
  });

  it('exports and imports a portable project file through the configured backend', async () => {
    const projectFile = {
      format: 'mechaflow-cad.project' as const,
      schema_version: '1.0' as const,
      metadata: {
        exported_at: '2026-09-05T00:00:00Z',
        source_api_version: '0.1.0',
        exported_by: 'test',
        notes: [],
      },
      project: mockProjectPanelData.project,
      analysis_readiness_previews: mockProjectPanelData.analysis_readiness_previews ?? [],
      extensions: {},
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/metadata')) return Response.json(mockBackendMetadata);
      if (url.endsWith('/api/projects/project-open-gripper-demo/export-file')) return Response.json(projectFile);
      if (url.endsWith('/api/projects/import-file')) {
        expect(init?.method).toBe('POST');
        expect(init?.body).toBe(JSON.stringify(projectFile));
        return Response.json({
          status: 'imported',
          project_id: 'project-open-gripper-demo',
          message: 'Imported MechaFlow project file for project-open-gripper-demo.',
          warnings: [],
          project: mockProjectPanelData.project,
          panel_data: mockProjectPanelData,
        });
      }
      return new Response('Not found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(exportProjectFile('http://api.test/', 'project-open-gripper-demo')).resolves.toEqual(projectFile);
    const imported = await importProjectFile('http://api.test/', projectFile);

    expect(fetchMock).toHaveBeenCalledWith('http://api.test/api/projects/project-open-gripper-demo/export-file');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/api/projects/import-file',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(imported.name).toBe('Robot arm with catalog-matched servo actuator demo');
    expect(imported.backend.projectId).toBe('project-open-gripper-demo');
    expect(imported.assemblies[0]?.parts.map((part) => part.id)).toContain('part-finger-link');
  });

  it('previews and applies a backend material substitution with mapped panel data', async () => {
    const panelData = structuredClone(mockProjectPanelData);
    const previewPanelData = structuredClone(mockProjectPanelData);
    const finger = previewPanelData.project.assemblies[0]!.parts.find((part) => part.id === 'part-finger-link')!;
    finger.material_id = 'mat-carbon-fiber-nylon';
    finger.metadata.preferred_manufacturing_process = 'additive_fdm';
    previewPanelData.bom_items[0]!.price = {
      currency: 'USD',
      min: 3,
      max: 12,
      confidence: 'estimated_from_heuristic',
    };
    previewPanelData.bom_items[0]!.lead_time_days_min = 1;
    previewPanelData.bom_items[0]!.lead_time_days_max = 3;
    const backendPreview = {
      mode: 'preview',
      persisted: false,
      option: {
        id: 'part-finger-link-mat-carbon-fiber-nylon-additive_fdm',
        part_id: 'part-finger-link',
        part_name: 'Parallel gripper jaw link',
        current_material_id: 'mat-aluminum-6061-t6',
        current_material_name: 'Aluminum 6061-T6',
        current_process: 'cnc_machining',
        material_id: 'mat-carbon-fiber-nylon',
        material_name: 'Carbon-fiber reinforced nylon',
        process: 'additive_fdm',
        compatible: true,
        review_required: true,
        blocked_reasons: [],
        warnings: ['No FEA was run.'],
        weight_delta_kg: -0.06,
        cost_range: { currency: 'USD', min: 3, max: 12, confidence: 'estimated_from_heuristic' },
        cost_delta: null,
        lead_time_days_min: 1,
        lead_time_days_max: 3,
        stiffness_gpa: 7.5,
        yield_strength_mpa: 70,
        heat_limit_c: 120,
        material_confidence: 'estimated_from_heuristic',
        manufacturing_confidence: 'estimated_from_heuristic',
        summary: 'Review required.',
        task_guidance: 'No worker-supplied payload rating.',
        manufacturing_guidance: 'Not supplier quotes.',
        wiring_guidance: 'Check wiring clearance.',
        modification: {
          id: 'mod-part-finger-link-mat-carbon-fiber-nylon-additive_fdm',
          target_part_id: 'part-finger-link',
          description: 'Preview substituting finger link.',
          material_id: 'mat-carbon-fiber-nylon',
          dimension_changes: {},
          manufacturing_process: 'additive_fdm',
        },
      },
      report: {
        id: 'report-preview',
        project_id: 'project-open-gripper-demo',
        title: 'Advisory edit report for Parallel gripper jaw link',
        status: 'requires_review',
        summary: 'Preview only, not FEA.',
        task_results: [],
        manufacturing_impacts: [],
        wiring_impacts: [],
        risks: [],
        unknowns: [],
        recommendations: [],
        assumptions: [],
      },
      panel_data: previewPanelData,
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/metadata')) return Response.json(mockBackendMetadata);
      if (url.endsWith('/api/projects/project-open-gripper-demo/material-substitutions/preview')) {
        expect(init?.method).toBe('POST');
        expect(init?.body).toContain('mat-carbon-fiber-nylon');
        return Response.json(backendPreview);
      }
      if (url.endsWith('/api/projects/project-open-gripper-demo/material-substitutions/apply')) {
        expect(init?.method).toBe('POST');
        return Response.json({ ...backendPreview, mode: 'applied', persisted: true });
      }
      return new Response('Not found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const design = mapProjectPanelDataToReferenceDesign(panelData, mockBackendMetadata, 'http://api.test');
    const option = design.materialOptions.find(
      (candidate) => candidate.id === 'part-finger-link-mat-carbon-fiber-nylon-additive_fdm',
    )!;

    const preview = await previewMaterialSubstitution('http://api.test/', 'project-open-gripper-demo', option);
    const applied = await applyMaterialSubstitution('http://api.test/', 'project-open-gripper-demo', option);

    expect(preview.persisted).toBe(false);
    expect(preview.design.bom[0]?.unitCostRangeUsd).toEqual({ min: 3, max: 12 });
    expect(preview.option.weightDeltaLb).toBe(-0.13);
    expect(preview.option.leadTimeRangeDays).toEqual({ min: 1, max: 3 });
    expect(applied.persisted).toBe(true);
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
        id: 'artifact-local-presolver',
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

  it('loads solver readiness and runs a solver-unavailable fixture boundary', async () => {
    const backendReadiness = {
      status: 'solver_unavailable',
      tool_statuses: [],
      available_tools: [],
      missing_tools: ['CalculiX'],
      execution_modes: [],
      install_guidance: ['Install CalculiX.'],
      summary: 'CalculiX is missing.',
    };
    const backendJob = {
      id: 'job-local-fixture',
      job_type: 'run_fea',
      status: 'solver_unavailable',
      target_id: 'part-finger-link',
      project_id: 'project-open-gripper-demo',
      adapter_name: 'local-calculix-fixture-runner',
      local_compute_preferred: true,
      input_summary: {},
      result_summary: {
        message: 'CalculiX is unavailable. Fixture input was generated, but no solver was run.',
        progress: 100,
        review_status: 'solver_unavailable_review_required',
        trust_label: 'pre_solver_input',
      },
      artifacts: [{
        id: 'artifact-local-fixture',
        kind: 'fea_summary',
        title: 'CalculiX solver fixture prepared, solver unavailable',
        payload: { file_manifest: [{ name: 'mechaflow_static_fixture.inp' }] },
        generated_by: 'local-calculix-fixture-runner',
      }],
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/local-analysis/solver-readiness')) {
        expect(init).toBeUndefined();
        return Response.json(backendReadiness);
      }
      expect(url).toBe('http://api.test/api/projects/project-open-gripper-demo/analysis-jobs/solver-readiness-runs');
      expect(init?.method).toBe('POST');
      expect(init?.body).toBe(JSON.stringify({ target_id: 'part-finger-link' }));
      return Response.json(backendJob);
    });
    vi.stubGlobal('fetch', fetchMock);

    const readiness = await loadLocalSolverReadiness('http://api.test/');
    const job = await runLocalSolverReadinessAnalysis(
      'http://api.test/',
      'project-open-gripper-demo',
      'part-finger-link',
    );

    expect(readiness.missing_tools).toEqual(['CalculiX']);
    expect(job.status).toBe('solver-unavailable');
    expect(job.artifacts[0]?.payload?.file_manifest).toEqual([{ name: 'mechaflow_static_fixture.inp' }]);
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
