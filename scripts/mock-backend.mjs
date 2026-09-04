#!/usr/bin/env node
import http from 'node:http';
import {
  mockBackendMetadata,
  mockBackendPanelData,
  mockCatalogSeed,
  mockReferenceDesigns,
  mockTaskRequirements,
} from './mock-backend-data.mjs';
import { getFreePort, parsePort } from './port-utils.mjs';

const host = process.env.BACKEND_HOST || process.env.MECHAFLOW_API_HOST || '127.0.0.1';
const configuredPort = parsePort(
  process.env.BACKEND_PORT || process.env.MECHAFLOW_API_PORT || process.env.API_PORT,
  'BACKEND_PORT',
);
const port = configuredPort ?? (await getFreePort(host));
const projectId = mockBackendPanelData.project.id;
let project = structuredClone(mockBackendPanelData.project);

const projectManufacturingOptions = () =>
  project.assemblies.flatMap((assembly) =>
    assembly.parts.map((part) => ({
      part_id: part.id,
      part_name: part.name,
      options: part.manufacturing_options,
    })),
  );

const projectPanelData = () => ({
  ...mockBackendPanelData,
  project,
  manufacturing_options: projectManufacturingOptions(),
  reports: project.reports,
});

const sendJson = (response, statusCode, payload) => {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
  });
  response.end(body);
};

const readJsonBody = async (request) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
};

const isProjectPath = (pathname, suffix = '') =>
  pathname === `/api/projects/${projectId}${suffix}` || pathname === `/api/projects/sample${suffix}`;

