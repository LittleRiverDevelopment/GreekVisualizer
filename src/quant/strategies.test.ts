import { describe, expect, it } from 'vitest';
import { blackScholes, type Market } from './black-scholes';
import {
  analyzeStrategy,
  expirationPnl,
  modelPnl,
  optionLeg,
  stockLeg,
  type OptionLeg,
} from './strategies';

const base: Market = { S: 100, K: 100, T: 30 / 365, sigma: 0.2, r: 0.05, q: 0 };

function longCall(entry: number, quantity = 1, multiplier = 100, strike = 100): OptionLeg {
  return optionLeg({ right: 'call', strike, quantity, entryPremium: entry, multiplier });
}

describe('strategy signs and multipliers', () => {
  it('scales a long call by quantity and multiplier, and flips a short call', () => {
    const price = blackScholes(base, 'call').price;
    const leg = longCall(price, 2, 100);
    const value = price * 2 * 100;
    expect(modelPnl({ ...base }, [leg]) + price * 2 * 100).toBeCloseTo(value, 8);
    const short = longCall(price, -1, 100);
    const shortDelta = analyzeStrategy(base, [short]).greeks.delta ?? NaN;
    const perShare = blackScholes(base, 'call').delta ?? NaN;
    expect(shortDelta).toBeCloseTo(perShare * -1 * 100, 8);
    expect(shortDelta).toBeLessThan(0);
  });

  it('keeps the entry premium fixed when the spot changes', () => {
    const entry = blackScholes(base, 'call').price;
    const leg = longCall(entry);
    const before = modelPnl(base, [leg]);
    expect(before).toBeCloseTo(0, 8);
    const moved = modelPnl({ ...base, S: 110 }, [leg]);
    expect(leg.entryPremium).toBe(entry);
    expect(moved).not.toBeCloseTo(0, 4);
    expect(moved).toBeGreaterThan(0);
  });

  it('gives stock delta equal to signed shares and zero other stock Greeks', () => {
    const stats = analyzeStrategy(base, [stockLeg({ quantity: -40, entryPrice: 100 })]);
    expect(stats.greeks.delta).toBe(-40);
    expect(stats.greeks.gamma).toBe(0);
    expect(stats.greeks.thetaPerDay).toBe(0);
    expect(stats.greeks.vegaPerPoint).toBe(0);
    expect(stats.greeks.rhoPerPoint).toBe(0);
  });

  it('builds a covered-call delta from shares plus the short option', () => {
    const price = blackScholes(base, 'call').price;
    const delta = blackScholes(base, 'call').delta ?? NaN;
    const stats = analyzeStrategy(base, [
      stockLeg({ quantity: 100, entryPrice: 100 }),
      longCall(price, -1, 100),
    ]);
    expect(stats.greeks.delta).toBeCloseTo(100 + delta * -1 * 100, 8);
  });
});

describe('expiration tails and breakevens', () => {
  it('finds the long-call breakeven and an unlimited upside', () => {
    const leg = longCall(5, 1, 100, 100);
    const stats = analyzeStrategy({ ...base, T: 0 }, [leg]);
    expect(expirationPnl(105, [leg])).toBeCloseTo(0, 8);
    expect(expirationPnl(100, [leg])).toBeCloseTo(-500, 8);
    expect(expirationPnl(200, [leg])).toBeCloseTo(9500, 6);
    const point = stats.breakevens.find((item) => item.kind === 'point');
    expect(point?.at).toBeCloseTo(105, 6);
    expect(stats.maxProfit.unlimited).toBe(true);
    expect(stats.maxLoss.unlimited).toBe(false);
    expect(stats.maxLoss.amount).toBeCloseTo(-500, 6);
    expect(stats.slopeHigh).toBe(100);
  });

  it('marks a short call as unlimited loss from the tail slope, not the chart window', () => {
    const leg = longCall(5, -1, 100, 100);
    const stats = analyzeStrategy(base, [leg]);
    expect(stats.maxLoss.unlimited).toBe(true);
    expect(stats.maxProfit.unlimited).toBe(false);
    expect(stats.maxProfit.amount).toBeCloseTo(500, 6);
    expect(stats.slopeHigh).toBe(-100);
  });

  it('bounds a bull call spread and places the breakeven from the premiums', () => {
    const legs = [longCall(6, 1, 100, 100), longCall(2, -1, 100, 110)];
    const stats = analyzeStrategy(base, legs);
    expect(stats.maxProfit.unlimited).toBe(false);
    expect(stats.maxLoss.unlimited).toBe(false);
    expect(stats.maxLoss.amount).toBeCloseTo(-400, 6);
    expect(stats.maxProfit.amount).toBeCloseTo(600, 6);
    expect(stats.slopeHigh).toBe(0);
    const roots = stats.breakevens.filter((item) => item.kind === 'point').map((item) => item.at);
    expect(roots.some((root) => Math.abs(root - 104) < 1e-6)).toBe(true);
  });

  it('does not treat a flat zero segment as unlimited', () => {
    const legs = [longCall(0, 1, 100, 100), longCall(0, -1, 100, 100)];
    const stats = analyzeStrategy(base, legs);
    expect(expirationPnl(50, legs)).toBeCloseTo(0, 10);
    expect(expirationPnl(150, legs)).toBeCloseTo(0, 10);
    expect(stats.maxProfit.amount).toBeCloseTo(0, 8);
    expect(stats.maxLoss.amount).toBeCloseTo(0, 8);
    expect(stats.maxProfit.unlimited).toBe(false);
  });
});
