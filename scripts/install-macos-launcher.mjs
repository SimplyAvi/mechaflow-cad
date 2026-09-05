#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultTarget = path.join(os.homedir(), 'Desktop', 'MechaFlow CAD.command');
const target = process.env.MECHAFLOW_DESKTOP_LAUNCHER
  ? path.resolve(process.env.MECHAFLOW_DESKTOP_LAUNCHER)
  : defaultTarget;

const shellQuote = (value) => `'${value.replaceAll("'", "'\\''")}'`;

const launcher = `#!/bin/zsh
set -euo pipefail
cd ${shellQuote(repoRoot)}
echo "Starting MechaFlow CAD from ${repoRoot}"
if ! command -v npm >/dev/null 2>&1; then
  echo "npm was not found. Install Node.js first, then double-click this launcher again."
  exit 1
fi
if [ ! -d node_modules ]; then
  echo "Installing MechaFlow CAD npm dependencies with npm ci..."
  npm ci
fi
npm start
`;

fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, launcher, { mode: 0o755 });
fs.chmodSync(target, 0o755);

console.log(`Installed MechaFlow CAD launcher at ${target}`);
console.log('Double-click it from Finder to start the local desktop demo.');
