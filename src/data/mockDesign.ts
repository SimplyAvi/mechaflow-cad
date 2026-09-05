import backendPanelData from './backendPanelData.json';
import { mapProjectPanelDataToReferenceDesign } from '../lib/backendMapper';
import type { BackendApiMetadata, BackendProjectPanelData } from '../types';

export const mockBackendMetadata: BackendApiMetadata = {
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
    api_host_env: 'MECHAFLOW_API_HOST or BACKEND_HOST for the Node mock API',
    api_port_env: 'MECHAFLOW_API_PORT or BACKEND_PORT for local API ports',
    frontend_port_env: 'MECHAFLOW_FRONTEND_PORT, FRONTEND_PORT, or PORT',
  },
  integration_stubs: [
    { name: 'freecad-worker', status: 'stubbed' },
    { name: 'freecad-fea-prep-worker', status: 'stubbed' },
    { name: 'gmsh-meshing-worker', status: 'stubbed' },
    { name: 'calculix-fea-worker', status: 'stubbed' },
    { name: 'kicad-electronics-worker', status: 'stubbed' },
    { name: 'wireviz-harness-worker', status: 'stubbed' },
    { name: 'supplier-options-worker', status: 'stubbed' },
  ],
};

export const mockProjectPanelData = backendPanelData as BackendProjectPanelData;
export const mockReferenceDesign = mapProjectPanelDataToReferenceDesign(mockProjectPanelData, mockBackendMetadata);
