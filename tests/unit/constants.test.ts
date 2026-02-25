import { describe, it, expect } from 'vitest';
import { FIT_SCORE_THRESHOLD } from '../../constants';

describe('constants', () => {
  it('FIT_SCORE_THRESHOLD is 70', () => {
    expect(FIT_SCORE_THRESHOLD).toBe(70);
  });

  it('FIT_SCORE_THRESHOLD is a number', () => {
    expect(typeof FIT_SCORE_THRESHOLD).toBe('number');
  });

  it('FIT_SCORE_THRESHOLD is in valid range (0-100)', () => {
    expect(FIT_SCORE_THRESHOLD).toBeGreaterThanOrEqual(0);
    expect(FIT_SCORE_THRESHOLD).toBeLessThanOrEqual(100);
  });
});
