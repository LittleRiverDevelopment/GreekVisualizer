import { describe, expect, it } from 'vitest';
import { normalCdf, normalPdf } from './normal';

describe('standard normal CDF', () => {
  const known: Array<[number, number]> = [
    [0, 0.5],
    [0.15, 0.5596176923702425],
    [0.35, 0.636830651175619],
    [1, 0.8413447460685429],
    [-1, 0.15865525393145707],
    [1.96, 0.9750021048517796],
    [-3, 0.0013498980316301035],
  ];

  it('matches reference values within 1e-12', () => {
    for (const [x, expected] of known) {
      expect(Math.abs(normalCdf(x) - expected)).toBeLessThan(1e-12);
    }
  });

  it('is symmetric and stays inside [0, 1]', () => {
    for (let i = -80; i <= 80; i += 1) {
      const x = i / 10;
      const cdf = normalCdf(x);
      expect(cdf).toBeGreaterThanOrEqual(0);
      expect(cdf).toBeLessThanOrEqual(1);
      expect(Math.abs(normalCdf(x) + normalCdf(-x) - 1)).toBeLessThan(1e-12);
    }
    expect(normalCdf(40)).toBe(1);
    expect(normalCdf(-40)).toBe(0);
    expect(Number.isFinite(normalCdf(8))).toBe(true);
  });

  it('has a unit-mass density at zero', () => {
    expect(normalPdf(0)).toBeCloseTo(1 / Math.sqrt(2 * Math.PI), 12);
    expect(normalPdf(10)).toBeGreaterThan(0);
    expect(Number.isFinite(normalPdf(100))).toBe(true);
  });
});
