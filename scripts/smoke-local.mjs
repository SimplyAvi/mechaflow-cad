#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { parsePort, resolvePortPair } from './port-utils.mjs';

const host = process.env.FRONTEND_HOST || process.env.BACKEND_HOST || process.env.MECHAFLOW_API_HOST || '127.0.0.1';
const configuredBackendPort = parsePort(
  process.env.BACKEND_PORT || process.env.MECHAFLOW_API_PORT,
  'BACKEND_PORT',
);
const configuredFrontendPort = parsePort(
  process.env.FRONTEND_PORT || process.env.MECHAFLOW_FRONTEND_PORT,
  'FRONTEND_PORT',
);
const { backendPort, frontendPort } = await resolvePortPair({
  backendHost: host,
  frontendHost: host,
  backendPort: configuredBackendPort,
  frontendPort: configuredFrontendPort,
});
const apiBaseUrl = `http://${host}:${backendPort}`;
const frontendUrl = `http://${host}:${frontendPort}`;
const children = [];

const spawnChild = (name, command, args, env = {}) => {
  const child = spawn(command, args, {
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(child);
  child.stdout.on('data', (chunk) => process.stdout.write(`[${name}] ${chunk}`));
  child.stderr.on('data', (chunk) => process.stderr.write(`[${name}] ${chunk}`));
  return child;
};

const waitForJson = async (url, attempts = 50) => {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
      lastError = new Error(`${url} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw lastError;
};

const waitForText = async (url, attempts = 50) => {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.text();
      lastError = new Error(`${url} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw lastError;
};

const waitForDom = async (document, attempts = 50) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const source = [...document.querySelectorAll('.task-card small')].find((node) =>
      node.textContent?.includes('Data source:'),
    );
    if (source?.textContent?.includes('backend panel data')) return source.textContent;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error('Built frontend did not render data from the configured backend.');
};

const shutdown = () => {
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
};

try {
  console.log(`Smoke test using backend ${apiBaseUrl} and frontend ${frontendUrl}`);
  spawnChild('api', process.execPath, ['scripts/mock-backend.mjs'], {
    BACKEND_HOST: host,
    BACKEND_PORT: String(backendPort),
    MECHAFLOW_CORS_ORIGINS: frontendUrl,
  });
  await waitForJson(`${apiBaseUrl}/health`);

  const allowedCorsResponse = await fetch(`${apiBaseUrl}/health`, {
    headers: { Origin: frontendUrl },
  });
  const blockedCorsResponse = await fetch(`${apiBaseUrl}/health`, {
    headers: { Origin: 'https://foreign.example' },
  });
  const allowedPreflightResponse = await fetch(
    `${apiBaseUrl}/api/projects/sample/modifications`,
    {
      method: 'OPTIONS',
      headers: {
        Origin: frontendUrl,
        'Access-Control-Request-Method': 'POST',
      },
    },
  );
  const blockedPreflightResponse = await fetch(
    `${apiBaseUrl}/api/projects/sample/modifications`,
    {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://foreign.example',
        'Access-Control-Request-Method': 'POST',
      },
    },
  );
  if (
    allowedCorsResponse.headers.get('access-control-allow-origin') !== frontendUrl
    || allowedPreflightResponse.headers.get('access-control-allow-origin') !== frontendUrl
    || blockedCorsResponse.headers.has('access-control-allow-origin')
    || blockedPreflightResponse.headers.has('access-control-allow-origin')
  ) {
    throw new Error('Mock backend did not restrict CORS to the configured frontend origin.');
  }

  const metadata = await waitForJson(`${apiBaseUrl}/api/metadata`);
  if (!metadata.concepts.includes('projects') || !metadata.concepts.includes('wiring_routes')) {
    throw new Error('Mock backend metadata did not expose expected concepts.');
  }
  if (!metadata.integration_stubs.some((stub) => stub.name === 'kicad-electronics-worker')) {
    throw new Error('Mock backend metadata omitted the KiCad integration stub.');
  }

  const panelData = await waitForJson(`${apiBaseUrl}/api/projects/sample/panel-data`);
  if (panelData.project.id !== 'project-open-gripper-demo') {
    throw new Error('Mock backend did not return the expected project panel data.');
  }
  if (panelData.wiring_routes[0].id !== 'route-finger-sensor') {
    throw new Error('Mock backend did not return wiring panel data.');
  }
  const exportedProjectFile = await waitForJson(`${apiBaseUrl}/api/projects/${panelData.project.id}/export-file`);
  if (
    exportedProjectFile.format !== 'mechaflow-cad.project'
    || exportedProjectFile.schema_version !== '1.0'
    || exportedProjectFile.project.assemblies.length !== panelData.project.assemblies.length
    || exportedProjectFile.project.materials.length !== panelData.project.materials.length
    || exportedProjectFile.analysis_readiness_previews.length === 0
  ) {
    throw new Error('Mock backend project file export did not preserve MVP project data.');
  }
  const invalidProjectFile = await fetch(`${apiBaseUrl}/api/projects/import-file`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ format: 'step', schema_version: '1.0', project: panelData.project }),
  });
  if (invalidProjectFile.status !== 422) {
    throw new Error('Mock backend accepted an unsupported project file format.');
  }
  const importedProjectFile = await fetch(`${apiBaseUrl}/api/projects/import-file`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(exportedProjectFile),
  });
  if (!importedProjectFile.ok) {
    throw new Error(`Mock backend rejected an exported project file with ${importedProjectFile.status}.`);
  }
  const importedPayload = await importedProjectFile.json();
  if (
    importedPayload.project.id !== panelData.project.id
    || importedPayload.panel_data.project.assemblies[0].parts.length !== panelData.project.assemblies[0].parts.length
    || importedPayload.panel_data.wiring_routes[0].id !== 'route-finger-sensor'
  ) {
    throw new Error('Mock backend project file import lost assembly, part, or wiring data.');
  }
  const referenceDesigns = await waitForJson(`${apiBaseUrl}/api/reference-designs`);
  const demoReference = referenceDesigns.find((design) => design.id === 'ref-open-gripper-demo');
  if (
    demoReference?.source_url !== 'https://github.com/SimplyAvi/mechaflow-cad'
    || demoReference.license !== 'MIT'
  ) {
    throw new Error('Mock backend did not return the canonical demo reference identity.');
  }
  if (demoReference.bom_items.map((item) => item.id).join(',') !== 'bom-m4-shoulder,bom-m4-locknut') {
    throw new Error('Mock backend reference-design BOM diverged from the FastAPI seed.');
  }
  const originalPalm = panelData.project.assemblies.flatMap((assembly) => assembly.parts)
    .find((part) => part.id === 'part-palm-plate');
  const originalModificationCount = panelData.project.modifications.length;
  const foreignSimpleMutation = await fetch(
    `${apiBaseUrl}/api/projects/${panelData.project.id}/modifications`,
    {
      method: 'POST',
      headers: { Origin: 'https://foreign.example', 'content-type': 'text/plain' },
      body: JSON.stringify({
        id: 'smoke-foreign-mutation',
        target_part_id: originalPalm.id,
        description: 'Reject a foreign simple-request mutation.',
        dimension_changes: { thickness_mm: originalPalm.dimensions.thickness_mm + 1 },
      }),
    },
  );
  const allowedNonJsonMutation = await fetch(
    `${apiBaseUrl}/api/projects/${panelData.project.id}/modifications`,
    {
      method: 'POST',
      headers: { Origin: frontendUrl, 'content-type': 'text/plain' },
      body: JSON.stringify({
        id: 'smoke-non-json-mutation',
        target_part_id: originalPalm.id,
        description: 'Reject a non-JSON mutation body.',
        dimension_changes: { thickness_mm: originalPalm.dimensions.thickness_mm + 1 },
      }),
    },
  );
  const projectAfterBlockedMutations = await waitForJson(
    `${apiBaseUrl}/api/projects/${panelData.project.id}`,
  );
  const palmAfterBlockedMutations = projectAfterBlockedMutations.assemblies
    .flatMap((assembly) => assembly.parts)
    .find((part) => part.id === originalPalm.id);
  if (
    foreignSimpleMutation.status !== 403
    || allowedNonJsonMutation.status !== 415
    || palmAfterBlockedMutations?.dimensions.thickness_mm !== originalPalm.dimensions.thickness_mm
    || projectAfterBlockedMutations.modifications.length !== originalModificationCount
  ) {
    throw new Error('Mock backend allowed a blocked mutation request to change project state.');
  }
  const initialFinger = panelData.project.assemblies.flatMap((assembly) => assembly.parts)
    .find((part) => part.id === 'part-finger-link');
  const idempotentModification = await fetch(
    `${apiBaseUrl}/api/projects/${panelData.project.id}/modifications`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: 'smoke-idempotent-finger',
        target_part_id: initialFinger.id,
        description: 'Resubmit the current finger material and thickness.',
        material_id: initialFinger.material_id,
        dimension_changes: { thickness_mm: initialFinger.dimensions.thickness_mm },
      }),
    },
  );
  if (!idempotentModification.ok) {
    throw new Error(`Mock backend rejected an idempotent modification with ${idempotentModification.status}.`);
  }
  const idempotentPayload = await idempotentModification.json();
  const idempotentFinger = idempotentPayload.project.assemblies.flatMap((assembly) => assembly.parts)
    .find((part) => part.id === initialFinger.id);
  if (
    idempotentFinger?.mass_kg !== initialFinger.mass_kg
    || idempotentPayload.report.unknowns.some((item) => item.toLowerCase().includes('mass properties'))
    || idempotentPayload.report.recommendations.some((item) => item.toLowerCase().includes('mass properties'))
  ) {
    throw new Error('Mock backend treated an idempotent modification as a mass-changing edit.');
  }
  const incompatibleModification = await fetch(`${apiBaseUrl}/api/projects/${panelData.project.id}/modifications`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: 'smoke-incompatible-material',
      target_part_id: 'part-controller-pcb',
      description: 'Reject an incompatible local material preview.',
      material_id: 'mat-aluminum-6061-t6',
      manufacturing_process: 'cnc_machining',
    }),
  });
  if (incompatibleModification.status !== 422) {
    throw new Error('Mock backend accepted an incompatible part material and process.');
  }
  const invalidModifications = [
    {
      payload: {
        id: 'smoke-blank-material',
        target_part_id: 'part-finger-link',
        description: 'Reject a blank material id.',
        material_id: '',
      },
      failure: 'a blank material id',
    },
    {
      payload: {
        id: 'smoke-missing-description',
        target_part_id: 'part-finger-link',
      },
      failure: 'missing required modification fields',
    },
    {
      payload: {
        id: 'smoke-negative-dimension',
        target_part_id: 'part-finger-link',
        description: 'Reject a negative dimension.',
        dimension_changes: { thickness_mm: -1 },
      },
      failure: 'a negative dimension',
    },
    {
      payload: {
        id: 'smoke-unsupported-dimension',
        target_part_id: 'part-finger-link',
        description: 'Reject an unsupported dimension.',
        dimension_changes: { diameter_mm: 10 },
      },
      failure: 'an unsupported dimension',
    },
    {
      payload: {
        id: 'smoke-misspelled-dimension',
        target_part_id: 'part-finger-link',
        description: 'Reject a misspelled dimension field.',
        dimension_change: { thickness_mm: 10 },
      },
      failure: 'an unknown modification field',
    },
  ];
  for (const invalidModification of invalidModifications) {
    const response = await fetch(`${apiBaseUrl}/api/projects/${panelData.project.id}/modifications`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(invalidModification.payload),
    });
    if (response.status !== 422) {
      throw new Error(`Mock backend accepted ${invalidModification.failure}.`);
    }
  }
  const projectAfterRejectedModifications = await waitForJson(
    `${apiBaseUrl}/api/projects/${panelData.project.id}`,
  );
  const unchangedFinger = projectAfterRejectedModifications.assemblies.flatMap((assembly) => assembly.parts)
    .find((part) => part.id === 'part-finger-link');
  const originalFinger = panelData.project.assemblies.flatMap((assembly) => assembly.parts)
    .find((part) => part.id === 'part-finger-link');
  if (unchangedFinger?.dimensions.thickness_mm !== originalFinger?.dimensions.thickness_mm) {
    throw new Error('Mock backend mutated project state after rejecting invalid modifications.');
  }
  const compatibleModification = await fetch(`${apiBaseUrl}/api/projects/${panelData.project.id}/modifications`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: 'smoke-compatible-material',
      target_part_id: 'part-finger-link',
      description: 'Persist a compatible local material preview.',
      material_id: 'mat-carbon-fiber-nylon',
      dimension_changes: { thickness_mm: 9 },
      manufacturing_process: 'additive_fdm',
    }),
  });
  if (!compatibleModification.ok) {
    throw new Error(`Mock backend rejected a compatible modification with ${compatibleModification.status}.`);
  }
  const modifiedProject = (await compatibleModification.json()).project;
  const modifiedPart = modifiedProject.assemblies.flatMap((assembly) => assembly.parts)
    .find((part) => part.id === 'part-finger-link');
  const storedProject = await waitForJson(`${apiBaseUrl}/api/projects/${panelData.project.id}`);
  const storedPart = storedProject.assemblies.flatMap((assembly) => assembly.parts)
    .find((part) => part.id === 'part-finger-link');
  if (
    modifiedPart?.material_id !== 'mat-carbon-fiber-nylon'
    || modifiedPart?.dimensions.thickness_mm !== 9
    || modifiedPart?.mass_kg !== null
    || storedPart?.material_id !== 'mat-carbon-fiber-nylon'
    || storedPart?.dimensions.thickness_mm !== 9
    || storedPart?.mass_kg !== null
  ) {
    throw new Error('Mock backend did not persist the accepted project modification.');
  }

  await new Promise((resolve, reject) => {
    const build = spawn('npm', ['run', 'build'], {
      env: { ...process.env, VITE_API_BASE_URL: apiBaseUrl },
      stdio: 'inherit',
    });
    build.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`npm run build exited with ${code}`));
    });
  });

  spawnChild('preview', 'npx', ['vite', 'preview', '--host', host, '--port', String(frontendPort), '--strictPort']);
  const html = await waitForText(frontendUrl);
  if (!html.includes('MechaFlow CAD Cockpit')) {
    throw new Error('Frontend preview did not serve the expected app shell.');
  }

  const assetMatch = html.match(/src="(\/assets\/[^\"]+\.js)"/);
  if (!assetMatch) {
    throw new Error('Frontend preview did not expose a built JavaScript asset.');
  }

  const assetText = await readFile(path.join('dist', assetMatch[1].replace(/^\//, '')), 'utf8');
  const dom = new JSDOM(html, { url: frontendUrl, runScripts: 'outside-only', pretendToBeVisual: true });
  dom.window.fetch = globalThis.fetch;
  dom.window.eval(assetText);
  const renderedSource = await waitForDom(dom.window.document);
  if (!renderedSource.includes('/api/projects/project-open-gripper-demo/panel-data')) {
    throw new Error('Built frontend did not render the expected project panel endpoint.');
  }
  dom.window.close();

  console.log('Smoke test passed: backend health, metadata, project panel API, frontend preview, and configured API URL are wired.');
} finally {
  shutdown();
}
