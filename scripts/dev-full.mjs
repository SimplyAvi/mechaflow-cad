#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { getFreePort, parsePort } from './port-utils.mjs';

const frontendHost = process.env.MECHAFLOW_FRONTEND_HOST || process.env.FRONTEND_HOST || '127.0.0.1';
const backendHost = process.env.MECHAFLOW_API_HOST || process.env.BACKEND_HOST || '127.0.0.1';
const backendPort = parsePort(
  process.env.MECHAFLOW_API_PORT || process.env.BACKEND_PORT || process.env.API_PORT,
  'MECHAFLOW_API_PORT',
) ?? (await getFreePort(backendHost));
const frontendPort = parsePort(
  process.env.MECHAFLOW_FRONTEND_PORT || process.env.FRONTEND_PORT || process.env.PORT,
  'MECHAFLOW_FRONTEND_PORT',
) ?? (await getFreePort(frontendHost, [backendPort]));
const apiBaseUrl = `http://${backendHost}:${backendPort}`;

console.log('Starting MechaFlow CAD local stack with explicit ports:');
console.log(`  backend:  ${apiBaseUrl}`);
console.log(`  frontend: http://${frontendHost}:${frontendPort}`);
console.log('Override with MECHAFLOW_API_PORT and MECHAFLOW_FRONTEND_PORT, or run npm run ports:find first.');

const children = [];

const start = (name, command, args, env) => {
  const child = spawn(command, args, {
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(child);
  child.stdout.on('data', (chunk) => process.stdout.write(`[${name}] ${chunk}`));
  child.stderr.on('data', (chunk) => process.stderr.write(`[${name}] ${chunk}`));
  child.on('exit', (code, signal) => {
    if (code !== 0 && signal !== 'SIGTERM') {
      console.error(`[${name}] exited with code ${code ?? signal}`);
      shutdown(code ?? 1);
    }
  });
};

const shutdown = (code = 0) => {
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(code), 150);
};

start('api', process.execPath, ['scripts/mock-backend.mjs'], {
  BACKEND_HOST: backendHost,
  MECHAFLOW_API_HOST: backendHost,
  BACKEND_PORT: String(backendPort),
  MECHAFLOW_API_PORT: String(backendPort),
});

start('web', 'npx', ['vite', '--host', frontendHost, '--port', String(frontendPort), '--strictPort'], {
  FRONTEND_HOST: frontendHost,
  MECHAFLOW_FRONTEND_HOST: frontendHost,
  FRONTEND_PORT: String(frontendPort),
  MECHAFLOW_FRONTEND_PORT: String(frontendPort),
  VITE_API_BASE_URL: apiBaseUrl,
});

process.on('SIGTERM', () => shutdown(0));
process.on('SIGINT', () => shutdown(0));
