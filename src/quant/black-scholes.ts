/**
 * European Black–Scholes–Merton prices and Greeks with a continuous dividend yield.
 *
 * Inputs
 * - S: spot price of the underlying (per share), must be > 0
 * - K: strike (per share), must be > 0
 * - T: time to expiration in years. This app uses calendar days / 365.
 * - sigma: annualized volatility as a decimal (0.20 means 20%), must be ≥ 0
 * - r: continuous risk-free rate as a decimal. Negative rates are allowed.
 * - q: continuous dividend yield as a decimal. Any finite value is accepted.
 *
 * For T > 0 and sigma > 0:
 *   d1 = [ln(S/K) + (r − q + sigma²/2) T] / [sigma √T]
 *   d2 = d1 − sigma √T
 *   C  = S e^{−qT} N(d1) − K e^{−rT} N(d2)
 *   P  = K e^{−rT} N(−d2) − S e^{−qT} N(−d1)
 *
 * Display-unit transformations (the raw derivatives are also returned):
 * - Theta is ∂V/∂t, the change as calendar time passes (time-to-expiry shrinks).
 *   `thetaAnnual` is that derivative for a one-year change in t.
 *   `thetaPerDay` = thetaAnnual / 365.
 * - Vega raw is ∂V/∂sigma. `vegaPerPoint` = vegaRaw × 0.01 (one percentage point).
 * - Rho raw is ∂V/∂r. `rhoPerPoint` = rhoRaw × 0.01 (one percentage point).
 * - Delta is ∂V/∂S per $1. Gamma is ∂Δ/∂S per $1.
 * - Prices and these Greeks are per share. A contract multiplier is applied
 *   only when a position is formed (see strategies.ts).
 *
 * Boundaries
 * - T = 0: price is the intrinsic payoff. Every Greek is null. The formulas
 *   are singular at expiration, so the app does not substitute one-sided limits.
 * - sigma = 0 and T > 0: price is the discounted deterministic payoff.
 *   Delta, theta, vega, and rho use the finite limit of the Black–Scholes
 *   formulas. Gamma is null: the gamma formula divides by sigma, and the
 *   zero-volatility limit is not a classical function (it concentrates at the
 *   forward). A null Greek is "undefined at this boundary", never a fabricated 0.
 *
 * Intrinsic value is the undiscounted exercise value max(S−K, 0) or max(K−S, 0).
 * European extrinsic value (price − intrinsic) can be negative, because a
 * European contract cannot be exercised early.
 */

import { normalCdf, normalPdf } from './normal';

export const DAY_COUNT = 365;

export type Right = 'call' | 'put';

export interface Market {
  S: number;
  K: number;
  T: number;
  sigma: number;
  r: number;
  q: number;
}

export type Boundary = 'none' | 'expiration' | 'zero-vol';

export interface Valuation {
  price: number;
  intrinsic: number;
  extrinsic: number;
  /** ∂V/∂S. Null when undefined at a boundary. */
  delta: number | null;
  /** ∂²V/∂S². Null when undefined at a boundary. */
  gamma: number | null;
  /** ∂V/∂t per year, t increasing (expiration approaching). */
  thetaAnnual: number | null;
  /** thetaAnnual / 365. */
  thetaPerDay: number | null;
  /** ∂V/∂sigma, sigma in decimal. */
  vegaRaw: number | null;
  /** vegaRaw × 0.01. */
  vegaPerPoint: number | null;
  /** ∂V/∂r, r in decimal. */
  rhoRaw: number | null;
  /** rhoRaw × 0.01. */
  rhoPerPoint: number | null;
  d1: number | null;
  d2: number | null;
  boundary: Boundary;
}

export function yearsFromDays(days: number): number {
  return days / DAY_COUNT;
}

export function intrinsicValue(S: number, K: number, right: Right): number {
  return right === 'call' ? Math.max(S - K, 0) : Math.max(K - S, 0);
}

export function forwardPrice(S: number, T: number, r: number, q: number): number {
  return S * Math.exp((r - q) * T);
}

