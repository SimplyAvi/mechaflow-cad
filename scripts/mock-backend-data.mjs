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
    'analysis_readiness',
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
    { name: 'local-pre-solver-runner', status: 'local_prototype' },
    { name: 'freecad-fea-prep-worker', status: 'stubbed' },
    { name: 'gmsh-meshing-worker', status: 'stubbed' },
    { name: 'calculix-fea-worker', status: 'stubbed' },
    { name: 'kicad-electronics-worker', status: 'stubbed' },
    { name: 'wireviz-harness-worker', status: 'stubbed' },
    { name: 'supplier-options-worker', status: 'stubbed' },
  ],
};

export const mockTaskRequirements = mockBackendPanelData.task_requirements;

export const mockReferenceDesigns = [
  {
    id: 'ref-open-gripper-demo',
    name: 'MechaFlow robot arm visual MVP demo',
    source_url: 'https://github.com/SimplyAvi/mechaflow-cad',
    license: 'MIT',
    supported_file_formats: ['step', 'freecad', 'gltf'],
    cad_files: ['robot-arm-demo.step', 'robot-arm-demo.FCStd'],
    assembly_files: ['robot-arm-assembly.json'],
    drawings: ['upper-arm-link.pdf', 'wrist-tool-plate.pdf'],
    bom_items: [
      {
        id: 'bom-m4-shoulder',
        part_id: null,
        name: 'M4 shoulder screw',
        quantity: 4,
        unit: 'each',
        supplier: null,
        supplier_part_number: null,
        price: null,
        datasheet_url: null,
        license_or_terms: null,
      },
      {
        id: 'bom-m4-locknut',
        part_id: null,
        name: 'M4 locknut',
        quantity: 4,
        unit: 'each',
        supplier: null,
        supplier_part_number: null,
        price: null,
        datasheet_url: null,
        license_or_terms: null,
      },
    ],
    electronics_files: ['arm-controller-placeholder.kicad_pcb'],
    manufacturing_notes: ['Use as an API shape example until a real permissively licensed arm design is imported.'],
    known_limitations: ['No geometry file is bundled in this repository yet.', 'Analysis results are advisory stub data, not FEA.'],
    example_tasks: mockTaskRequirements,
    source: {
      label: 'MechaFlow CAD repository',
      url: 'https://github.com/SimplyAvi/mechaflow-cad',
      license: 'MIT',
    },
  },
];

export const mockCatalogSeed = {
  reference_designs: mockReferenceDesigns,
  materials: mockBackendPanelData.project.materials,
  task_requirements: mockTaskRequirements,
  sample_project: mockBackendPanelData.project,
};
