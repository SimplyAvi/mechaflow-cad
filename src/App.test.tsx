import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import App from './App';

describe('MechaFlow cockpit', () => {
  it('renders the core open-design workflow with mocked CAD orchestration data', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '');

    render(<App />);

    expect(await screen.findByRole('heading', { name: /Robot CAD orchestration cockpit/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Preserved task/i)).toHaveTextContent('50 lb');
    expect(screen.getByRole('img', { name: /Mock exploded view/i })).toBeInTheDocument();
    expect(screen.getByText(/Background analysis status/i)).toBeInTheDocument();
    expect(screen.getByText(/BOM and cost/i)).toBeInTheDocument();
    expect(screen.getByText(/Wiring awareness/i)).toBeInTheDocument();
  });

  it('updates capability impact when a material substitution is selected', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '');
    const user = userEvent.setup();

    render(<App />);

    const inspector = await screen.findByRole('heading', { name: /Left finger link/i });
    expect(inspector).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText(/Preview option/i), 'nylon-cf-left');

    const capabilityCards = screen.getAllByText(/31 lb projected rating/i);
    expect(capabilityCards.length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Fails the preserved 50 lb task/i).length).toBeGreaterThan(0);
  });

  it('selects a different part from the assembly and shows its wiring context', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '');
    const user = userEvent.setup();

    render(<App />);

    const partTree = await screen.findByText('Selectable parts');
    const treeContainer = partTree.closest('.part-tree');
    expect(treeContainer).not.toBeNull();

    await user.click(within(treeContainer as HTMLElement).getByRole('button', { name: /Robot wrist adapter plate/i }));

    expect(screen.getByRole('heading', { name: /Robot wrist adapter plate/i })).toBeInTheDocument();
    expect(screen.getByText(/Main wrist harness/i)).toBeInTheDocument();
  });
});