/** Discounted payoff along the deterministic (zero-volatility) path. */
export function zeroVolPrice(market: Market, right: Right): number {
  const { S, K, T, r, q } = market;
  const forward = forwardPrice(S, T, r, q);
  const df = Math.exp(-r * T);
  const payoff = right === 'call' ? Math.max(forward - K, 0) : Math.max(K - forward, 0);
  return df * payoff;
}

export function putCallParityGap(market: Market): number {
  const { S, K, T, r, q } = market;
  return S * Math.exp(-q * T) - K * Math.exp(-r * T);
}

export interface ValidationResult {
  ok: boolean;
  message: string | null;
}

export function validateMarket(market: Market): ValidationResult {
  const { S, K, T, sigma, r, q } = market;
  if (!Number.isFinite(S) || S <= 0) {
    return { ok: false, message: 'Spot must be a finite number greater than 0.' };
  }
  if (!Number.isFinite(K) || K <= 0) {
    return { ok: false, message: 'Strike must be a finite number greater than 0.' };
  }
  if (!Number.isFinite(T) || T < 0) {
    return { ok: false, message: 'Time to expiration must be a finite number of years, zero or greater.' };
  }
  if (!Number.isFinite(sigma) || sigma < 0) {
    return { ok: false, message: 'Volatility must be a finite decimal, zero or greater. 20% is entered as 0.20.' };
  }
  if (!Number.isFinite(r)) {
    return { ok: false, message: 'The interest rate must be a finite decimal. Negative rates are allowed.' };
  }
  if (!Number.isFinite(q)) {
    return { ok: false, message: 'Dividend yield must be a finite decimal.' };
  }
  return { ok: true, message: null };
}

function emptyGreeks(price: number, intrinsic: number, boundary: Boundary): Valuation {
  return {
    price,
    intrinsic,
    extrinsic: price - intrinsic,
    delta: null,
    gamma: null,
    thetaAnnual: null,
    thetaPerDay: null,
    vegaRaw: null,
    vegaPerPoint: null,
    rhoRaw: null,
    rhoPerPoint: null,
    d1: null,
    d2: null,
    boundary,
  };
}

function scaled(thetaAnnual: number, vegaRaw: number, rhoRaw: number): Pick<
  Valuation,
  'thetaAnnual' | 'thetaPerDay' | 'vegaRaw' | 'vegaPerPoint' | 'rhoRaw' | 'rhoPerPoint'
> {
  return {
    thetaAnnual,
    thetaPerDay: thetaAnnual / DAY_COUNT,
    vegaRaw,
    vegaPerPoint: vegaRaw * 0.01,
    rhoRaw,
    rhoPerPoint: rhoRaw * 0.01,
  };
}

/**
 * Finite limits of the Greeks as sigma → 0 with T > 0.
 * Gamma is intentionally omitted (undefined).
 */
function zeroVolValuation(market: Market, right: Right): Valuation {
  const { S, K, T, r, q } = market;
  const price = zeroVolPrice(market, right);
  const intrinsic = intrinsicValue(S, K, right);
  const dfq = Math.exp(-q * T);
  const dfr = Math.exp(-r * T);
  const mu = Math.log(S / K) + (r - q) * T;
  const side: -1 | 0 | 1 = mu > 0 ? 1 : mu < 0 ? -1 : 0;
  const sqrtT = Math.sqrt(T);

  // Probability weight in the limit: 1 if the forward is strictly in the money,
  // 0 if strictly out, and 1/2 on the knife edge F = K (d1 → 0).
  const callExercise = side === 1 ? 1 : side === 0 ? 0.5 : 0;
  const putExercise = side === -1 ? 1 : side === 0 ? 0.5 : 0;

  const delta = right === 'call' ? dfq * callExercise : -dfq * putExercise;

  // The term that carries φ(d1) σ vanishes in the limit, including on F = K.
  const thetaAnnual =
    right === 'call'
      ? q * S * dfq * callExercise - r * K * dfr * callExercise
      : -q * S * dfq * putExercise + r * K * dfr * putExercise;

  // φ(d1) √T → 0 when F ≠ K, and φ(0) √T when F = K.
  const vegaRaw = side === 0 ? (S * dfq * sqrtT) / Math.sqrt(2 * Math.PI) : 0;
  const rhoRaw = right === 'call' ? K * T * dfr * callExercise : -K * T * dfr * putExercise;

  return {
    price,
    intrinsic,
    extrinsic: price - intrinsic,
    delta,
    gamma: null,
    ...scaled(thetaAnnual, vegaRaw, rhoRaw),
    d1: null,
    d2: null,
    boundary: 'zero-vol',
  };
}

