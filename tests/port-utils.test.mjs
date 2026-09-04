import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { getFreePorts } from '../scripts/port-utils.mjs';

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
});
