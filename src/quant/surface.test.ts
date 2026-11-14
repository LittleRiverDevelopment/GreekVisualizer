import { describe, expect, it } from 'vitest';
import { RESOLUTION_SIZE, nullsToNaN, sampleSurface } from './surface';
import type { Market } from './black-scholes';

const market: Market = { S: 100, K: 100, T: 30 / 365, sigma: 0.2, r: 0.05, q: 0 };

describe('surface sampling', () => {
  it('uses a 45 by 45 default grid', () => {
    expect(RESOLUTION_SIZE.medium).toBe(45);
    const grid = sampleSurface({
      right: 'call',
      market,
      days: 30,
      pair: 'spot-days',
      metric: 'price',
      x: { id: 'spot', min: 50, max: 150 },
      y: { id: 'days', min: 0, max: 90 },
      resolution: 'medium',
    });
    expect(grid.x).toHaveLength(45);
    expect(grid.y).toHaveLength(45);
    expect(grid.z).toHaveLength(45);
    expect(grid.z[0]).toHaveLength(45);
  });

  it('keeps price finite at expiration and masks undefined Greeks', () => {
    const price = sampleSurface({
      right: 'call',
      market,
      days: 30,
      pair: 'spot-days',
      metric: 'price',
      x: { id: 'spot', min: 80, max: 120 },
      y: { id: 'days', min: 0, max: 30 },
      resolution: 'low',
    });
    const gamma = sampleSurface({
      right: 'put',
      market,
      days: 30,
      pair: 'spot-vol',
      metric: 'gamma',
      x: { id: 'spot', min: 80, max: 120 },
      y: { id: 'vol', min: 0, max: 0.4 },
      resolution: 'low',
    });
    for (const row of price.z) {
      for (const value of row) {
        expect(value).not.toBeNull();
        expect(Number.isFinite(value ?? NaN)).toBe(true);
      }
    }
    expect(gamma.y[0]).toBe(0);
    const edge = gamma.z[0] ?? [];
    expect(edge.every((value) => value === null)).toBe(true);
    const interior = gamma.z[gamma.z.length - 1] ?? [];
    expect(interior.some((value) => value !== null && Number.isFinite(value))).toBe(true);
    for (const row of gamma.z) {
      for (const value of row) {
        expect(value === null || Number.isFinite(value)).toBe(true);
        expect(value).not.toBe(Infinity);
        expect(value).not.toBe(-Infinity);
      }
    }
  });

  it('turns only masked nulls into NaN for plotting', () => {
    const grid = [
      [1, null],
      [null, 2],
    ];
    const plotted = nullsToNaN(grid);
    expect(Number.isNaN(plotted[0]?.[1] ?? 0)).toBe(true);
    expect(Number.isNaN(plotted[1]?.[0] ?? 0)).toBe(true);
    expect(plotted[0]?.[0]).toBe(1);
    expect(plotted[1]?.[1]).toBe(2);
  });

  it('samples a medium price surface quickly', () => {
    const started = performance.now();
    sampleSurface({
      right: 'call',
      market,
      days: 30,
      pair: 'spot-days',
      metric: 'price',
      x: { id: 'spot', min: 50, max: 150 },
      y: { id: 'days', min: 0, max: 180 },
      resolution: 'medium',
    });
    expect(performance.now() - started).toBeLessThan(250);
  });
});
