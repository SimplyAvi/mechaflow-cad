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
const defaultCorsOrigins = ['http://127.0.0.1:5173', 'http://localhost:5173'];
const configuredCorsOrigins = process.env.MECHAFLOW_CORS_ORIGINS?.trim();
const corsOrigins = new Set(
  (configuredCorsOrigins || defaultCorsOrigins.join(','))
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
);
const projectId = mockBackendPanelData.project.id;
let project = structuredClone(mockBackendPanelData.project);
const editableDimensionFields = new Set(['length_mm', 'width_mm', 'height_mm', 'thickness_mm']);
const modificationFields = new Set([
  'id',
  'target_part_id',
  'description',
  'material_id',
  'dimension_changes',
  'manufacturing_process',
  'created_at',
]);
const manufacturingProcesses = new Set([
  'off_the_shelf',
  'additive_fdm',
  'additive_sls',
  'cnc_machining',
  'sheet_metal',
  'pcb_fabrication',
  'wire_harness',
  'casting',
  'unknown',
]);

const modificationValidationError = (modification) => {
  if (!modification || typeof modification !== 'object' || Array.isArray(modification)) {
    return 'request body must be a modification object';
  }
  const unknownFields = Object.keys(modification).filter((field) => !modificationFields.has(field));
  if (unknownFields.length > 0) return `unsupported modification fields: ${unknownFields.sort().join(', ')}`;
  for (const field of ['id', 'target_part_id', 'description']) {
    if (typeof modification[field] !== 'string') return `${field} is required and must be a string`;
  }
  if (modification.material_id != null && typeof modification.material_id !== 'string') {
    return 'material_id must be a string or null';
  }
  if (typeof modification.material_id === 'string' && !modification.material_id.trim()) {
    return 'material_id must not be blank';
  }
  if (
    modification.manufacturing_process != null
    && !manufacturingProcesses.has(modification.manufacturing_process)
  ) {
    return 'manufacturing_process is invalid';
  }
  if (Object.hasOwn(modification, 'dimension_changes')) {
    const changes = modification.dimension_changes;
    if (!changes || typeof changes !== 'object' || Array.isArray(changes)) {
      return 'dimension_changes must be an object';
    }
    for (const [field, value] of Object.entries(changes)) {
      if (!editableDimensionFields.has(field)) return `dimension_changes contains unsupported field ${field}`;
      if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        return `${field} must be a positive number`;
      }
    }
  }
  return null;
};

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

const isOriginAllowed = (request) => {
  const origin = request.headers.origin;
  return !origin || corsOrigins.has('*') || corsOrigins.has(origin);
};

const corsHeaders = (request) => {
  const origin = request.headers.origin;
  if (!origin) return {};
  if (corsOrigins.has('*')) return { 'access-control-allow-origin': '*' };
  return isOriginAllowed(request)
    ? { 'access-control-allow-origin': origin, vary: 'Origin' }
    : { vary: 'Origin' };
};

