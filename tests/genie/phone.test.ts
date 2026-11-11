import { describe, expect, it } from 'vitest';
import { normalizePhone } from '@/lib/sms/phone';

describe('normalizePhone', () => {
  it('accepts US and Canada numbers with or without +1', () => {
    for (const v of ['2029996431', '202-999-6431', '(202) 999-6431', '202.999.6431', '1 202 999 6431', '12029996431', '+12029996431', '+1 (202) 999-6431'])
      expect(normalizePhone(v)).toBe('+12029996431');
    expect(normalizePhone('416 555 0199')).toBe('+14165550199');
  });
  it('keeps international numbers that start with +', () => {
    expect(normalizePhone('+63 917 123 4567')).toBe('+639171234567');
    expect(normalizePhone('+44 20 7946 0958')).toBe('+442079460958');
  });
  it('rejects numbers that cannot be right', () => {
    for (const v of ['', '555-0123', '0029996431', '1029996431', '+1029996431', '202999643', '22029996431', '+0123', 'abc']) expect(normalizePhone(v)).toBeNull();
  });
});
