import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { mockBackendMetadata, mockProjectPanelData } from './data/mockDesign';

describe('MechaFlow cockpit', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('renders the core open-design workflow with bundled backend-shaped mock data', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '');

    render(<App />);

    expect(await screen.findByRole('heading', { name: /Robot arm CAD review cockpit/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Captain demo checklist/i)).toHaveTextContent('Guided end-to-end MVP flow');
    expect(screen.getByLabelText(/Captain demo checklist/i)).toHaveTextContent('1/8');
    expect(screen.getByLabelText(/Captain demo checklist/i)).toHaveTextContent('Open reference robot');
    expect(screen.getByLabelText(/Captain demo checklist/i)).toHaveTextContent('Try material substitution');
    expect(screen.getByLabelText(/Captain demo checklist/i)).toHaveTextContent('Run local-safe analysis path');
    expect(screen.getByLabelText(/Preserved task/i)).toHaveTextContent('50 lb');
    expect(screen.getByLabelText(/Preserved task/i)).toHaveTextContent('8s cycle');
    expect(screen.getByLabelText(/Preserved task/i)).toHaveTextContent('0.65m reach');
    expect(screen.getByRole('img', { name: /Interactive exploded view/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Assembly yaw rotation/i)).toHaveValue('18');
    expect(screen.getByLabelText(/Assembly orbit pitch/i)).toHaveValue('10');
    expect(screen.getByLabelText(/Explode amount/i)).toHaveValue('100');
    expect(screen.getByText(/Exploded-view data/i)).toHaveTextContent('100% demo transforms ready');
    expect(screen.getByLabelText(/Design criteria and strength information/i)).toHaveTextContent(/not real FEA results/i);
    expect(screen.getByLabelText(/Design criteria and strength information/i)).toHaveTextContent(/140 lb demo limit/i);
    expect(screen.getByLabelText(/Design criteria and strength information/i)).toHaveTextContent(/Source and confidence/i);
    expect(screen.getByLabelText(/^Part readiness pre-solver analysis readiness$/i)).toHaveTextContent(/pre-solver input only/i);
    expect(screen.getByLabelText(/^Part readiness pre-solver analysis readiness$/i)).toHaveTextContent(/no FEA claim/i);
    expect(screen.getByLabelText(/^Part readiness pre-solver analysis readiness$/i)).toHaveTextContent(/Explicit load cases/i);
    expect(screen.getByLabelText(/^Part readiness pre-solver analysis readiness$/i)).toHaveTextContent(/Gmsh finite-element mesh/i);
    expect(screen.getByText(/Analysis job queue/i)).toBeInTheDocument();
    expect(screen.getByText(/Local-first orchestration and cached reports/i)).toBeInTheDocument();
    expect(screen.getByText(/BOM and cost/i)).toBeInTheDocument();
    expect(screen.getByText(/Wiring and electronics/i)).toBeInTheDocument();
    expect(screen.getByText(/Backend handoff mirrored/i)).toBeInTheDocument();
    expect(screen.getByText(/^MIT$/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open catalog entry/i })).toHaveAttribute(
      'href',
      'https://github.com/SimplyAvi/mechaflow-cad',
    );
    expect(screen.getAllByText(/Advisory edit report/i).length).toBeGreaterThan(0);
    const inspectorPanel = screen.getByText('Part inspector').closest('aside');
    expect(inspectorPanel).not.toBeNull();
    expect(within(inspectorPanel as HTMLElement).getByText('$42-$130')).toBeInTheDocument();
  });

  it('updates capability impact and backend modification preview when a material substitution is selected', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '');
    const user = userEvent.setup();

    render(<App />);

    const partTree = await screen.findByText('Selectable parts');
    const treeContainer = partTree.closest('.part-tree');
    expect(treeContainer).not.toBeNull();
    await user.click(within(treeContainer as HTMLElement).getByRole('button', { name: /Parallel gripper jaw link/i }));

    expect(screen.getByRole('heading', { name: /^Parallel gripper jaw link$/i })).toBeInTheDocument();
    const optionSelector = screen.getByLabelText(/Preview option/i);
    expect(within(optionSelector).queryByRole('option', { name: /FR-4/i })).not.toBeInTheDocument();

    await user.selectOptions(optionSelector, 'part-finger-link-mat-carbon-fiber-nylon-additive_fdm');

    expect(
      screen.getAllByText(/Material and process substitution preview has no worker-supplied payload rating/i).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText(/Payload rating review required/i)).toBeInTheDocument();
    expect(screen.getByText(/Cost range/i).closest('div')).toHaveTextContent('$3-$12');
    expect(screen.getAllByText(/1-3 days/i).length).toBeGreaterThan(0);
    expect(screen.getByLabelText(/Backend modification preview/i)).toHaveTextContent(
      '/api/projects/project-open-gripper-demo/material-substitutions/preview then /apply',
    );
    expect(screen.getByLabelText(/Backend modification preview/i)).toHaveTextContent('"dimension_changes": {}');
    expect(screen.getByText(/mat-carbon-fiber-nylon/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Captain demo checklist/i)).toHaveTextContent('2/8');
    expect(screen.getByLabelText(/Captain demo checklist/i)).toHaveTextContent('Try material substitutionReady');
  });

  it('does not mark downstream workflow available without electronics records', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://api.test');
    const panelDataWithoutElectronics = structuredClone(mockProjectPanelData);
    panelDataWithoutElectronics.electronics_components = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/metadata')) return Response.json(mockBackendMetadata);
      if (url.endsWith('/api/projects/project-open-gripper-demo/panel-data')) {
        return Response.json(panelDataWithoutElectronics);
      }
      if (url.endsWith('/api/projects/project-open-gripper-demo/analysis-readiness')) {
        return new Response('Not found', { status: 404 });
      }
      return new Response('Not found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    const checklist = await screen.findByLabelText(/Captain demo checklist/i);
    const downstreamStep = within(checklist).getByText('Review BOM, manufacturing, and wiring').parentElement;
    expect(downstreamStep).not.toBeNull();
    expect(downstreamStep).toHaveTextContent('Review required');
    expect(within(checklist).getByText('One or more downstream workflow panels need seed or backend data before the captain demo is complete.')).toBeInTheDocument();
  });

  it('selects a different part from the assembly and shows its wiring context', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '');
    const user = userEvent.setup();

    render(<App />);

    const partTree = await screen.findByText('Selectable parts');
    const treeContainer = partTree.closest('.part-tree');
    expect(treeContainer).not.toBeNull();

    await user.click(within(treeContainer as HTMLElement).getByRole('button', { name: /Upper arm link/i }));

    expect(screen.getByRole('heading', { name: /Upper arm link/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Design criteria and strength information/i)).toHaveTextContent(/72 lb demo limit/i);
    expect(screen.getByLabelText(/^Part readiness pre-solver analysis readiness$/i)).toHaveTextContent(/Demo estimate only/i);
    expect(screen.getByLabelText(/^Part readiness pre-solver analysis readiness$/i)).toHaveTextContent(/CalculiX static structural input deck/i);
    expect(screen.getAllByText(/Main arm harness/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Finger force sensor lead/i)).not.toBeInTheDocument();
    expect(screen.getAllByText(/service loop review required/i).length).toBeGreaterThan(0);
  });

  it('rotates and collapses the interactive exploded view controls', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '');
    const user = userEvent.setup();

    render(<App />);

    expect(await screen.findByRole('img', { name: /Interactive exploded view/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Orbit right/i }));
    expect(screen.getByLabelText(/Assembly yaw rotation/i)).toHaveValue('33');
    expect(screen.getByText(/Orbit yaw/i)).toHaveTextContent('33 degrees');

    await user.click(screen.getByRole('button', { name: /Collapse assembly/i }));
    expect(screen.getByRole('button', { name: /Explode assembly/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Explode amount/i)).toHaveValue('0');
  });

  it('requires compatibility review when a part has no explicit substitution', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '');
    const user = userEvent.setup();

    render(<App />);

    const partTree = await screen.findByText('Selectable parts');
    const treeContainer = partTree.closest('.part-tree');
    expect(treeContainer).not.toBeNull();

    await user.click(within(treeContainer as HTMLElement).getByRole('button', { name: /Controller PCB placeholder/i }));

    expect(screen.getByRole('heading', { name: /Controller PCB placeholder/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Design criteria and strength information/i)).toHaveTextContent(/Review required/i);
    expect(screen.getByLabelText(/Design criteria and strength information/i)).toHaveTextContent(/not a load-bearing part/i);
    expect(screen.getByLabelText(/Design criteria and strength information/i)).toHaveTextContent(/Source and confidence/i);
    expect(screen.getByLabelText(/^Part readiness pre-solver analysis readiness$/i)).toHaveTextContent(/Board support, connector loads, and heat dissipation need review/i);
    expect(screen.getByText(/No compatible substitution options are available/i)).toHaveTextContent(
      /compatibility review is required/i,
    );
    expect(screen.queryByLabelText(/Preview option/i)).not.toBeInTheDocument();
  });

  it('loads the backend project panel endpoint when an API base URL is configured', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://api.test');
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/metadata')) {
        return Response.json(mockBackendMetadata);
      }
      if (url.endsWith('/api/projects/project-open-gripper-demo/panel-data')) {
        return Response.json(mockProjectPanelData);
      }
      return new Response('Not found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    expect(await screen.findByText(/Data source: backend panel data/i)).toBeInTheDocument();
    expect(screen.getByText(/http:\/\/api.test\/api\/projects\/project-open-gripper-demo\/panel-data/i)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('http://api.test/api/metadata');
    expect(fetchMock).toHaveBeenCalledWith('http://api.test/api/projects/project-open-gripper-demo/panel-data');
  });

  it('renders queue recommendations, planning estimates, and cached artifact links from the backend', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://api.test');
    const panelData = structuredClone(mockProjectPanelData);
    const job = panelData.project.analysis_jobs[0]!;
    job.artifacts[0] = {
      ...job.artifacts[0]!,
      id: 'artifact-cad-metadata',
      payload: {
        file_manifest: [{ name: 'metadata.json', download_url: '/api/analysis-artifacts/artifact-cad-metadata/metadata.json', bytes: 124 }],
      },
    };
    job.recommendation = {
      recommended_target: 'cloud_recommended_when_configured',
      status: 'review_required',
      summary: 'Cloud planning is recommended only after configuration because local FreeCAD is missing.',
      reasons: ['FreeCAD is missing locally.', 'Cloud execution remains unavailable in this MVP.'],
      missing_local_tools: ['FreeCAD'],
      review_required: ['Configure provider and budget guardrails before remote execution.'],
      model_complexity_score: 9,
      expected_runtime_minutes: { label: 'local runtime planning estimate', min: 72, max: 101, unit: 'minutes', basis: 'deterministic_local_heuristic', confidence: 'estimated_from_heuristic', notice: 'Estimate only.' },
      cost_estimate: { label: 'cloud planning cost estimate, not a quote', min: 3.15, max: 13.25, unit: 'USD', basis: 'cloud_planning_estimate', confidence: 'estimated_from_heuristic', notice: 'Planning estimate only. This is not real billing, a supplier quote, or a compute-provider price.' },
      wait_time_estimate: { label: 'cloud planning wait estimate', min: 14, max: 36, unit: 'minutes', basis: 'cloud_planning_estimate', confidence: 'estimated_from_heuristic', notice: 'Hypothetical cloud queue only.' },
      cloud_execution_available: false,
      cloud_configuration_required: true,
      cloud_notice: 'Cloud execution is not configured.',
    };
    job.cached_artifact_refs = [{
      artifact_id: 'artifact-cad-metadata',
      job_id: job.id,
      project_id: panelData.project.id,
      kind: 'cad_metadata',
      title: 'Starter CAD metadata',
      status: 'current',
      generated_by: 'freecad-worker',
      generated_at: '2026-09-03T00:00:00Z',
      download_urls: ['/api/analysis-artifacts/artifact-cad-metadata/metadata.json'],
      summary: 'Cached metadata bundle.',
      stale_reason: null,
    }];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/metadata')) return Response.json(mockBackendMetadata);
      if (url.endsWith('/api/projects/project-open-gripper-demo/panel-data')) return Response.json(panelData);
      return new Response('Not found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    expect(await screen.findByText(/cloud planning is recommended only after configuration/i)).toBeInTheDocument();
    expect(screen.getByText(/cloud recommended when configured/i)).toBeInTheDocument();
    expect(screen.getByText(/Planning estimate only. This is not real billing/i)).toBeInTheDocument();
    expect(screen.getByText(/Missing local tools: FreeCAD/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Download cached artifact/i })).toHaveAttribute(
      'href',
      'http://api.test/api/analysis-artifacts/artifact-cad-metadata/metadata.json',
    );
  });

  it('previews then applies a backend material substitution without mutating during preview', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://api.test');
    const user = userEvent.setup();
    const previewPanelData = structuredClone(mockProjectPanelData);
    const previewFinger = previewPanelData.project.assemblies[0]!.parts.find((part) => part.id === 'part-finger-link')!;
    previewFinger.material_id = 'mat-carbon-fiber-nylon';
    previewFinger.metadata.preferred_manufacturing_process = 'additive_fdm';
    previewFinger.mass_kg = null;
    previewPanelData.bom_items = previewPanelData.bom_items.map((item) => item.part_id === 'part-finger-link'
      ? {
          ...item,
          price: { currency: 'USD', min: 3, max: 12, confidence: 'estimated_from_heuristic' },
          lead_time_days_min: 1,
          lead_time_days_max: 3,
        }
      : item);
    previewPanelData.reports = [{
      id: 'report-substitution-preview',
      project_id: 'project-open-gripper-demo',
      title: 'Advisory edit report for Parallel gripper jaw link',
      status: 'requires_review',
      summary: 'Previewed material substitution; no FEA or supplier quote was produced.',
      task_results: [],
      manufacturing_impacts: ['Preferred process changed to additive_fdm.'],
      wiring_impacts: ['Linked wiring needs clearance review.'],
      risks: ['Local edit preview does not modify CAD geometry yet.'],
      unknowns: ['Supplier price remains an estimate.'],
      recommendations: ['Queue worker validation before release.'],
      assumptions: ['Panel data projection only.'],
    }];
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
        manufacturing_guidance: 'Cost and lead time are heuristic ranges, not supplier quotes.',
        wiring_guidance: 'Linked wiring routes require clearance review.',
        modification: {
          id: 'mod-part-finger-link-mat-carbon-fiber-nylon-additive_fdm',
          target_part_id: 'part-finger-link',
          description: 'Preview substituting Parallel gripper jaw link.',
          material_id: 'mat-carbon-fiber-nylon',
          dimension_changes: {},
          manufacturing_process: 'additive_fdm',
        },
      },
      report: previewPanelData.reports[0],
      panel_data: previewPanelData,
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/metadata')) return Response.json(mockBackendMetadata);
      if (url.endsWith('/api/projects/project-open-gripper-demo/panel-data')) return Response.json(mockProjectPanelData);
      if (url.endsWith('/api/projects/project-open-gripper-demo/material-substitutions/preview')) return Response.json(backendPreview);
      if (url.endsWith('/api/projects/project-open-gripper-demo/material-substitutions/apply')) {
        return Response.json({ ...backendPreview, mode: 'applied', persisted: true });
      }
      return new Response('Not found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    const partTree = await screen.findByText('Selectable parts');
    const treeContainer = partTree.closest('.part-tree');
    expect(treeContainer).not.toBeNull();
    await user.click(within(treeContainer as HTMLElement).getByRole('button', { name: /Parallel gripper jaw link/i }));
    await user.selectOptions(
      screen.getByLabelText(/Preview option/i),
      'part-finger-link-mat-carbon-fiber-nylon-additive_fdm',
    );

    expect(screen.getByRole('heading', { name: '$440.60-$1,345.46 open estimate' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Apply validated substitution/i })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /Preview backend impact/i }));

    expect(await screen.findByText(/Preview only: BOM, manufacturing, readiness, and reports below show projected effects/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Captain demo checklist/i)).toHaveTextContent('3/8');
    expect(screen.getByText(/BOM and cost preview/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '$418.60-$1,277.46 open estimate' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Apply validated substitution/i })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: /Apply validated substitution/i }));

    expect(await screen.findByText(/Applied substitution to the backend project/i)).toBeInTheDocument();
    expect(screen.queryByText(/BOM and cost preview/i)).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '$418.60-$1,277.46 open estimate' })).toBeInTheDocument();
  });

  it('imports a portable project file from the desktop picker and keeps cockpit data interactive', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://api.test');
    const user = userEvent.setup();
    const importedPanelData = structuredClone(mockProjectPanelData);
    importedPanelData.project.name = 'Imported robot arm project';
    const projectFile = {
      format: 'mechaflow-cad.project',
      schema_version: '1.0',
      metadata: {
        exported_at: '2026-09-05T00:00:00Z',
        source_api_version: '0.1.0',
        exported_by: 'test',
        notes: [],
      },
      project: importedPanelData.project,
      analysis_readiness_previews: importedPanelData.analysis_readiness_previews ?? [],
      extensions: {},
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/metadata')) return Response.json(mockBackendMetadata);
      if (url.endsWith('/api/projects/project-open-gripper-demo/panel-data')) return Response.json(mockProjectPanelData);
      if (url.endsWith('/api/local-analysis/solver-readiness')) {
        return Response.json({
          status: 'ready',
          summary: 'Prior project solver state.',
          tool_statuses: [],
          available_tools: [],
          missing_tools: [],
          execution_modes: [],
          install_guidance: [],
        });
      }
      if (url.endsWith('/api/projects/import-file')) {
        expect(init?.method).toBe('POST');
        expect(init?.body).toBe(JSON.stringify(projectFile));
        return Response.json({
          status: 'imported',
          project_id: importedPanelData.project.id,
          message: 'Imported MechaFlow project file for project-open-gripper-demo.',
          warnings: [],
          project: importedPanelData.project,
          panel_data: importedPanelData,
        });
      }
      return new Response('Not found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    expect(await screen.findByRole('heading', { name: /Robot arm CAD review cockpit/i })).toBeInTheDocument();
    expect(await screen.findByText(/Prior project solver state/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Project file import and export/i)).toHaveTextContent(/Portable project file/i);
    await user.upload(
      screen.getByLabelText(/Import MechaFlow project file/i),
      new File([JSON.stringify(projectFile)], 'demo.mfcad.json', { type: 'application/json' }),
    );

    expect(await screen.findByText(/Opened Imported robot arm project from demo.mfcad.json/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^Imported robot arm project$/i })).toBeInTheDocument();
    expect(screen.getByText(/Exploded-view data/i)).toHaveTextContent('100% demo transforms ready');
    expect(screen.getByLabelText(/^Part readiness pre-solver analysis readiness$/i)).toHaveTextContent(/Explicit load cases/i);
    expect(screen.getByText(/Wiring and electronics/i)).toBeInTheDocument();
    expect(screen.getByText(/Prior project solver state/i)).toBeInTheDocument();
  });

  it('shows an understandable project-file error for invalid local JSON', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://api.test');
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/metadata')) return Response.json(mockBackendMetadata);
      if (url.endsWith('/api/projects/project-open-gripper-demo/panel-data')) return Response.json(mockProjectPanelData);
      return new Response('Not found', { status: 404 });
    }));

    render(<App />);

    expect(await screen.findByLabelText(/Project file import and export/i)).toBeInTheDocument();
    await user.upload(
      screen.getByLabelText(/Import MechaFlow project file/i),
      new File(['not json'], 'broken.mfcad.json', { type: 'application/json' }),
    );

    expect(await screen.findByText(/Project import failed: file is not valid JSON/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Robot arm visual MVP task-preserving edit demo/i })).toBeInTheDocument();
  });

  it('triggers a backend local pre-solver run and shows review-required artifacts', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://api.test');
    const user = userEvent.setup();
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
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/metadata')) return Response.json(mockBackendMetadata);
      if (url.endsWith('/api/projects/project-open-gripper-demo/panel-data')) return Response.json(mockProjectPanelData);
      if (url.endsWith('/api/projects/project-open-gripper-demo/analysis-jobs/pre-solver-runs')) {
        return Response.json(backendJob, { status: 202 });
      }
      return new Response('Not found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    const runButton = await screen.findByRole('button', { name: /Run pre-solver screening for Base pedestal plate/i });
    await user.click(runButton);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/api/projects/project-open-gripper-demo/analysis-jobs/pre-solver-runs',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(await screen.findByText(/Local pre-solver job completed/i)).toBeInTheDocument();
    expect(screen.getByText(/Local pre-solver screening package, not FEA/i)).toBeInTheDocument();
    expect(screen.getByText(/demo pre solver not fea/i)).toBeInTheDocument();
  });

  it('shows solver-unavailable guidance and generated fixture artifacts', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://api.test');
    const user = userEvent.setup();
    const solverReadiness = {
      status: 'solver_unavailable',
      generated_at: '2026-09-05T00:00:00Z',
      tool_statuses: [{
        adapter_name: 'calculix-fea-worker',
        open_source_tool: 'CalculiX',
        role: 'Run static structural solve.',
        binary_candidates: ['ccx', 'calculix'],
        resolved_command: null,
        availability: 'unavailable',
        review_status: 'unavailable_review_required',
        message: 'CalculiX command was not found locally.',
        required_for_real_run: true,
        install_guidance: 'Install CalculiX and make ccx available on PATH.',
        version_command: [],
        detected_version: null,
      }],
      available_tools: [],
      missing_tools: ['CalculiX'],
      execution_modes: [{
        id: 'calculix_fixture',
        label: 'CalculiX deterministic fixture run',
        status: 'solver_unavailable',
        summary: 'Runs a generated one-element CalculiX static structural fixture when installed.',
        required_tools: ['CalculiX'],
        missing_tools: ['CalculiX'],
        review_required: ['Fixture output is not project FEA.'],
        endpoints: ['/api/projects/{project_id}/analysis-jobs/solver-readiness-runs'],
      }],
      install_guidance: ['Install CalculiX and make ccx available on PATH.'],
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
        kind: 'fea_summary',
        title: 'CalculiX solver fixture prepared, solver unavailable',
        summary: 'Generated input deck only.',
        payload: {
          file_manifest: [
            { name: 'mechaflow_static_fixture.inp', path: '/tmp/mechaflow_static_fixture.inp', bytes: 742 },
            { name: 'mechaflow_static_fixture.dat', path: '/tmp/mechaflow_static_fixture.dat', missing: true },
          ],
        },
        confidence: 'unknown_or_needs_review',
        generated_by: 'local-calculix-fixture-runner',
      }],
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/metadata')) return Response.json(mockBackendMetadata);
      if (url.endsWith('/api/projects/project-open-gripper-demo/panel-data')) return Response.json(mockProjectPanelData);
      if (url.endsWith('/api/local-analysis/solver-readiness')) return Response.json(solverReadiness);
      if (url.endsWith('/api/projects/project-open-gripper-demo/analysis-jobs/solver-readiness-runs')) {
        return Response.json(backendJob, { status: 202 });
      }
      return new Response('Not found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    expect(await screen.findByText(/CalculiX command was not found locally/i)).toBeInTheDocument();
    const runButton = await screen.findByRole('button', { name: /Run solver-readiness fixture for Base pedestal plate/i });
    await user.click(runButton);

    expect(await screen.findByText(/Solver-readiness fixture prepared input artifacts/i)).toBeInTheDocument();
    expect(screen.getByText(/CalculiX solver fixture prepared, solver unavailable/i)).toBeInTheDocument();
    expect(screen.getAllByText(/solver unavailable/i).length).toBeGreaterThan(0);
  });

  it('renders explicit BOM prices and totals as ranges', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://api.test');
    const panelData = structuredClone(mockProjectPanelData);
    panelData.bom_items = panelData.bom_items.map((item) => ({
      ...item,
      price: {
        currency: 'USD',
        min: 0.1,
        max: 0.2,
        confidence: 'estimated_from_heuristic',
      },
    }));
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/metadata')) return Response.json(mockBackendMetadata);
      if (url.endsWith('/api/projects/project-open-gripper-demo/panel-data')) return Response.json(panelData);
      return new Response('Not found', { status: 404 });
    }));

    render(<App />);

    expect(await screen.findByRole('heading', { name: '$1.37-$2.74 open estimate' })).toBeInTheDocument();
    expect(screen.getAllByText(/\$0\.10-\$0\.20 each/i)).toHaveLength(16);
  });

  it('keeps unsupported safety estimates review-required for a selected part', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://api.test');
    const user = userEvent.setup();
    const panelData = structuredClone(mockProjectPanelData);
    panelData.project.active_task!.target_value = 50;
    panelData.project.active_task!.safety_factor_min = 2;
    const finger = panelData.project.assemblies[0]!.parts.find((part) => part.id === 'part-finger-link')!;
    finger.dimensions.thickness_mm = 16.5;
    panelData.project.materials.find((material) => material.id === finger.material_id)!.family = 'other';
    panelData.project.materials.find((material) => material.id === 'mat-low-carbon-steel')!.family = 'other';
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/metadata')) return Response.json(mockBackendMetadata);
      if (url.endsWith('/api/projects/project-open-gripper-demo/panel-data')) return Response.json(panelData);
      return new Response('Not found', { status: 404 });
    }));

    render(<App />);
    const partTree = await screen.findByText('Selectable parts');
    const treeContainer = partTree.closest('.part-tree');
    expect(treeContainer).not.toBeNull();
    await user.click(within(treeContainer as HTMLElement).getByRole('button', { name: /Parallel gripper jaw link/i }));

    expect(await screen.findByText(/Payload rating review required/i)).toBeInTheDocument();
    expect(screen.queryByText(/2\.0 safety factor below the preserved 2\.0 minimum/i)).not.toBeInTheDocument();
  });

  it('renders missing backend engineering values as review-required', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://api.test');
    const panelData = structuredClone(mockProjectPanelData);
    const nonPayloadTask = {
      ...panelData.project.active_task!,
      kind: 'reach',
      target_value: 0.6,
      unit: 'm',
    };
    panelData.project.active_task = nonPayloadTask;
    panelData.project.reference_design_id = 'ref-custom-design';
    panelData.task_requirements = [nonPayloadTask];
    const firstPart = panelData.project.assemblies[0]!.parts[0]!;
    firstPart.mass_kg = null;
    const currentMaterial = panelData.project.materials.find((material) => material.id === firstPart.material_id)!;
    currentMaterial.cost = null;
    panelData.manufacturing_options[0]!.options[0]!.cost!.currency = 'credits';
    panelData.wiring_routes = panelData.wiring_routes.map((route) => ({ ...route, bend_radius_min_mm: null }));
    panelData.project.analysis_jobs = [
      {
        ...panelData.project.analysis_jobs[0]!,
        status: 'failed',
        result_summary: { message: 'Waiting for an adapter.' },
      },
    ];
    panelData.bom_items = [{ ...panelData.bom_items[0]!, price: null, lead_time_days_min: null, lead_time_days_max: null }];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/metadata')) return Response.json(mockBackendMetadata);
      if (url.endsWith('/api/projects/project-open-gripper-demo/panel-data')) return Response.json(panelData);
      return new Response('Not found', { status: 404 });
    }));

    render(<App />);

    expect(await screen.findByLabelText(/Preserved task/i)).toHaveTextContent('payload unknown');
    expect(screen.getByText(/Data source: backend panel data/i)).toBeInTheDocument();
    const referencePanel = screen.getByText('Reference design').closest('aside');
    expect(referencePanel).not.toBeNull();
    expect(within(referencePanel as HTMLElement).getAllByText('Review required')).toHaveLength(3);
    expect(within(referencePanel as HTMLElement).queryByRole('link', { name: /Open catalog entry/i })).not.toBeInTheDocument();
    const inspectorPanel = screen.getByText('Part inspector').closest('aside');
    expect(inspectorPanel).not.toBeNull();
    expect(within(inspectorPanel as HTMLElement).getAllByText('Review required').length).toBeGreaterThanOrEqual(2);
    const stressRisk = within(inspectorPanel as HTMLElement).getByText('Stress risk (demo heuristic)').closest('div');
    expect(stressRisk).toHaveTextContent('Review required');
    expect(screen.getByLabelText(/Import Design progress unknown/i)).toBeInTheDocument();
    expect(screen.getByText(/^failed$/i)).toBeInTheDocument();
    expect(screen.getAllByText(/cost review required/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/lead time review required/i)).toBeInTheDocument();
    expect(screen.getByText(/Bend radius review required/i)).toBeInTheDocument();
    expect(screen.getByText(/Payload rating review required/i)).toBeInTheDocument();
  });

  it('renders a loaded project with no parts as an explicit review state', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://api.test');
    const panelData = structuredClone(mockProjectPanelData);
    panelData.project.name = 'Empty project';
    panelData.project.assemblies = [];
    panelData.manufacturing_options = [];
    panelData.bom_items = [];
    panelData.wiring_routes = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/metadata')) return Response.json(mockBackendMetadata);
      if (url.endsWith('/api/projects/project-open-gripper-demo/panel-data')) return Response.json(panelData);
      return new Response('Not found', { status: 404 });
    }));

    render(<App />);

    expect(await screen.findByRole('heading', { name: /Assembly review required/i })).toBeInTheDocument();
    expect(screen.getByText(/Empty project has no selectable parts/i)).toBeInTheDocument();
    expect(screen.getByText(/Data source: backend panel data/i)).toBeInTheDocument();
    expect(screen.queryByText(/Loading MechaFlow cockpit/i)).not.toBeInTheDocument();
  });

  it('defaults past empty assemblies and lets the user select another populated assembly', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://api.test');
    const user = userEvent.setup();
    const panelData = structuredClone(mockProjectPanelData);
    const sourceAssembly = panelData.project.assemblies[0]!;
    const finger = sourceAssembly.parts.find((part) => part.id === 'part-finger-link')!;
    const controller = sourceAssembly.parts.find((part) => part.id === 'part-controller-pcb')!;
    panelData.project.assemblies = [
      { ...structuredClone(sourceAssembly), id: 'assembly-empty', name: 'Empty assembly', parts: [] },
      { ...structuredClone(sourceAssembly), id: 'assembly-finger', name: 'Finger assembly', parts: [finger] },
      { ...structuredClone(sourceAssembly), id: 'assembly-controller', name: 'Controller assembly', parts: [controller] },
    ];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/metadata')) return Response.json(mockBackendMetadata);
      if (url.endsWith('/api/projects/project-open-gripper-demo/panel-data')) return Response.json(panelData);
      return new Response('Not found', { status: 404 });
    }));

    render(<App />);

    expect(await screen.findByRole('heading', { name: /^Parallel gripper jaw link$/i })).toBeInTheDocument();
    const assemblySelector = screen.getByLabelText(/^Assembly$/i);
    expect(within(assemblySelector).queryByRole('option', { name: /Empty assembly/i })).not.toBeInTheDocument();

    await user.selectOptions(assemblySelector, 'assembly-controller');

    expect(screen.getByRole('heading', { name: /^Controller PCB placeholder$/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^Controller assembly$/i })).toBeInTheDocument();
  });
});
