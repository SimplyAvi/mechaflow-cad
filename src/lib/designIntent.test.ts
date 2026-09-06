import { describe, expect, it } from 'vitest';
import { extractDesignIntentChips, extractPayloadLb } from './designIntent';

describe('design intent payload extraction', () => {
  it('accepts payload labels before or after the quantity', () => {
    expect(extractPayloadLb('payload 12 lb')).toBe(12);
    expect(extractPayloadLb('50 lb payload')).toBe(50);
    expect(extractDesignIntentChips('50 lb payload')).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'Payload 50 lb' }),
    ]));
  });
});
