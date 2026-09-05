#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { getFreePorts } from './port-utils.mjs';

const desktopSmoke = spawnSync(process.execPath, ['scripts/desktop-smoke.mjs'], {
  encoding: 'utf8',
  stdio: 'pipe',
  timeout: 90_000,
});
if (desktopSmoke.stdout) process.stdout.write(desktopSmoke.stdout);
if (desktopSmoke.stderr) process.stderr.write(desktopSmoke.stderr);
if (desktopSmoke.error) throw desktopSmoke.error;
assert.equal(desktopSmoke.status, 0, 'desktop smoke launch must pass');

const [apiPort] = await getFreePorts(1);
const apiBaseUrl = `http://127.0.0.1:${apiPort}`;
const api = spawn(process.execPath, ['scripts/mock-backend.mjs'], {
  env: {
    ...process.env,
    MECHAFLOW_API_PORT: String(apiPort),
    MECHAFLOW_CORS_ORIGINS: 'http://127.0.0.1:5173',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
api.stdout.on('data', (chunk) => { output += String(chunk); });
api.stderr.on('data', (chunk) => { output += String(chunk); });

const stopApi = async () => {
  if (!api.killed) api.kill('SIGTERM');
  await delay(100);
};
process.on('exit', () => {
  if (!api.killed) api.kill('SIGTERM');
});

async function fetchJson(path, init) {
  const response = await fetch(`${apiBaseUrl}${path}`, init);
  const body = await response.text();
  let payload;
  try {
    payload = body ? JSON.parse(body) : null;
  } catch (error) {
    throw new Error(`${path} returned non-JSON ${response.status}: ${body.slice(0, 200)}`);
  }
  assert.ok(response.ok, `${path} returned ${response.status}: ${JSON.stringify(payload)}`);
  return payload;
}

async function waitForApi() {
  let lastError;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      await fetchJson('/health');
      return;
    } catch (error) {
      lastError = error;
      await delay(100);
    }
  }
  throw new Error(`mock backend did not start: ${lastError?.message ?? output}`);
}

try {
  await waitForApi();

  const fixtureText = await fs.readFile('data/captain-demo-project.mfcad.json', 'utf8');
  const fixture = JSON.parse(fixtureText);
  assert.equal(fixture.format, 'mechaflow-cad.project');
  assert.equal(fixture.schema_version, '1.0');
  assert.ok(fixture.project.assemblies[0].parts.length >= 8, 'fixture must include selectable visual parts');
  assert.ok(fixture.project.electronics_components.length >= 1, 'fixture must include electronics components');
  assert.ok(fixture.project.wire_segments.length >= 1, 'fixture must include wire segments');
  assert.ok(fixture.analysis_readiness_previews.length >= fixture.project.assemblies[0].parts.length, 'fixture must include solver-readiness previews');
  assert.ok(fixture.project.analysis_jobs.some((job) => job.artifacts.length > 0), 'fixture must include cached or retained analysis artifacts');

  const importResponse = await fetchJson('/api/projects/import-file', {
    body: JSON.stringify(fixture),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });
  assert.equal(importResponse.status, 'imported');

  const panel = await fetchJson('/api/projects/project-open-gripper-demo/panel-data');
  assert.equal(panel.project.name, fixture.project.name);
  assert.ok(panel.bom_items.length >= 12, 'captain demo must expose BOM items');
  assert.ok(panel.manufacturing_options.length >= 8, 'captain demo must expose manufacturing options');
  assert.ok(panel.wiring_routes.length >= 4, 'captain demo must expose wiring routes');
  assert.ok(panel.wiring_review.summary.includes('heuristic'), 'wiring review must remain honestly labeled as heuristic');
  assert.ok(panel.analysis_job_queue.jobs.length >= 6, 'captain demo must expose job queue entries');
  assert.ok(panel.analysis_job_queue.jobs.some((job) => job.recommendation.cloud_execution_available === false), 'cloud execution must stay unavailable in mock demo');

  const solverReadiness = await fetchJson('/api/local-analysis/solver-readiness');
  assert.ok(solverReadiness.missing_tools.includes('CalculiX'), 'mock solver readiness should show unavailable solver tooling');
  assert.match(solverReadiness.summary, /cannot execute solver tools/i);

  const options = await fetchJson('/api/projects/project-open-gripper-demo/parts/part-finger-link/material-substitutions');
  const compatibleOption = options.find((option) => option.material_id === 'mat-carbon-fiber-nylon' && option.process === 'additive_fdm');
  assert.ok(compatibleOption, 'fixture must exercise material substitution for the gripper jaw link');
  assert.ok(compatibleOption.review_required, 'material substitution must remain review-required');

  const preview = await fetchJson('/api/projects/project-open-gripper-demo/material-substitutions/preview', {
    body: JSON.stringify({
      target_part_id: compatibleOption.part_id,
      material_id: compatibleOption.material_id,
      manufacturing_process: compatibleOption.process,
      description: compatibleOption.modification.description,
      modification_id: compatibleOption.modification.id,
    }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });
  assert.equal(preview.persisted, false, 'preview must not mutate project state');
  assert.match(preview.report.summary, /remain review-required/i);

  const preSolverJob = await fetchJson('/api/projects/project-open-gripper-demo/analysis-jobs/pre-solver-runs', {
    body: JSON.stringify({ target_id: 'part-finger-link' }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });
  assert.match(preSolverJob.artifacts[0].title, /not FEA/i);
  assert.match(preSolverJob.result_summary.message, /not a real FEA result/i);

  const fixtureJob = await fetchJson('/api/projects/project-open-gripper-demo/analysis-jobs/solver-readiness-runs', {
    body: JSON.stringify({ target_id: 'part-finger-link' }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });
  assert.equal(fixtureJob.status, 'solver_unavailable');
  assert.match(fixtureJob.artifacts[0].title, /solver unavailable/i);

  const exported = await fetchJson('/api/projects/project-open-gripper-demo/export-file');
  assert.equal(exported.format, 'mechaflow-cad.project');
  assert.ok(exported.project.analysis_jobs.length >= fixture.project.analysis_jobs.length + 2, 'export should retain new local jobs');
  assert.ok(JSON.stringify(exported).includes('not FEA'), 'exported evidence must preserve honest analysis labels');

  console.log('Captain demo smoke passed: desktop launch, fixture import, material preview, local-safe jobs, solver-unavailable state, and export round trip are verified.');
} finally {
  await stopApi();
}
