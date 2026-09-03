#!/usr/bin/env node
import { getFreePort } from './port-utils.mjs';

const host = process.env.MECHAFLOW_FRONTEND_HOST || process.env.FRONTEND_HOST || process.env.MECHAFLOW_API_HOST || process.env.BACKEND_HOST || '127.0.0.1';
const count = Number(process.env.PORT_COUNT || 2);

if (!Number.isInteger(count) || count < 1 || count > 20) {
  throw new Error('PORT_COUNT must be an integer from 1 to 20.');
}

const ports = [];
for (let index = 0; index < count; index += 1) {
  ports.push(await getFreePort(host));
}

console.log(`Suggested unused ports on ${host}: ${ports.join(', ')}`);
console.log(`Example: MECHAFLOW_API_PORT=${ports[0]} MECHAFLOW_FRONTEND_PORT=${ports[1] ?? ports[0]} npm run dev:full`);
