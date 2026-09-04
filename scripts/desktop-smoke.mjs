#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const requiredFiles = ['desktop/main.cjs', 'scripts/desktop-dev.mjs'];
const missing = requiredFiles.filter((file) => !existsSync(file));
if (missing.length > 0) {
  throw new Error(`Missing desktop files: ${missing.join(', ')}`);
}

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
if (packageJson.scripts?.['desktop:dev'] !== 'node scripts/desktop-dev.mjs') {
  throw new Error('package.json must expose npm run desktop:dev.');
}
if (!packageJson.devDependencies?.electron) {
  throw new Error('Electron must be listed as a dev dependency for the local desktop shell.');
}

for (const file of requiredFiles) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    throw new Error(`${file} failed node --check.`);
  }
}

console.log('Desktop shell smoke check passed. Use npm run desktop:dev to open the local app window.');
