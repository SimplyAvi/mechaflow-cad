#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const result = spawnSync(process.execPath, ['scripts/desktop-dev.mjs'], {
  env: { ...process.env, MECHAFLOW_DESKTOP_SMOKE: '1' },
  encoding: 'utf8',
  timeout: 60_000,
});

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.error) throw result.error;
if (result.status !== 0) {
  throw new Error(`Desktop launcher smoke failed with exit code ${result.status}.`);
}

console.log('Desktop launcher smoke passed.');
