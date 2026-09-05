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
    expect(screen.getByText(/Background analysis status/i)).toBeInTheDocument();
    expect(screen.getByText(/BOM and cost/i)).toBeInTheDocument();
    expect(screen.getByText(/Wiring awareness/i)).toBeInTheDocument();
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

    await user.selectOptions(optionSelector, 'part-finger-link-mat-carbon-fiber-nylon');

    expect(
      screen.getAllByText(/Material-only preview has no worker-supplied payload rating/i).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText(/Payload rating review required/i)).toBeInTheDocument();
    expect(screen.getByText(/Process cost:/i)).toHaveTextContent('$3-$12');
    expect(screen.getByLabelText(/Backend modification preview/i)).toHaveTextContent(
      '/api/projects/project-open-gripper-demo/modifications',
    );
    expect(screen.getByLabelText(/Backend modification preview/i)).toHaveTextContent('"dimension_changes": {}');
    expect(screen.getByText(/mat-carbon-fiber-nylon/i)).toBeInTheDocument();
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
    expect(screen.getByText(/Main arm harness/i)).toBeInTheDocument();
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

    expect(await screen.findByRole('heading', { name: '$0.80-$1.60 open estimate' })).toBeInTheDocument();
    expect(screen.getAllByText(/\$0\.10-\$0\.20 each/i)).toHaveLength(8);
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
    panelData.bom_items = [{ ...panelData.bom_items[0]!, price: null }];
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
