#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { getFreePorts } from './port-utils.mjs';

const [backendPort, frontendPort] = await getFreePorts(2);
const appName = 'MechaFlow CAD';

const result = spawnSync(process.execPath, ['scripts/desktop-dev.mjs'], {
  env: {
    ...process.env,
    MECHAFLOW_DESKTOP_APP_NAME: appName,
    MECHAFLOW_DESKTOP_SMOKE: '1',
    MECHAFLOW_API_PORT: String(backendPort),
    MECHAFLOW_FRONTEND_PORT: String(frontendPort),
  },
  encoding: 'utf8',
  timeout: 60_000,
});

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.error) throw result.error;
if (result.signal) {
  throw new Error(`Desktop launcher smoke failed after receiving ${result.signal}.`);
}
if (result.status !== 0) {
  throw new Error(`Desktop launcher smoke failed with exit code ${result.status}.`);
}

const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
const expected = [
  `app:      ${appName}`,
  `backend:  http://127.0.0.1:${backendPort}`,
  `frontend: http://127.0.0.1:${frontendPort}`,
  'desktop: Electron shell loading the frontend URL',
  `${appName} Electron shell loaded http://127.0.0.1:${frontendPort}`,
];

for (const fragment of expected) {
  if (!output.includes(fragment)) {
    throw new Error(`Desktop launcher smoke did not report expected orchestration detail: ${fragment}`);
  }
}

console.log(`Desktop launcher smoke passed for ${appName} on backend ${backendPort} and frontend ${frontendPort}.`);
