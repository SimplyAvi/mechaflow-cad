import net from 'node:net';

export function parsePort(value, name) {
  if (value === undefined || value === '') return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`${name} must be an integer from 1 to 65535. Received '${value}'.`);
  }
  return parsed;
}

function listenOnFreePort(host) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, host, () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Could not determine a free TCP port.')));
        return;
      }
      resolve({ port: address.port, server });
    });
  });
}

const closeServer = (server) => new Promise((resolve) => server.close(resolve));

export async function getFreePorts(count, host = '127.0.0.1', excludedPorts = []) {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error('Port count must be a positive integer.');
  }
  const excluded = new Set(excludedPorts);
  const reservations = [];
  const ports = [];
  try {
    while (ports.length < count) {
      const allocation = await listenOnFreePort(host);
      reservations.push(allocation);
      if (!excluded.has(allocation.port)) {
        ports.push(allocation.port);
        excluded.add(allocation.port);
      }
    }
    return ports;
  } finally {
    await Promise.all(reservations.map(({ server }) => closeServer(server)));
  }
}

export async function getFreePort(host = '127.0.0.1', excludedPorts = []) {
  return (await getFreePorts(1, host, excludedPorts))[0];
}

export async function resolvePortPair({
  backendHost = '127.0.0.1',
  frontendHost = backendHost,
  backendPort: configuredBackendPort,
  frontendPort: configuredFrontendPort,
} = {}) {
  if (configuredBackendPort !== undefined && configuredBackendPort === configuredFrontendPort) {
    throw new Error('Backend and frontend ports must be different.');
  }
  const backendPort = configuredBackendPort
    ?? (await getFreePort(backendHost, configuredFrontendPort === undefined ? [] : [configuredFrontendPort]));
  const frontendPort = configuredFrontendPort ?? (await getFreePort(frontendHost, [backendPort]));
  if (backendPort === frontendPort) {
    throw new Error('Backend and frontend ports must be different.');
  }
  return { backendPort, frontendPort };
}

export function assertPortAvailable(port, host = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', (error) => {
      reject(new Error(`Port ${port} is not available on ${host}: ${error.message}`));
    });
    server.once('listening', () => {
      server.close(() => resolve());
    });
    server.listen(port, host);
  });
}
