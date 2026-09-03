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
      sendJson(response, 200, mockCatalogSeed);
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/reference-designs') {
      sendJson(response, 200, mockReferenceDesigns);
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/materials') {
      sendJson(response, 200, mockBackendPanelData.project.materials);
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/task-requirements/sample') {
      sendJson(response, 200, mockTaskRequirements);
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/assemblies/sample') {
      sendJson(response, 200, mockBackendPanelData.project.assemblies[0]);
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/projects') {
      sendJson(response, 200, [mockBackendPanelData.project]);
      return;
    }

    if (request.method === 'GET' && isProjectPath(url.pathname)) {
      sendJson(response, 200, mockBackendPanelData.project);
      return;
    }

    if (request.method === 'GET' && isProjectPath(url.pathname, '/panel-data')) {
      sendJson(response, 200, mockBackendPanelData);
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
      sendJson(response, 200, mockBackendPanelData.manufacturing_options);
      return;
    }

    if (request.method === 'GET' && isProjectPath(url.pathname, '/wiring-routes')) {
      sendJson(response, 200, mockBackendPanelData.wiring_routes);
      return;
    }

    if (request.method === 'GET' && isProjectPath(url.pathname, '/reports')) {
      sendJson(response, 200, mockBackendPanelData.reports);
      return;
    }

    if (request.method === 'POST' && isProjectPath(url.pathname, '/modifications')) {
      const modification = await readJsonBody(request);
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
      sendJson(response, 200, {
        project: {
          ...mockBackendPanelData.project,
          modifications: [...mockBackendPanelData.project.modifications, modification],
          reports: [...mockBackendPanelData.project.reports, report],
        },
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
