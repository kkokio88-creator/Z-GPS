import { describe, it, expect, vi, beforeEach } from 'vitest';
import { formatKRW, getDday } from '../../services/utils/formatters';

describe('formatKRW', () => {
  it('formats amounts >= 1억 with 억원 suffix', () => {
    expect(formatKRW(500000000)).toBe('5.0억원');
    expect(formatKRW(100000000)).toBe('1.0억원');
    expect(formatKRW(250000000)).toBe('2.5억원');
  });

  it('formats amounts >= 1000만 with 천만원 suffix', () => {
    expect(formatKRW(50000000)).toBe('5천만원');
    expect(formatKRW(10000000)).toBe('1천만원');
  });

  it('formats amounts >= 1만 with 만원 suffix', () => {
    expect(formatKRW(10000)).toBe('1만원');
    expect(formatKRW(500000)).toBe('50만원');
  });

  it('formats amounts < 1만 with 원 suffix and comma separators', () => {
    expect(formatKRW(9000)).toBe('9,000원');
    expect(formatKRW(0)).toBe('0원');
    expect(formatKRW(1234)).toBe('1,234원');
  });
});

describe('getDday', () => {
  beforeEach(() => {
    // Fix "today" to 2026-02-25 for deterministic tests
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-25T00:00:00'));
  });

  it('returns "마감" for past dates', () => {
    const result = getDday('2026-02-20');
    expect(result.label).toBe('마감');
    expect(result.days).toBeLessThan(0);
    expect(result.urgent).toBe(false);
  });

  it('returns "D-Day" for today', () => {
    const result = getDday('2026-02-25');
    expect(result.label).toBe('D-Day');
    expect(result.days).toBe(0);
    expect(result.urgent).toBe(true);
  });

  it('returns urgent D-N for dates within 7 days', () => {
    const result = getDday('2026-02-28');
    expect(result.label).toBe('D-3');
    expect(result.days).toBe(3);
    expect(result.urgent).toBe(true);
    expect(result.color).toBe('text-red-500');
  });

  it('returns amber for dates 8-14 days away', () => {
    const result = getDday('2026-03-05');
    expect(result.label).toBe('D-8');
    expect(result.days).toBe(8);
    expect(result.urgent).toBe(false);
    expect(result.color).toBe('text-amber-600');
  });

  it('returns blue for dates > 14 days away', () => {
    const result = getDday('2026-04-01');
    expect(result.label).toBe('D-35');
    expect(result.days).toBe(35);
    expect(result.urgent).toBe(false);
    expect(result.color).toBe('text-blue-600');
  });
});
