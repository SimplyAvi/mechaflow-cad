#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { parsePort, resolvePortPair } from './port-utils.mjs';

const frontendHost = process.env.MECHAFLOW_FRONTEND_HOST || process.env.FRONTEND_HOST || '127.0.0.1';
const backendHost = process.env.MECHAFLOW_API_HOST || process.env.BACKEND_HOST || '127.0.0.1';
const configuredBackendPort = parsePort(
  process.env.MECHAFLOW_API_PORT || process.env.BACKEND_PORT || process.env.API_PORT,
  'MECHAFLOW_API_PORT',
);
const configuredFrontendPort = parsePort(
  process.env.MECHAFLOW_FRONTEND_PORT || process.env.FRONTEND_PORT || process.env.PORT,
  'MECHAFLOW_FRONTEND_PORT',
);
const { backendPort, frontendPort } = await resolvePortPair({
  backendHost,
  frontendHost,
  backendPort: configuredBackendPort,
  frontendPort: configuredFrontendPort,
});
const apiBaseUrl = `http://${backendHost}:${backendPort}`;
const frontendOrigin = `http://${frontendHost}:${frontendPort}`;
const children = [];
let shuttingDown = false;

const waitForUrl = async (url, label) => {
  const deadline = Date.now() + 30_000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = new Error(`${label} returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${label} at ${url}: ${lastError?.message ?? 'not reachable'}`);
};

const shutdown = (code = 0) => {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(code), 200);
};

const start = (name, command, args, env = {}, options = {}) => {
  const child = spawn(command, args, {
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });
  children.push(child);
  child.stdout.on('data', (chunk) => process.stdout.write(`[${name}] ${chunk}`));
  child.stderr.on('data', (chunk) => process.stderr.write(`[${name}] ${chunk}`));
  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    if (name === 'desktop') {
      shutdown(code ?? 0);
      return;
    }
    if (code !== 0 && signal !== 'SIGTERM') {
      console.error(`[${name}] exited with code ${code ?? signal}`);
      shutdown(code ?? 1);
    }
  });
  return child;
};

console.log('Starting MechaFlow CAD desktop demo with local explicit ports:');
console.log(`  backend:  ${apiBaseUrl}`);
console.log(`  frontend: ${frontendOrigin}`);
console.log('  desktop: Electron shell loading the frontend URL');
console.log('Override ports with MECHAFLOW_API_PORT and MECHAFLOW_FRONTEND_PORT.');

start('api', process.execPath, ['scripts/mock-backend.mjs'], {
  BACKEND_HOST: backendHost,
  MECHAFLOW_API_HOST: backendHost,
  BACKEND_PORT: String(backendPort),
  MECHAFLOW_API_PORT: String(backendPort),
  MECHAFLOW_CORS_ORIGINS: process.env.MECHAFLOW_CORS_ORIGINS || frontendOrigin,
});

start('web', 'npx', ['vite', '--host', frontendHost, '--port', String(frontendPort), '--strictPort'], {
  FRONTEND_HOST: frontendHost,
  MECHAFLOW_FRONTEND_HOST: frontendHost,
  FRONTEND_PORT: String(frontendPort),
  MECHAFLOW_FRONTEND_PORT: String(frontendPort),
  VITE_API_BASE_URL: apiBaseUrl,
});

try {
  await waitForUrl(`${apiBaseUrl}/health`, 'mock backend');
  await waitForUrl(frontendOrigin, 'Vite frontend');
  start('desktop', 'npx', ['electron', 'desktop/main.cjs'], {
    MECHAFLOW_DESKTOP_URL: frontendOrigin,
    MECHAFLOW_DESKTOP_SMOKE: process.env.MECHAFLOW_DESKTOP_SMOKE || '0',
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  shutdown(1);
}

process.on('SIGTERM', () => shutdown(0));
process.on('SIGINT', () => shutdown(0));
