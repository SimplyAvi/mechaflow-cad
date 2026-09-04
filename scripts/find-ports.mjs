#!/usr/bin/env node
import { getFreePorts } from './port-utils.mjs';

const host = process.env.MECHAFLOW_FRONTEND_HOST || process.env.FRONTEND_HOST || process.env.MECHAFLOW_API_HOST || process.env.BACKEND_HOST || '127.0.0.1';
const count = Number(process.env.PORT_COUNT || 2);

if (!Number.isInteger(count) || count < 1 || count > 20) {
  throw new Error('PORT_COUNT must be an integer from 1 to 20.');
}

const ports = await getFreePorts(count, host);

console.log(`Suggested unused ports on ${host}: ${ports.join(', ')}`);
if (ports.length > 1) {
  console.log(`Example: MECHAFLOW_API_PORT=${ports[0]} MECHAFLOW_FRONTEND_PORT=${ports[1]} npm run dev:full`);
} else {
  console.log(`Example: MECHAFLOW_API_PORT=${ports[0]} npm run mock:api`);
}
