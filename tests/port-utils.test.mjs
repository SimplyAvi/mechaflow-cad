import { describe, expect, it } from 'vitest';
import { getFreePorts } from '../scripts/port-utils.mjs';

describe('port utilities', () => {
  it('allocates distinct ports as one reservation set', async () => {
    const ports = await getFreePorts(8);

    expect(new Set(ports).size).toBe(ports.length);
  });
});
