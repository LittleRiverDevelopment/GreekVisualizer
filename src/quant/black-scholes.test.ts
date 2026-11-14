import { describe, expect, it } from 'vitest';
import {
  blackScholes,
  intrinsicValue,
  metricOf,
  putCallParityGap,
  validateMarket,
  yearsFromDays,
  zeroVolPrice,
  type Market,
} from './black-scholes';

const REF: Market = { S: 100, K: 100, T: 1, sigma: 0.2, r: 0.05, q: 0 };

/** Closed-form values from Φ(x) = ½(1+erf(x/√2)), published to 4 decimals as 10.4506 and 5.5735. */
const REF_CALL = 10.450583572185565;
const REF_PUT = 5.573526022256971;

function absClose(actual: number, expected: number, tol: number): void {
  expect(Math.abs(actual - expected)).toBeLessThan(tol);
}

describe('normal-backed Black–Scholes reference', () => {
  it('prices the reference call and put', () => {
    absClose(blackScholes(REF, 'call').price, REF_CALL, 1e-8);
    absClose(blackScholes(REF, 'put').price, REF_PUT, 1e-8);
  });

  it('satisfies put-call parity', () => {
    const call = blackScholes(REF, 'call').price;
    const put = blackScholes(REF, 'put').price;
    absClose(call - put, putCallParityGap(REF), 1e-10);
  });

  it('obeys European price bounds', () => {
    const cases: Market[] = [
      REF,
      { ...REF, q: 0.03 },
      { ...REF, r: -0.02 },
      { ...REF, S: 80, sigma: 0.4, T: 0.25 },
      { ...REF, S: 140, q: 0.08, r: 0.01 },
    ];
    for (const market of cases) {
      const call = blackScholes(market, 'call').price;
      const put = blackScholes(market, 'put').price;
      const dfq = Math.exp(-market.q * market.T);
      const dfr = Math.exp(-market.r * market.T);
      const forwardGap = market.S * dfq - market.K * dfr;
      expect(call).toBeGreaterThanOrEqual(-1e-10);
      expect(put).toBeGreaterThanOrEqual(-1e-10);
      expect(call).toBeLessThanOrEqual(market.S * dfq + 1e-8);
      expect(put).toBeLessThanOrEqual(market.K * dfr + 1e-8);
      expect(call + 1e-8).toBeGreaterThanOrEqual(Math.max(0, forwardGap));
      expect(put + 1e-8).toBeGreaterThanOrEqual(Math.max(0, -forwardGap));
    }
  });
});

describe('boundaries', () => {
  it('uses intrinsic value at expiration and null Greeks', () => {
    const call = blackScholes({ ...REF, T: 0, S: 110 }, 'call');
    const put = blackScholes({ ...REF, T: 0, S: 110 }, 'put');
    expect(call.price).toBe(10);
    expect(put.price).toBe(0);
    expect(call.extrinsic).toBe(0);
    expect(call.boundary).toBe('expiration');
    expect(call.delta).toBeNull();
    expect(call.gamma).toBeNull();
    expect(call.thetaPerDay).toBeNull();
    expect(call.vegaPerPoint).toBeNull();
    expect(call.rhoPerPoint).toBeNull();
    expect(put.delta).toBeNull();
  });

  it('matches the zero-volatility discounted payoff', () => {
    const market: Market = { ...REF, sigma: 0, S: 110, T: 0.5 };
    const call = blackScholes(market, 'call');
    const put = blackScholes(market, 'put');
    absClose(call.price, zeroVolPrice(market, 'call'), 1e-12);
    absClose(put.price, zeroVolPrice(market, 'put'), 1e-12);
    expect(call.gamma).toBeNull();
    expect(call.boundary).toBe('zero-vol');
    expect(call.delta).not.toBeNull();
    const otm: Market = { ...market, S: 90 };
    expect(blackScholes(otm, 'call').delta).toBe(0);
    expect(blackScholes(otm, 'put').delta).toBeCloseTo(-Math.exp(-otm.q * otm.T), 12);
  });

  it('allows a negative European extrinsic value', () => {
    const put = blackScholes({ S: 50, K: 100, T: 1, sigma: 0.2, r: 0.1, q: 0 }, 'put');
    expect(put.price).toBeLessThan(put.intrinsic);
    expect(put.extrinsic).toBeLessThan(0);
  });
});

