#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { getFreePort } from './port-utils.mjs';

const host = process.env.FRONTEND_HOST || '127.0.0.1';
const backendPort = Number(process.env.BACKEND_PORT) || (await getFreePort(host));
const frontendPort = Number(process.env.FRONTEND_PORT) || (await getFreePort(host));
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
  });
  await waitForJson(`${apiBaseUrl}/health`);

  const backendDesign = await waitForJson(`${apiBaseUrl}/api/reference-designs/gripper-cad-cockpit`);
  if (backendDesign.name !== 'Backend mock open gripper design') {
    throw new Error('Mock backend did not return the expected reference design.');
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

  const assetText = await readFile(path.join('dist', assetMatch[1]), 'utf8');
  if (!assetText.includes(apiBaseUrl)) {
    throw new Error('Built frontend asset does not include the configured backend URL.');
  }

  console.log('Smoke test passed: backend health, design API, frontend preview, and configured API URL are wired.');
} finally {
  shutdown();
}
