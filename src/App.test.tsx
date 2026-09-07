import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { mockBackendMetadata, mockProjectPanelData } from './data/mockDesign';

describe('MechaFlow input-first cockpit', () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('launches into a simple 3D-first workspace with prompt, sidebars, and no advanced wall', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '');

    render(<App />);

    expect(await screen.findByRole('heading', { name: /Author a visual robot or machine on the XYZ grid/i })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Visual CAD authoring canvas/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Describe what you want to design/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /New from prompt/i })).toBeInTheDocument();
    expect(screen.getByText(/Open local project/i)).toBeInTheDocument();
    expect(screen.getByText(/Ready examples/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Project and example browser/i)).toHaveTextContent(/Model tree/i);
    expect(screen.getByLabelText(/Selected-part properties and context tools/i)).toHaveTextContent(/Context inspector/i);
    expect(screen.getByLabelText(/Active task/i)).toHaveTextContent('50 lb payload, 8 s cycle, 0.65 m reach');
    expect(screen.getByText(/Reference only. No photo-to-CAD reconstruction/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Canvas CAD tool palette/i)).toHaveTextContent(/Tool plate/i);
    expect(screen.getByLabelText(/Selected part detail card/i)).toHaveTextContent(/Selected actual part/i);
    expect(screen.getByLabelText(/Selected part detail card/i)).toHaveTextContent(/Task criteria and thresholds/i);
    expect(screen.getByLabelText(/Visual CAD primitive palette/i)).toHaveTextContent(/Motor/i);
    expect(screen.getByLabelText(/Selected geometry inspector/i)).toHaveTextContent(/Rotation Z/i);
    expect(screen.getByLabelText(/Assembly and wiring authoring/i)).toHaveTextContent(/Route visible wire/i);
    expect(screen.queryByText(/Analysis job queue/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/BOM and cost/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/MVP coverage guide/i)).not.toBeInTheDocument();
  });

  it('authors units, primitives, dimensions, assembly links, and visible wiring locally', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '');
    const user = userEvent.setup();

    render(<App />);

    expect(await screen.findByRole('img', { name: /Visual CAD authoring canvas/i })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText(/Project authoring units/i), 'in');
    expect(await screen.findByText(/Project units changed to inches/i)).toBeInTheDocument();

    await user.click(within(screen.getByLabelText(/Visual CAD primitive palette/i)).getByRole('button', { name: /^Motor$/i }));
    expect(await screen.findByText(/Created motor block primitive/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Selected geometry inspector/i)).toHaveTextContent(/motor block/i);

    const labelInput = screen.getByLabelText(/Selected part label/i);
    await user.clear(labelInput);
    await user.type(labelInput, 'Wrist motor layout proxy');
    await user.tab();
    expect(await screen.findByText(/label changed to Wrist motor layout proxy/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Selected part detail card/i)).toHaveTextContent(/Wrist motor layout proxy/i);

    const lengthInput = screen.getByLabelText(/length in in/i);
    await user.clear(lengthInput);
    await user.type(lengthInput, '6');
    expect(await screen.findByText(/length set to 6 in/i)).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText(/Selected part parent/i), 'part-palm-plate');
    expect(await screen.findByText(/connected to Base pedestal plate/i)).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText(/Selected part joint type/i), 'revolute');
    expect(await screen.findByText(/revolute joint marker/i)).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText(/Wire route target part/i), 'part-palm-plate');
    await user.click(screen.getByRole('button', { name: /Route visible wire/i }));
    expect(await screen.findByText(/Created visible wire route/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Visible wire routes/i)).toHaveTextContent(/Wrist motor layout proxy/i);
  });

  it('matches an unknown part description locally and focuses the authored assembly handoff', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '');
    const user = userEvent.setup();

    render(<App />);

    expect(await screen.findByRole('img', { name: /Visual CAD authoring canvas/i })).toBeInTheDocument();
    await user.click(within(screen.getByLabelText(/Visual CAD primitive palette/i)).getByRole('button', { name: /^Motor$/i }));
    expect(await screen.findByText(/Created motor block primitive/i)).toBeInTheDocument();

    const catalogPanel = screen.getByLabelText(/Catalog matching for unknown part names/i);
    await user.clear(within(catalogPanel).getByLabelText(/Plain-language part label or description/i));
    await user.type(within(catalogPanel).getByLabelText(/Plain-language part label or description/i), '80 mm shoulder joint motor');

    expect(within(catalogPanel).getAllByText(/Shoulder servo actuator/i).length).toBeGreaterThan(0);
    expect(within(catalogPanel).getByText(/Bolts beside the shoulder yoke/i)).toBeInTheDocument();
    await user.click(within(catalogPanel).getByRole('button', { name: /Apply to selected part/i }));

    expect(await screen.findByText(/Matched "80 mm shoulder joint motor" to Integrated 80 mm shoulder servo actuator/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Selected part detail card/i)).toHaveTextContent(/Local catalog match: Integrated 80 mm shoulder servo actuator/i);
    expect(screen.getByLabelText(/Selected part detail card/i)).toHaveTextContent(/Assembly link/i);

    await user.click(screen.getByRole('button', { name: /Focus selected/i }));
    expect(await screen.findByText(/is in focus: nearby parts are dimmed/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Clear focus/i })).toHaveAttribute('aria-pressed', 'true');
  });

  it('guides an approximate sleeve description into a rendered assembly placement', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '');
    const user = userEvent.setup();

    render(<App />);

    expect(await screen.findByLabelText(/Guided visual part authoring flow/i)).toBeInTheDocument();
    const studio = screen.getByLabelText(/Guided visual part authoring flow/i);
    expect(studio).toHaveTextContent(/Sketch profile/i);
    expect(studio).toHaveTextContent(/Cut diagonal slots/i);

    const query = within(studio).getByLabelText(/What part do you want to author/i);
    await user.clear(query);
    await user.type(query, 'round arm connector');
    expect(within(studio).getAllByText(/Lightened joint sleeve coupler with diagonal slots/i).length).toBeGreaterThan(0);

    await user.click(within(studio).getByRole('button', { name: /Place matched part in assembly/i }));

    expect(await screen.findByText(/Guided flow placed Lightened joint sleeve coupler with diagonal slots/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Selected part detail card/i)).toHaveTextContent(/Sketch recipe: Sketch, extrude, slot-cut, chamfer sleeve/i);
    expect(screen.getByLabelText(/Selected part detail card/i)).toHaveTextContent(/Local catalog match: Lightened joint sleeve coupler with diagonal slots/i);
    expect(screen.getByLabelText(/Selected part detail card/i)).toHaveTextContent(/Assembly link/i);
  });

  it('captures typed design intent into structured chips and starts a prompt concept honestly', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '');
    const user = userEvent.setup();

    render(<App />);

    const input = await screen.findByPlaceholderText(/Describe what you want to design/i);
    await user.type(input, 'Design a compact gripper for 12 kg payload, 0.4 m reach, 5 s cycle, aluminum body, avoid cloud compute, keep wiring serviceable.');

    const chips = screen.getByLabelText(/Extracted design intent chips/i);
    expect(chips).toHaveTextContent(/Payload 26.5 lb/i);
    expect(chips).toHaveTextContent(/Reach 0.4 m/i);
    expect(chips).toHaveTextContent(/Cycle 5 s/i);
    expect(chips).toHaveTextContent(/Material aluminum/i);
    expect(chips).toHaveTextContent(/Constraint noted/i);
    expect(chips).toHaveTextContent(/Restriction noted/i);

    await user.click(screen.getByRole('button', { name: /^Start design$/i }));

    expect(await screen.findByText(/Started a concept workspace from your prompt/i)).toBeInTheDocument();
    expect(screen.getAllByText(/New mechanism concept from prompt/i).length).toBeGreaterThan(0);
    expect(screen.getByLabelText(/Active task/i)).toHaveTextContent('26.5 lb payload, 5 s cycle, 0.4 m reach');
    expect(screen.getByText(/not generated parametric CAD or photo reconstruction/i)).toBeInTheDocument();
  });

  it('adds reference image metadata and falls back cleanly when speech is unavailable', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '');
    const user = userEvent.setup();

    render(<App />);

    await user.upload(
      await screen.findByLabelText(/Upload reference images/i),
      new File(['reference'], 'wrist-reference.png', { type: 'image/png' }),
    );

    expect(await screen.findByText('wrist-reference.png')).toBeInTheDocument();
    expect(screen.getByLabelText(/Imported reference image metadata/i)).toHaveTextContent(/session metadata only/i);
    expect(screen.getByText(/no photo-to-CAD reconstruction is running/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Speak$/i }));
    expect(await screen.findByText(/Voice input uses browser-native speech recognition when available/i)).toBeInTheDocument();
  });

  it('loads ready local examples without ambiguous external CAD assets', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '');
    const user = userEvent.setup();

    render(<App />);

    const gantryCard = (await screen.findByText(/Compact pick-and-place gantry concept/i)).closest('article');
    expect(gantryCard).not.toBeNull();
    expect(within(gantryCard as HTMLElement).getByText(/no external CAD asset imported/i)).toBeInTheDocument();
    await user.click(within(gantryCard as HTMLElement).getByRole('button', { name: /Load/i }));

    expect(await screen.findByText(/Compact gantry proxy assembly/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Describe what you want to design/i)).toHaveValue('Design a compact pick-and-place gantry for 8 lb payload, 0.45 m travel, 3 s cycle, aluminum frame, local-only analysis.');
    expect(screen.getByLabelText(/Active task/i)).toHaveTextContent('8 lb payload, 3 s cycle, 0.45 m reach');
    expect(screen.getByText(/repository-local and does not import external CAD assets/i)).toBeInTheDocument();
  });

  it('reopens the most recently saved local project and reports when history is empty', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '');
    const user = userEvent.setup();

    render(<App />);
    await screen.findByRole('img', { name: /Visual CAD authoring canvas/i });
    const gantryCard = screen.getByText(/Compact pick-and-place gantry concept/i).closest('article');
    expect(gantryCard).not.toBeNull();
    await user.click(within(gantryCard as HTMLElement).getByRole('button', { name: /Load/i }));
    await screen.findByText(/Compact gantry proxy assembly/i);

    await user.click(screen.getByRole('button', { name: /Recent project/i }));
    expect(await screen.findByText(/Reopened Compact pick-and-place gantry concept from local recent-project history/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Describe what you want to design/i)).toHaveValue(
      'Design a compact pick-and-place gantry for 8 lb payload, 0.45 m travel, 3 s cycle, aluminum frame, local-only analysis.',
    );

    cleanup();
    window.localStorage.clear();
    render(<App />);
    await screen.findByRole('img', { name: /Visual CAD authoring canvas/i });
    await user.click(screen.getByRole('button', { name: /Recent project/i }));
    expect(await screen.findByText(/No saved recent project is available/i)).toBeInTheDocument();
  });

  it('keeps advanced MVP tools behind mode switches after launch', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '');
    const user = userEvent.setup();

    render(<App />);

    expect(await screen.findByRole('img', { name: /Visual CAD authoring canvas/i })).toBeInTheDocument();
    expect(screen.queryByText(/Analysis job queue/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Analysis$/i }));
    expect(await screen.findByText(/Analysis job queue/i)).toBeInTheDocument();
    expect(screen.getByText(/Local-first orchestration and cached reports/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Manufacturing$/i }));
    expect(await screen.findByText(/BOM and cost/i)).toBeInTheDocument();
    expect(screen.getByText(/Wiring and electronics/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Reports$/i }));
    expect(await screen.findByLabelText(/Project file import and export/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/MVP coverage guide/i)).toHaveTextContent(/Progressive tool coverage/i);

    await user.click(screen.getByRole('button', { name: /^Backend$/i }));
    expect(await screen.findByText(/Ready for API handoff/i)).toBeInTheDocument();
  });

  it('selects a part and exposes material substitution as contextual design tooling', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '');
    const user = userEvent.setup();

    render(<App />);

    await user.click(await screen.findByRole('button', { name: /Select Upper arm link geometry/i }));
    expect(screen.getByLabelText(/Selected part detail card/i)).toHaveTextContent(/Upper arm link/i);
    expect(screen.getByLabelText(/Selected part detail card/i)).toHaveTextContent(/Why this material or process is here/i);
    expect(screen.getByLabelText(/Selected part detail card/i)).toHaveTextContent(/Payload: 50 lb preserved task/i);

    const partTree = await screen.findByText('Selectable parts');
    const treeContainer = partTree.closest('.part-tree');
    expect(treeContainer).not.toBeNull();
    await user.click(within(treeContainer as HTMLElement).getByRole('button', { name: /Parallel gripper jaw link/i }));

    expect(screen.getByRole('heading', { name: /^Parallel gripper jaw link$/i })).toBeInTheDocument();
    await user.click(screen.getByText(/Design and material tools/i));
    const optionSelector = screen.getByLabelText(/Preview option/i);
    expect(within(optionSelector).queryByRole('option', { name: /FR-4/i })).not.toBeInTheDocument();

    await user.selectOptions(optionSelector, 'part-finger-link-mat-carbon-fiber-nylon-additive_fdm');

    expect(screen.getAllByText(/Material and process substitution preview has no worker-supplied payload rating/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Payload rating review required/i)).toBeInTheDocument();
    expect(screen.getByText(/Cost range/i).closest('div')).toHaveTextContent('$3-$12');
    expect(screen.getAllByText(/1-3 days/i).length).toBeGreaterThan(0);
    expect(screen.getByLabelText(/Backend modification preview/i)).toHaveTextContent(
      '/api/projects/project-open-gripper-demo/material-substitutions/preview then /apply',
    );
  });

  it('previews then applies a backend material substitution while advanced panels stay mode-scoped', async () => {
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
      if (url.endsWith('/api/local-analysis/solver-readiness')) {
        return Response.json({ status: 'review_required', summary: 'Solver state unavailable.', tool_statuses: [], available_tools: [], missing_tools: [], execution_modes: [], install_guidance: [] });
      }
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
    await user.click(screen.getByText(/Design and material tools/i));
    await user.selectOptions(
      screen.getByLabelText(/Preview option/i),
      'part-finger-link-mat-carbon-fiber-nylon-additive_fdm',
    );

    expect(screen.queryByText(/BOM and cost preview/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Preview backend impact/i }));

    expect(await screen.findByText(/Preview only: BOM, manufacturing, readiness, and reports below show projected effects/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Manufacturing$/i }));
    expect(screen.getByText(/BOM and cost preview/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '$581.60-$1,761.46 open estimate' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Apply validated substitution/i })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: /Apply validated substitution/i }));

    expect(await screen.findByText(/Applied substitution to the backend project/i)).toBeInTheDocument();
    expect(screen.queryByText(/BOM and cost preview/i)).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '$581.60-$1,761.46 open estimate' })).toBeInTheDocument();
  });

  it('imports a portable project file from the project browser and keeps data interactive', async () => {
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

    expect(await screen.findByRole('heading', { name: /Author a visual robot or machine/i })).toBeInTheDocument();
    await user.upload(
      screen.getByLabelText(/Open existing MechaFlow project file/i),
      new File([JSON.stringify(projectFile)], 'demo.mfcad.json', { type: 'application/json' }),
    );

    expect(await screen.findByText(/Opened Imported robot arm project from demo.mfcad.json/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Imported robot arm project/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Visual model:/i)).toHaveTextContent(/units mm/i);
    await user.click(screen.getByRole('button', { name: /^Analysis$/i }));
    expect(await screen.findByText(/Prior project solver state/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Manufacturing$/i }));
    expect(screen.getByText(/Wiring and electronics/i)).toBeInTheDocument();
  });

  it('shows an understandable project-file error for invalid local JSON', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://api.test');
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/metadata')) return Response.json(mockBackendMetadata);
      if (url.endsWith('/api/projects/project-open-gripper-demo/panel-data')) return Response.json(mockProjectPanelData);
      if (url.endsWith('/api/local-analysis/solver-readiness')) {
        return Response.json({ status: 'review_required', summary: 'Solver state unavailable.', tool_statuses: [], available_tools: [], missing_tools: [], execution_modes: [], install_guidance: [] });
      }
      return new Response('Not found', { status: 404 });
    }));

    render(<App />);

    expect(await screen.findByLabelText(/Open existing MechaFlow project file/i)).toBeInTheDocument();
    await user.upload(
      screen.getByLabelText(/Open existing MechaFlow project file/i),
      new File(['not json'], 'broken.mfcad.json', { type: 'application/json' }),
    );

    expect(await screen.findByText(/Project import failed: file is not valid JSON/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Robot arm with catalog-matched servo actuator demo/i).length).toBeGreaterThan(0);
  });

  it('renders queue recommendations, planning estimates, and cached artifact links in analysis mode', async () => {
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
      if (url.endsWith('/api/local-analysis/solver-readiness')) {
        return Response.json({ status: 'review_required', summary: 'Solver state unavailable.', tool_statuses: [], available_tools: [], missing_tools: [], execution_modes: [], install_guidance: [] });
      }
      return new Response('Not found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    render(<App />);

    await user.click(await screen.findByRole('button', { name: /^Analysis$/i }));
    expect(await screen.findByText(/cloud planning is recommended only after configuration/i)).toBeInTheDocument();
    expect(screen.getByText(/cloud recommended when configured/i)).toBeInTheDocument();
    expect(screen.getByText(/Planning estimate only. This is not real billing/i)).toBeInTheDocument();
    expect(screen.getByText(/Missing local tools: FreeCAD/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Download cached artifact/i })).toHaveAttribute(
      'href',
      'http://api.test/api/analysis-artifacts/artifact-cad-metadata/metadata.json',
    );
  });

  it('triggers a backend local pre-solver run from the analysis mode', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://api.test');
    const user = userEvent.setup();
    const backendJob = {
      id: 'job-local-presolver',
      job_type: 'run_fea',
      status: 'completed',
      target_id: 'part-base-plate',
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
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/metadata')) return Response.json(mockBackendMetadata);
      if (url.endsWith('/api/projects/project-open-gripper-demo/panel-data')) return Response.json(mockProjectPanelData);
      if (url.endsWith('/api/local-analysis/solver-readiness')) {
        return Response.json({ status: 'review_required', summary: 'Solver state unavailable.', tool_statuses: [], available_tools: [], missing_tools: [], execution_modes: [], install_guidance: [] });
      }
      if (url.endsWith('/api/projects/project-open-gripper-demo/analysis-jobs/pre-solver-runs')) {
        return Response.json(backendJob, { status: 202 });
      }
      return new Response('Not found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    await user.click(await screen.findByRole('button', { name: /^Analysis$/i }));
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

  it('shows solver-unavailable guidance and generated fixture artifacts in analysis mode', async () => {
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
      target_id: 'part-base-plate',
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

    await user.click(await screen.findByRole('button', { name: /^Analysis$/i }));
    expect(await screen.findByText(/CalculiX command was not found locally/i)).toBeInTheDocument();
    const runButton = await screen.findByRole('button', { name: /Run solver-readiness fixture for Base pedestal plate/i });
    await user.click(runButton);

    expect(await screen.findByText(/Solver-readiness fixture prepared input artifacts/i)).toBeInTheDocument();
    expect(screen.getByText(/CalculiX solver fixture prepared, solver unavailable/i)).toBeInTheDocument();
    expect(screen.getAllByText(/solver unavailable/i).length).toBeGreaterThan(0);
  });

  it('renders explicit BOM prices and totals as ranges only after manufacturing mode opens', async () => {
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
      if (url.endsWith('/api/local-analysis/solver-readiness')) {
        return Response.json({ status: 'review_required', summary: 'Solver state unavailable.', tool_statuses: [], available_tools: [], missing_tools: [], execution_modes: [], install_guidance: [] });
      }
      return new Response('Not found', { status: 404 });
    }));
    const user = userEvent.setup();

    render(<App />);

    expect(await screen.findByRole('heading', { name: /Author a visual robot or machine/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '$1.57-$3.14 open estimate' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Manufacturing$/i }));
    expect(await screen.findByRole('heading', { name: '$1.57-$3.14 open estimate' })).toBeInTheDocument();
    expect(screen.getAllByText(/\$0\.10-\$0\.20 each/i)).toHaveLength(18);
  });

  it('renders missing backend engineering values as review-required inside contextual modes', async () => {
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
      if (url.endsWith('/api/local-analysis/solver-readiness')) {
        return Response.json({ status: 'review_required', summary: 'Solver state unavailable.', tool_statuses: [], available_tools: [], missing_tools: [], execution_modes: [], install_guidance: [] });
      }
      return new Response('Not found', { status: 404 });
    }));
    const user = userEvent.setup();

    render(<App />);

    expect(await screen.findByLabelText(/Active task/i)).toHaveTextContent('payload unknown');
    expect(screen.getByText(/Data source: backend panel data/i)).toBeInTheDocument();
    const inspectorPanel = screen.getByLabelText(/Selected-part properties and context tools/i);
    expect(within(inspectorPanel).getAllByText('Review required').length).toBeGreaterThanOrEqual(1);
    expect(within(inspectorPanel).getByText('Stress risk')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Analysis$/i }));
    expect(await screen.findByText(/^failed$/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Manufacturing$/i }));
    expect((await screen.findAllByText(/cost review required/i)).length).toBeGreaterThan(0);
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
      if (url.endsWith('/api/local-analysis/solver-readiness')) {
        return Response.json({ status: 'review_required', summary: 'Solver state unavailable.', tool_statuses: [], available_tools: [], missing_tools: [], execution_modes: [], install_guidance: [] });
      }
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
