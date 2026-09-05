import { describe, expect, it } from 'vitest';
import net from 'node:net';
import { execFileSync } from 'node:child_process';
import { assertPortAvailable, getFreePorts, resolvePortPair } from '../scripts/port-utils.mjs';

describe('port utilities', () => {
  it('allocates distinct ports as one reservation set', async () => {
    const ports = await getFreePorts(8);

    expect(new Set(ports).size).toBe(ports.length);
  });

  it('does not suggest a two-server command from one port', () => {
    const output = execFileSync(process.execPath, ['scripts/find-ports.mjs'], {
      cwd: process.cwd(),
      env: { ...process.env, PORT_COUNT: '1' },
      encoding: 'utf8',
    });

    expect(output).toContain('npm run mock:api');
    expect(output).not.toContain('npm run dev:full');
  });

  it('keeps mixed configured and automatic ports distinct across hosts', async () => {
    const ports = await resolvePortPair({
      backendHost: '0.0.0.0',
      frontendHost: '127.0.0.1',
      frontendPort: 7332,
    });

    expect(ports.frontendPort).toBe(7332);
    expect(ports.backendPort).not.toBe(ports.frontendPort);
  });

  it('rejects equal configured ports', async () => {
    await expect(resolvePortPair({ backendPort: 7332, frontendPort: 7332 }))
      .rejects.toThrow(/must be different/i);
  });

  it('reports occupied configured ports before orchestration starts', async () => {
    const server = net.createServer();
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();

    try {
      await expect(assertPortAvailable(port, '127.0.0.1'))
        .rejects.toThrow(`Port ${port} is not available on 127.0.0.1`);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
