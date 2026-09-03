import { readFileSync } from 'node:fs';

export const mockBackendPanelData = JSON.parse(
  readFileSync(new URL('../src/data/backendPanelData.json', import.meta.url), 'utf8'),
);

export const mockBackendMetadata = {
  product: 'MechaFlow CAD',
  version: '0.1.0-local-mock',
  api_prefix: '/api',
  concepts: [
    'projects',
    'reference_designs',
    'assemblies',
    'parts',
    'materials',
    'task_requirements',
    'analysis_jobs',
    'manufacturing_options',
    'wiring_routes',
    'reports',
  ],
  advisory_notice: 'Engineering checks are estimates until validated by qualified review and real analysis workers.',
  local_development: {
    api_host_env: 'MECHAFLOW_API_HOST or BACKEND_HOST',
    api_port_env: 'MECHAFLOW_API_PORT or BACKEND_PORT',
    frontend_port_env: 'MECHAFLOW_FRONTEND_PORT or FRONTEND_PORT',
    find_free_port_command: 'npm run ports:find',
  },
  integration_stubs: [
    { name: 'freecad-worker', status: 'stubbed' },
    { name: 'calculix-fea-worker', status: 'stubbed' },
    { name: 'wireviz-harness-worker', status: 'stubbed' },
    { name: 'supplier-options-worker', status: 'stubbed' },
  ],
};

export const mockTaskRequirements = [
  mockBackendPanelData.project.active_task,
  {
    id: 'task-reach-envelope',
    kind: 'reach',
    description: 'Reach the target work envelope without changing the wrist interface.',
    target_value: 0.6,
    unit: 'm',
    safety_factor_min: null,
    validation_method: 'heuristic',
    assumptions: [],
  },
  {
    id: 'task-wire-clearance',
    kind: 'wiring_clearance',
    description: 'Maintain wiring clearance and bend radius through the gripper assembly.',
    target_value: 2,
    unit: 'mm',
    safety_factor_min: null,
    validation_method: 'review',
    assumptions: [],
  },
  {
    id: 'task-manufacturing-substitution',
    kind: 'serviceability',
    description: 'Compare manufacturing substitutions without losing service access.',
    target_value: null,
    unit: null,
    safety_factor_min: null,
    validation_method: 'review',
    assumptions: [],
  },
];

export const mockReferenceDesigns = [
  {
    id: 'ref-open-gripper-demo',
    name: 'Open robotics gripper starter',
    source_url: 'https://github.com/mechaflow-cad/example-open-gripper',
    license: 'MIT placeholder for demo metadata',
    supported_file_formats: ['step', 'freecad', 'gltf'],
    cad_files: ['gripper.step', 'gripper.FCStd'],
    assembly_files: ['assembly.json'],
    drawings: ['finger-link.pdf'],
    bom_items: mockBackendPanelData.bom_items,
    electronics_files: ['finger-sensor.kicad_pcb'],
    manufacturing_notes: ['Use as an API shape example until a real permissively licensed design is imported.'],
    known_limitations: ['No geometry file is bundled in this repository yet.', 'Analysis results are advisory stub data.'],
    example_tasks: mockTaskRequirements,
  },
];

export const mockCatalogSeed = {
  reference_designs: mockReferenceDesigns,
  materials: mockBackendPanelData.project.materials,
  task_requirements: mockTaskRequirements,
  sample_project: mockBackendPanelData.project,
};