const server = http.createServer(async (request, response) => {
  try {
    if (!request.url) {
      sendJson(response, 400, { error: 'Missing URL' });
      return;
    }

    if (request.method === 'OPTIONS') {
      response.writeHead(204, {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET, POST, OPTIONS',
        'access-control-allow-headers': 'content-type',
      });
      response.end();
      return;
    }

    const url = new URL(request.url, `http://${host}:${port}`);

    if (request.method === 'GET' && url.pathname === '/health') {
      sendJson(response, 200, {
        status: 'ok',
        service: 'mechaflow-cad-mock-api',
        version: mockBackendMetadata.version,
        environment: 'local-mock',
        local_mode: true,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/metadata') {
      sendJson(response, 200, mockBackendMetadata);
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/catalog/seed') {
      sendJson(response, 200, { ...mockCatalogSeed, materials: project.materials, sample_project: project });
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/reference-designs') {
      sendJson(response, 200, mockReferenceDesigns);
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/materials') {
      sendJson(response, 200, project.materials);
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/task-requirements/sample') {
      sendJson(response, 200, mockTaskRequirements);
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/assemblies/sample') {
      sendJson(response, 200, project.assemblies[0]);
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/projects') {
      sendJson(response, 200, [project]);
      return;
    }

    if (request.method === 'GET' && isProjectPath(url.pathname)) {
      sendJson(response, 200, project);
      return;
    }

    if (request.method === 'GET' && isProjectPath(url.pathname, '/panel-data')) {
      sendJson(response, 200, projectPanelData());
      return;
    }

    if (request.method === 'GET' && isProjectPath(url.pathname, '/task-requirements')) {
      sendJson(response, 200, mockBackendPanelData.task_requirements);
      return;
    }

    if (request.method === 'GET' && isProjectPath(url.pathname, '/bom')) {
      sendJson(response, 200, mockBackendPanelData.bom_items);
      return;
    }

    if (request.method === 'GET' && isProjectPath(url.pathname, '/manufacturing-options')) {
      sendJson(response, 200, projectManufacturingOptions());
      return;
    }

    if (request.method === 'GET' && isProjectPath(url.pathname, '/wiring-routes')) {
      sendJson(response, 200, mockBackendPanelData.wiring_routes);
      return;
    }

    if (request.method === 'GET' && isProjectPath(url.pathname, '/reports')) {
      sendJson(response, 200, project.reports);
      return;
    }

    if (request.method === 'POST' && isProjectPath(url.pathname, '/modifications')) {
      const modification = await readJsonBody(request);
      const parts = project.assemblies.flatMap((assembly) => assembly.parts);
      const part = parts.find((candidate) => candidate.id === modification.target_part_id);
      if (!part) {
        sendJson(response, 404, { error: 'target part not found' });
        return;
      }
      if (modification.material_id || modification.manufacturing_process) {
        const materialId = modification.material_id || part.material_id;
        const material = project.materials.find((candidate) => candidate.id === materialId);
        const partProcesses = new Set(
          part.manufacturing_options.map((option) => option.process).filter((process) => process !== 'unknown'),
        );
        const materialProcesses = material?.compatible_processes.filter((process) => process !== 'unknown') ?? [];
        const compatibleProcesses = materialProcesses.filter((process) => partProcesses.has(process));
        const currentProcess = typeof part.metadata?.preferred_manufacturing_process === 'string'
          ? part.metadata.preferred_manufacturing_process
          : undefined;
        const effectiveProcess = modification.manufacturing_process || currentProcess;
        if (!material) {
          sendJson(response, 422, { error: 'material not found' });
          return;
        }
        if (partProcesses.size === 0 || materialProcesses.length === 0) {
          sendJson(response, 422, { error: 'material and process compatibility requires review' });
          return;
        }
        if (modification.material_id && !effectiveProcess) {
          sendJson(response, 422, { error: 'material changes require an explicit compatible manufacturing process' });
          return;
        }
        if (
          compatibleProcesses.length === 0
          || (effectiveProcess && !compatibleProcesses.includes(effectiveProcess))
        ) {
          sendJson(response, 422, { error: 'material and process are incompatible for this part' });
          return;
        }
      }
      const report = {
        id: `report-${modification.id ?? 'mock-modification'}`,
        project_id: projectId,
        title: 'Advisory edit report from mock backend',
        status: 'requires_review',
        summary: 'Mock backend accepted the local schema edit and would queue CAD, payload, wiring, and supplier workers next.',
        task_results: [{ task_kind: 'lift_payload', status: 'requires_review', method: 'local_schema_update_only' }],
        manufacturing_impacts: ['Preferred process captured from the modification payload.'],
        wiring_impacts: ['Wiring clearance remains advisory until a worker validates geometry.'],
        risks: ['Local edit preview does not modify CAD geometry yet.'],
        unknowns: ['Mass properties and supplier cost are unknown.'],
        recommendations: ['Queue estimate_mass_properties and rerate_payload_capability.'],
        assumptions: ['Mock endpoint mirrors the backend modification contract.'],
        generated_at: new Date().toISOString(),
      };
      const storedModification = {
        created_at: new Date().toISOString(),
        ...modification,
      };
      const updatedAssemblies = project.assemblies.map((assembly) => ({
        ...assembly,
        parts: assembly.parts.map((candidate) => {
          if (candidate.id !== modification.target_part_id) return candidate;
          return {
            ...candidate,
            material_id: modification.material_id ?? candidate.material_id,
            dimensions: {
              ...candidate.dimensions,
              ...(modification.dimension_changes ?? {}),
            },
            metadata: modification.manufacturing_process
              ? {
                  ...candidate.metadata,
                  preferred_manufacturing_process: modification.manufacturing_process,
                }
              : candidate.metadata,
          };
        }),
      }));
      project = {
        ...project,
        assemblies: updatedAssemblies,
        modifications: [...project.modifications, storedModification],
        reports: [...project.reports, report],
        updated_at: new Date().toISOString(),
      };
      sendJson(response, 200, {
        project,
        report,
      });
      return;
    }

    sendJson(response, 404, { error: 'Not found' });
  } catch (error) {
    sendJson(response, 500, { error: error instanceof Error ? error.message : 'Unexpected mock backend error' });
  }
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Mock backend could not start because ${host}:${port} is already in use.`);
    console.error('Pick another port with BACKEND_PORT or run npm run ports:find.');
  } else {
    console.error(error);
  }
  process.exit(1);
});

server.listen(port, host, () => {
  console.log(`Mock MechaFlow CAD API listening at http://${host}:${port}`);
  console.log(`Use VITE_API_BASE_URL=http://${host}:${port} when starting the frontend.`);
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT', () => server.close(() => process.exit(0)));