describe('market cases', () => {
  it('lowers the call and raises the put when the dividend yield rises', () => {
    const q0 = blackScholes(REF, 'call').price;
    const q1 = blackScholes({ ...REF, q: 0.03 }, 'call').price;
    const p0 = blackScholes(REF, 'put').price;
    const p1 = blackScholes({ ...REF, q: 0.03 }, 'put').price;
    expect(q1).toBeLessThan(q0);
    expect(p1).toBeGreaterThan(p0);
    absClose(q1, 8.652528553942709, 1e-8);
    absClose(p1, 6.7309176491633025, 1e-8);
  });

  it('prices negative rates', () => {
    const call = blackScholes({ ...REF, r: -0.02 }, 'call');
    const put = blackScholes({ ...REF, r: -0.02 }, 'put');
    absClose(call.price, 7.076019176652629, 1e-8);
    absClose(put.price, 9.096153179328205, 1e-8);
    expect(Number.isFinite(call.price)).toBe(true);
  });

  it('stays finite deep in and out of the money and at very short maturity', () => {
    const cases: Array<[Market, 'call' | 'put']> = [
      [{ S: 1e6, K: 100, T: 1, sigma: 0.2, r: 0.05, q: 0 }, 'call'],
      [{ S: 1e-6, K: 100, T: 1, sigma: 0.2, r: 0.05, q: 0 }, 'put'],
      [{ S: 100, K: 100, T: yearsFromDays(0.01), sigma: 0.2, r: 0.05, q: 0 }, 'call'],
      [{ S: 100, K: 100, T: 1e-8, sigma: 1e-4, r: 0, q: 0 }, 'put'],
      [{ S: 50, K: 100, T: 1, sigma: 0.2, r: 0.05, q: 0 }, 'call'],
    ];
    for (const [market, right] of cases) {
      const valuation = blackScholes(market, right);
      expect(Number.isFinite(valuation.price)).toBe(true);
      for (const greek of [valuation.delta, valuation.gamma, valuation.thetaPerDay, valuation.vegaPerPoint, valuation.rhoPerPoint]) {
        expect(greek === null || Number.isFinite(greek)).toBe(true);
      }
    }
    absClose(blackScholes({ S: 200, K: 100, T: 1, sigma: 0.2, r: 0.05, q: 0 }, 'call').price, 104.87772423432371, 1e-6);
    absClose(blackScholes({ S: 50, K: 100, T: 1, sigma: 0.2, r: 0.05, q: 0 }, 'call').price, 0.002399417553308053, 1e-8);
  });

  it('rejects non-positive spot and strike, negative time, and negative volatility', () => {
    expect(validateMarket({ ...REF, S: 0 }).ok).toBe(false);
    expect(validateMarket({ ...REF, K: -5 }).ok).toBe(false);
    expect(validateMarket({ ...REF, T: -0.1 }).ok).toBe(false);
    expect(validateMarket({ ...REF, sigma: -0.1 }).ok).toBe(false);
    expect(validateMarket({ ...REF, r: -0.5 }).ok).toBe(true);
  });
});

describe('Greeks', () => {
  it('matches central finite differences away from singularities', () => {
    const market = REF;
    const base = blackScholes(market, 'call');
    const hS = 1e-2;
    const price = (patch: Partial<Market>) => blackScholes({ ...market, ...patch }, 'call').price;
    const deltaFd = (price({ S: market.S + hS }) - price({ S: market.S - hS })) / (2 * hS);
    const gammaFd = (price({ S: market.S + hS }) - 2 * price({}) + price({ S: market.S - hS })) / (hS * hS);
    const hSig = 1e-4;
    const vegaFd = (price({ sigma: market.sigma + hSig }) - price({ sigma: market.sigma - hSig })) / (2 * hSig);
    const hT = 1e-4;
    const thetaFd = -(price({ T: market.T + hT }) - price({ T: market.T - hT })) / (2 * hT);
    const hR = 1e-4;
    const rhoFd = (price({ r: market.r + hR }) - price({ r: market.r - hR })) / (2 * hR);
    absClose(base.delta ?? NaN, deltaFd, 1e-6);
    absClose(base.gamma ?? NaN, gammaFd, 1e-5);
    absClose(base.vegaRaw ?? NaN, vegaFd, 1e-4);
    absClose(base.thetaAnnual ?? NaN, thetaFd, 1e-3);
    absClose(base.rhoRaw ?? NaN, rhoFd, 1e-4);
  });

  it('scales theta per day and vega and rho per percentage point', () => {
    const call = blackScholes(REF, 'call');
    absClose(call.thetaPerDay ?? NaN, (call.thetaAnnual ?? NaN) / 365, 1e-15);
    absClose(call.vegaPerPoint ?? NaN, (call.vegaRaw ?? NaN) * 0.01, 1e-15);
    absClose(call.rhoPerPoint ?? NaN, (call.rhoRaw ?? NaN) * 0.01, 1e-15);
    expect(metricOf(call, 'theta')).toBe(call.thetaPerDay);
    expect(metricOf(call, 'vega')).toBe(call.vegaPerPoint);
    expect(metricOf(call, 'rho')).toBe(call.rhoPerPoint);
  });

  it('gives calls and puts the same gamma and vega', () => {
    const call = blackScholes(REF, 'call');
    const put = blackScholes(REF, 'put');
    expect(call.gamma).toBe(put.gamma);
    expect(call.vegaRaw).toBe(put.vegaRaw);
    expect(call.vegaPerPoint).toBe(put.vegaPerPoint);
  });

  it('is not always a negative theta for a long European option', () => {
    const put = blackScholes({ S: 60, K: 100, T: 0.5, sigma: 0.15, r: 0.08, q: 0 }, 'put');
    expect(put.thetaPerDay).not.toBeNull();
    expect(put.thetaPerDay ?? 0).toBeGreaterThan(0);
  });

  it('raises vanilla prices when volatility rises, other inputs fixed', () => {
    const low = blackScholes(REF, 'call').price;
    const high = blackScholes({ ...REF, sigma: 0.3 }, 'call').price;
    const lowPut = blackScholes(REF, 'put').price;
    const highPut = blackScholes({ ...REF, sigma: 0.3 }, 'put').price;
    expect(high).toBeGreaterThan(low);
    expect(highPut).toBeGreaterThan(lowPut);
  });
});

describe('intrinsic helper', () => {
  it('matches the expiration payoff', () => {
    expect(intrinsicValue(120, 100, 'call')).toBe(20);
    expect(intrinsicValue(80, 100, 'call')).toBe(0);
    expect(intrinsicValue(80, 100, 'put')).toBe(20);
    expect(intrinsicValue(120, 100, 'put')).toBe(0);
  });
});