export function blackScholes(market: Market, right: Right): Valuation {
  const check = validateMarket(market);
  if (!check.ok) {
    throw new Error(check.message ?? 'Invalid market.');
  }
  const { S, K, T, sigma, r, q } = market;
  const intrinsic = intrinsicValue(S, K, right);

  if (T === 0) {
    return emptyGreeks(intrinsic, intrinsic, 'expiration');
  }
  if (sigma === 0) {
    return zeroVolValuation(market, right);
  }

  const sqrtT = Math.sqrt(T);
  const volSqrt = sigma * sqrtT;
  const mu = Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T;
  const d1 = mu / volSqrt;
  const d2 = d1 - volSqrt;

  const dfq = Math.exp(-q * T);
  const dfr = Math.exp(-r * T);
  const nd1 = normalCdf(d1);
  const nd2 = normalCdf(d2);
  const nmd1 = normalCdf(-d1);
  const nmd2 = normalCdf(-d2);
  const pdf = normalPdf(d1);

  const price =
    right === 'call' ? S * dfq * nd1 - K * dfr * nd2 : K * dfr * nmd2 - S * dfq * nmd1;

  const delta = right === 'call' ? dfq * nd1 : dfq * (nd1 - 1);
  const gamma = (dfq * pdf) / (S * volSqrt);

  const thetaAnnual =
    right === 'call'
      ? (-S * dfq * pdf * sigma) / (2 * sqrtT) + q * S * dfq * nd1 - r * K * dfr * nd2
      : (-S * dfq * pdf * sigma) / (2 * sqrtT) - q * S * dfq * nmd1 + r * K * dfr * nmd2;

  const vegaRaw = S * dfq * pdf * sqrtT;
  const rhoRaw = right === 'call' ? K * T * dfr * nd2 : -K * T * dfr * nmd2;

  return {
    price,
    intrinsic,
    extrinsic: price - intrinsic,
    delta,
    gamma,
    ...scaled(thetaAnnual, vegaRaw, rhoRaw),
    d1,
    d2,
    boundary: 'none',
  };
}

export type MetricName = 'price' | 'delta' | 'gamma' | 'theta' | 'vega' | 'rho';

export function metricOf(valuation: Valuation, metric: MetricName): number | null {
  switch (metric) {
    case 'price':
      return valuation.price;
    case 'delta':
      return valuation.delta;
    case 'gamma':
      return valuation.gamma;
    case 'theta':
      return valuation.thetaPerDay;
    case 'vega':
      return valuation.vegaPerPoint;
    case 'rho':
      return valuation.rhoPerPoint;
    default: {
      const exhaustive: never = metric;
      return exhaustive;
    }
  }
}

export function metricUnit(metric: MetricName): string {
  switch (metric) {
    case 'price':
      return '$ per share';
    case 'delta':
      return '$ per share per $1 underlying';
    case 'gamma':
      return 'per $1 underlying';
    case 'theta':
      return '$ per share per calendar day';
    case 'vega':
      return '$ per share per 1 vol point';
    case 'rho':
      return '$ per share per 1 rate point';
    default: {
      const exhaustive: never = metric;
      return exhaustive;
    }
  }
}

export function metricLabel(metric: MetricName): string {
  switch (metric) {
    case 'price':
      return 'Price';
    case 'delta':
      return 'Delta';
    case 'gamma':
      return 'Gamma';
    case 'theta':
      return 'Theta';
    case 'vega':
      return 'Vega';
    case 'rho':
      return 'Rho';
    default: {
      const exhaustive: never = metric;
      return exhaustive;
    }
  }
}

/** True when a metric uses a diverging color scale centered at zero. */
export function metricIsSigned(metric: MetricName): boolean {
  return metric === 'delta' || metric === 'theta' || metric === 'rho';
}