const sendJson = (request, response, statusCode, payload) => {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    ...corsHeaders(request),
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
  const send = (statusCode, payload) => sendJson(request, response, statusCode, payload);
  try {
    if (!request.url) {
      send(400, { error: 'Missing URL' });
      return;
    }

    if (request.method === 'OPTIONS') {
      response.writeHead(204, {
        ...corsHeaders(request),
        'access-control-allow-methods': 'GET, POST, OPTIONS',
        'access-control-allow-headers': 'content-type',
      });
      response.end();
      return;
    }

    const url = new URL(request.url, `http://${host}:${port}`);

    if (request.method === 'GET' && url.pathname === '/health') {
      send(200, {
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
      send(200, mockBackendMetadata);
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/catalog/seed') {
      send(200, { ...mockCatalogSeed, materials: project.materials, sample_project: project });
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/reference-designs') {
      send(200, mockReferenceDesigns);
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/materials') {
      send(200, project.materials);
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/task-requirements/sample') {
      send(200, mockTaskRequirements);
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/assemblies/sample') {
      send(200, project.assemblies[0]);
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/projects') {
      send(200, [project]);
      return;
    }

    if (request.method === 'GET' && isProjectPath(url.pathname)) {
      send(200, project);
      return;
    }

    if (request.method === 'GET' && isProjectPath(url.pathname, '/panel-data')) {
      send(200, projectPanelData());
      return;
    }

    if (request.method === 'GET' && isProjectPath(url.pathname, '/task-requirements')) {
      send(200, mockBackendPanelData.task_requirements);
      return;
    }

    if (request.method === 'GET' && isProjectPath(url.pathname, '/bom')) {
      send(200, mockBackendPanelData.bom_items);
      return;
    }

    if (request.method === 'GET' && isProjectPath(url.pathname, '/manufacturing-options')) {
      send(200, projectManufacturingOptions());
      return;
    }

    if (request.method === 'GET' && isProjectPath(url.pathname, '/wiring-routes')) {
      send(200, mockBackendPanelData.wiring_routes);
      return;
    }

    if (request.method === 'GET' && isProjectPath(url.pathname, '/reports')) {
      send(200, project.reports);
      return;
    }

    if (request.method === 'POST' && isProjectPath(url.pathname, '/modifications')) {
      if (!isOriginAllowed(request)) {
        send(403, { error: 'origin is not allowed' });
        return;
      }
      const contentType = request.headers['content-type']?.split(';', 1)[0].trim().toLowerCase();
      if (contentType !== 'application/json') {
        send(415, { error: 'content-type must be application/json' });
        return;
      }
      let modification;
      try {
        modification = await readJsonBody(request);
      } catch {
        send(422, { error: 'request body must contain valid JSON' });
        return;
      }
      const validationError = modificationValidationError(modification);
      if (validationError) {
        send(422, { error: validationError });
        return;
      }
      const parts = project.assemblies.flatMap((assembly) => assembly.parts);
      const part = parts.find((candidate) => candidate.id === modification.target_part_id);
      if (!part) {
        send(404, { error: 'target part not found' });
        return;
      }
      const materialChanged = modification.material_id != null && modification.material_id !== part.material_id;
      if (materialChanged || modification.manufacturing_process) {
        const materialId = modification.material_id ?? part.material_id;
        const material = project.materials.find((candidate) => candidate.id === materialId);
        const partProcesses = new Set(
          part.manufacturing_options.map((option) => option.process).filter((process) => process !== 'unknown'),
        );
        const materialProcesses = material?.compatible_processes.filter((process) => process !== 'unknown') ?? [];
        const compatibleProcesses = materialProcesses.filter((process) => partProcesses.has(process));
        const currentProcess = typeof part.metadata?.preferred_manufacturing_process === 'string'
          ? part.metadata.preferred_manufacturing_process
          : undefined;
        const effectiveProcess = modification.manufacturing_process ?? currentProcess;
        if (!material) {
          send(422, { error: 'material not found' });
          return;
        }
        if (partProcesses.size === 0 || materialProcesses.length === 0) {
          send(422, { error: 'material and process compatibility requires review' });
          return;
        }
        if (materialChanged && !effectiveProcess) {
          send(422, { error: 'material changes require an explicit compatible manufacturing process' });
          return;
        }
        if (
          compatibleProcesses.length === 0
          || (effectiveProcess && !compatibleProcesses.includes(effectiveProcess))
        ) {
          send(422, { error: 'material and process are incompatible for this part' });
          return;
        }
      }
      const dimensionChanges = modification.dimension_changes ?? {};
      const changedDimensionKeys = Object.keys(dimensionChanges).filter(
        (field) => dimensionChanges[field] !== part.dimensions[field],
      );
      const currentProcess = typeof part.metadata?.preferred_manufacturing_process === 'string'
        ? part.metadata.preferred_manufacturing_process
        : undefined;
      const processChanged = modification.manufacturing_process != null
        && modification.manufacturing_process !== currentProcess;
      const massPropertiesChanged = materialChanged || changedDimensionKeys.length > 0;
      const report = {
        id: `report-${modification.id ?? 'mock-modification'}`,
        project_id: projectId,
        title: 'Advisory edit report from mock backend',
        status: 'requires_review',
        summary: massPropertiesChanged
          ? 'Mock backend accepted the local schema edit and would queue CAD, payload, wiring, and supplier workers next.'
          : 'Mock backend accepted the local schema edit without a material or dimension change requiring re-rating.',
        task_results: [{
          task_kind: 'lift_payload',
          status: 'requires_review',
          method: 'local_schema_update_only',
          notes: [
            materialChanged ? `Material changed to ${modification.material_id}.` : 'Material unchanged.',
            changedDimensionKeys.length > 0
              ? `Dimensions changed: ${changedDimensionKeys.sort().join(', ')}.`
              : 'No dimensions changed.',
            processChanged
              ? `Preferred process changed to ${modification.manufacturing_process}.`
              : 'Manufacturing process unchanged.',
          ],
        }],
        manufacturing_impacts: [
          processChanged
            ? `Preferred process changed to ${modification.manufacturing_process}.`
            : 'Manufacturing process unchanged.',
        ],
        wiring_impacts: ['Wiring clearance remains advisory until a worker validates geometry.'],
        risks: [
          'Local edit preview does not modify CAD geometry yet.',
          ...(massPropertiesChanged
            ? ['Strength, payload, and fatigue changes are advisory until CAD and FEA workers validate them.']
            : []),
        ],
        unknowns: [
          ...(massPropertiesChanged
            ? ['Updated mass properties are unknown until a CAD worker recalculates them.']
            : []),
          'Supplier cost and lead time are unknown until a supplier adapter runs.',
        ],
        recommendations: massPropertiesChanged
          ? ['Queue estimate_mass_properties and rerate_payload_capability.']
          : [],
        assumptions: ['Mock endpoint mirrors the backend modification contract.'],
        generated_at: new Date().toISOString(),
      };
      const storedModification = {
        created_at: new Date().toISOString(),
        dimension_changes: {},
        ...modification,
      };
      const updatedAssemblies = project.assemblies.map((assembly) => ({
        ...assembly,
        parts: assembly.parts.map((candidate) => {
          if (candidate.id !== modification.target_part_id) return candidate;
          return {
            ...candidate,
            material_id: modification.material_id ?? candidate.material_id,
            mass_kg: massPropertiesChanged ? null : candidate.mass_kg,
            dimensions: {
              ...candidate.dimensions,
              ...dimensionChanges,
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
      send(200, {
        project,
        report,
      });
      return;
    }

    send(404, { error: 'Not found' });
  } catch (error) {
    send(500, { error: error instanceof Error ? error.message : 'Unexpected mock backend error' });
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
