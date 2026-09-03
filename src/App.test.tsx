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

    expect(await screen.findByRole('heading', { name: /Robot CAD orchestration cockpit/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Preserved task/i)).toHaveTextContent('50 lb');
    expect(screen.getByRole('img', { name: /Mock exploded view/i })).toBeInTheDocument();
    expect(screen.getByText(/Background analysis status/i)).toBeInTheDocument();
    expect(screen.getByText(/BOM and cost/i)).toBeInTheDocument();
    expect(screen.getByText(/Wiring awareness/i)).toBeInTheDocument();
    expect(screen.getByText(/Backend handoff mirrored/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Advisory edit report/i).length).toBeGreaterThan(0);
  });

  it('updates capability impact and backend modification preview when a material substitution is selected', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '');
    const user = userEvent.setup();

    render(<App />);

    expect(await screen.findByRole('heading', { name: /^Finger link$/i })).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText(/Preview option/i), 'part-finger-link-mat-carbon-fiber-nylon');

    expect(screen.getAllByText(/Fails the preserved 50 lb task/i).length).toBeGreaterThan(0);
    expect(screen.getByLabelText(/Backend modification preview/i)).toHaveTextContent('/api/projects/project-open-gripper-demo/modifications');
    expect(screen.getByText(/mat-carbon-fiber-nylon/i)).toBeInTheDocument();
  });

  it('selects a different part from the assembly and shows its wiring context', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '');
    const user = userEvent.setup();

    render(<App />);

    const partTree = await screen.findByText('Selectable parts');
    const treeContainer = partTree.closest('.part-tree');
    expect(treeContainer).not.toBeNull();

    await user.click(within(treeContainer as HTMLElement).getByRole('button', { name: /Palm plate/i }));

    expect(screen.getByRole('heading', { name: /Palm plate/i })).toBeInTheDocument();
    expect(screen.getByText(/Main palm harness/i)).toBeInTheDocument();
    expect(screen.queryByText(/Finger force sensor lead/i)).not.toBeInTheDocument();
    expect(screen.getByText(/service loop review required/i)).toBeInTheDocument();
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
});
