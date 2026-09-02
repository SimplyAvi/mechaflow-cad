import net from 'node:net';

export function parsePort(value, name) {
  if (value === undefined || value === '') return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`${name} must be an integer from 1 to 65535. Received '${value}'.`);
  }
  return parsed;
}

export function getFreePort(host = '127.0.0.1') {
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
      const { port } = address;
      server.close(() => resolve(port));
    });
  });
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
