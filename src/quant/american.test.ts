import { describe, expect, it } from 'vitest';
import { binomialPrice, compareAmerican } from './american';
import { blackScholes, type Market } from './black-scholes';

const REF: Market = { S: 100, K: 100, T: 1, sigma: 0.2, r: 0.05, q: 0 };

describe('Cox–Ross–Rubinstein tree', () => {
  it('moves the European tree toward the analytic price as steps increase', () => {
    const analytic = blackScholes(REF, 'call').price;
    const coarse = binomialPrice(REF, 'call', 50, 'european');
    const fine = binomialPrice(REF, 'call', 400, 'european');
    expect(coarse.ok).toBe(true);
    expect(fine.ok).toBe(true);
    expect(Math.abs((fine.price ?? NaN) - analytic)).toBeLessThan(0.01);
    expect(Math.abs((fine.price ?? NaN) - analytic)).toBeLessThan(Math.abs((coarse.price ?? NaN) - analytic));
  });

  it('matches an American call to the European call when the dividend yield is zero', () => {
    const compared = compareAmerican(REF, 'call', 200);
    expect(compared.inputsOk).toBe(true);
    expect(Math.abs((compared.american ?? NaN) - (compared.europeanTree ?? NaN))).toBeLessThan(1e-8);
    expect(Math.abs((compared.europeanTree ?? NaN) - (compared.europeanAnalytic ?? NaN))).toBeLessThan(0.02);
  });

  it('prices an American put above the European put', () => {
    const compared = compareAmerican(REF, 'put', 200);
    expect(compared.american ?? 0).toBeGreaterThan(compared.europeanTree ?? 0);
    expect(compared.earlyExercisePremium ?? 0).toBeGreaterThan(0);
  });

  it('handles zero volatility without a singular probability', () => {
    const market: Market = { S: 80, K: 100, T: 1, sigma: 0, r: 0.05, q: 0 };
    const american = binomialPrice(market, 'put', 50, 'american');
    const european = binomialPrice(market, 'put', 50, 'european');
    expect(american.ok).toBe(true);
    expect(american.style).toBe('deterministic');
    expect(american.price).toBeCloseTo(20, 6);
    expect(european.price).toBeCloseTo(Math.exp(-0.05) * (100 - 80 * Math.exp(0.05)), 6);
    expect(american.price ?? 0).toBeGreaterThan(european.price ?? 0);
  });

  it('refuses a tree whose risk-neutral probability is outside (0, 1)', () => {
    const market: Market = { S: 100, K: 100, T: 1, sigma: 0.1, r: 0, q: 0.5 };
    const result = binomialPrice(market, 'call', 2, 'european');
    expect(result.ok).toBe(false);
    expect(result.price).toBeNull();
    expect(result.message).toMatch(/risk-neutral probability/i);
  });

  it('does not label analytic Greeks as American output', () => {
    const compared = compareAmerican(REF, 'put', 80);
    expect(compared).not.toHaveProperty('delta');
    expect(compared).not.toHaveProperty('gamma');
  });
});
