#!/usr/bin/env node
import http from 'node:http';
import { mockBackendDesign } from './mock-backend-data.mjs';
import { getFreePort, parsePort } from './port-utils.mjs';

const host = process.env.BACKEND_HOST || '127.0.0.1';
const configuredPort = parsePort(process.env.BACKEND_PORT || process.env.API_PORT, 'BACKEND_PORT');
const port = configuredPort ?? (await getFreePort(host));

const sendJson = (response, statusCode, payload) => {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
  });
  response.end(body);
};

const server = http.createServer((request, response) => {
  if (!request.url) {
    sendJson(response, 400, { error: 'Missing URL' });
    return;
  }

  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, OPTIONS',
      'access-control-allow-headers': 'content-type',
    });
    response.end();
    return;
  }

  const url = new URL(request.url, `http://${host}:${port}`);

  if (request.method === 'GET' && url.pathname === '/health') {
    sendJson(response, 200, { ok: true, service: 'mechaflow-cad-mock-api' });
    return;
  }

  if (request.method === 'GET' && url.pathname === `/api/reference-designs/${mockBackendDesign.id}`) {
    sendJson(response, 200, mockBackendDesign);
    return;
  }

  sendJson(response, 404, { error: 'Not found' });
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Mock backend could not start because ${host}:${port} is already in use.`);
    console.error('Pick another port with BACKEND_PORT or run npm run ports:find.');
  } else {
    console.error(error);
  }
  process.exit(1);
});

server.listen(port, host, () => {
  console.log(`Mock MechaFlow CAD API listening at http://${host}:${port}`);
  console.log(`Use VITE_API_BASE_URL=http://${host}:${port} when starting the frontend.`);
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT', () => server.close(() => process.exit(0)));
