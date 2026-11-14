/**
 * Multi-leg positions on top of the European model.
 *
 * Conventions
 * - Option quantity is in contracts. Positive is a buy, negative is a sale.
 * - Entry premium is per share and stays fixed until the user resets the trade.
 * - The contract multiplier converts per-share option quantities into position
 *   value. Default 100. It is applied to option value, option P&L, and option Greeks.
 * - Stock quantity is in shares, not contracts. Stock delta equals the signed
 *   share count. Other stock Greeks are zero. The option multiplier is not
 *   applied to stock.
 * - Current theoretical value is not P&L. P&L = current model value − fixed
 *   initial net cost. Stock cost basis is the entry price × shares.
 * - Fees, financing, and dividend cash flows are excluded.
 * - Every option leg in a strategy shares one expiration. Calendars are out of scope.
 *
 * Expiration P&L is the piecewise-linear payoff. Tail classification uses the
 * slope as S → ∞ and the value at S = 0, not the chart window. S cannot be
 * negative, so the downside of vanilla options and stock is finite.
 */

import { blackScholes, intrinsicValue, type Market, type Right, type Valuation } from './black-scholes';

export interface OptionLeg {
  id: string;
  type: 'option';
  right: Right;
  strike: number;
  /** Signed contracts. Positive buys, negative sells. */
  quantity: number;
  /** Premium per share paid (positive quantity) or received (negative quantity). */
  entryPremium: number;
  multiplier: number;
}

export interface StockLeg {
  id: string;
  type: 'stock';
  /** Signed shares. */
  quantity: number;
  entryPrice: number;
}

export type Leg = OptionLeg | StockLeg;

export interface StrategyStats {
  netEntry: number;
  currentValue: number;
  pnl: number;
  expirationAtSpot: number;
  breakevens: Breakeven[];
  maxProfit: Extremum;
  maxLoss: Extremum;
  slopeHigh: number;
  /** Right-hand slope on the first interval above 0, before the first strike. */
  slopeLow: number;
  greeks: AggregateGreeks;
  warnings: string[];
}

export interface Breakeven {
  kind: 'point' | 'interval';
  /** Point root, or the start of an interval where expiration P&L is identically zero. */
  at: number;
  to?: number;
}

export interface Extremum {
  /** Finite dollar amount, or null when the tail is unlimited. */
  amount: number | null;
  unlimited: boolean;
  /** Human-readable location. Empty when unlimited. */
  where: string;
}

export interface AggregateGreeks {
  delta: number | null;
  gamma: number | null;
  thetaPerDay: number | null;
  vegaPerPoint: number | null;
  rhoPerPoint: number | null;
  undefinedReason: string | null;
}

const EPS = 1e-6;

export function optionEntryCash(leg: OptionLeg): number {
  return leg.entryPremium * leg.quantity * leg.multiplier;
}

export function stockEntryCash(leg: StockLeg): number {
  return leg.entryPrice * leg.quantity;
}

export function legEntryCash(leg: Leg): number {
  return leg.type === 'option' ? optionEntryCash(leg) : stockEntryCash(leg);
}

export function netEntry(legs: Leg[]): number {
  return legs.reduce((sum, leg) => sum + legEntryCash(leg), 0);
}

function legMarket(base: Market, leg: OptionLeg): Market {
  return { ...base, K: leg.strike };
}

export function optionModelValue(base: Market, leg: OptionLeg): number {
  const valuation = blackScholes(legMarket(base, leg), leg.right);
  return valuation.price * leg.quantity * leg.multiplier;
}

export function stockModelValue(spot: number, leg: StockLeg): number {
  return spot * leg.quantity;
}

export function currentValue(base: Market, legs: Leg[]): number {
  return legs.reduce((sum, leg) => {
    if (leg.type === 'stock') return sum + stockModelValue(base.S, leg);
    return sum + optionModelValue(base, leg);
  }, 0);
}

export function modelPnl(base: Market, legs: Leg[]): number {
  return currentValue(base, legs) - netEntry(legs);
}

/** Expiration P&L at a spot, using intrinsic payoffs and fixed entries. */
export function expirationPnl(spot: number, legs: Leg[]): number {
  let pnl = 0;
  for (const leg of legs) {
    if (leg.type === 'stock') {
      pnl += (spot - leg.entryPrice) * leg.quantity;
    } else {
      const payoff = intrinsicValue(spot, leg.strike, leg.right);
      pnl += (payoff - leg.entryPremium) * leg.quantity * leg.multiplier;
    }
  }
  return pnl;
}

function strikesOf(legs: Leg[]): number[] {
  const raw = legs.filter((leg): leg is OptionLeg => leg.type === 'option').map((leg) => leg.strike);
  return [...new Set(raw)].sort((a, b) => a - b);
}

/**
 * Slope of expiration P&L just to the right of `left`, i.e. on (left, nextKnot).
 * Calls contribute only above their strike. Puts contribute only below theirs.
 */
/**
 * Right-hand slope of expiration P&L on the interval that starts at `left`.
 * A call contributes its scaled quantity once `left` is at or above the strike.
 * A put contributes the opposite of its scaled quantity while `left` is still
 * strictly below the strike.
 */
export function expirationSlopeAbove(left: number, legs: Leg[]): number {
  let slope = 0;
  for (const leg of legs) {
    if (leg.type === 'stock') {
      slope += leg.quantity;
      continue;
    }
    const scale = leg.quantity * leg.multiplier;
    if (leg.right === 'call') {
      if (left >= leg.strike) slope += scale;
    } else if (leg.strike > left) {
      slope -= scale;
    }
  }
  return slope;
}

function formatSpot(spot: number): string {
  const rounded = Math.round(spot * 100) / 100;
  return `$${rounded.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
}

function extremum(amount: number, spots: number[]): Extremum {
  const unique = [...new Set(spots.map((s) => Math.round(s * 1e6) / 1e6))].sort((a, b) => a - b);
  let where = 'unavailable';
  if (unique.length === 1) {
    const only = unique[0];
    where = only === undefined ? 'unavailable' : `at underlying ${formatSpot(only)}`;
  } else if (unique.length > 1) {
    const first = unique[0];
    const last = unique[unique.length - 1];
    if (first === undefined || last === undefined) {
      where = 'at more than one underlying price';
    } else {
      where = `at underlying prices from ${formatSpot(first)} to ${formatSpot(last)}`;
    }
  }
  return { amount, unlimited: false, where };
}

export function analyzeStrategy(base: Market, legs: Leg[]): StrategyStats {
  const warnings: string[] = [];
  if (legs.length === 0) {
    warnings.push('This strategy has no legs.');
  }
  for (const leg of legs) {
    if (leg.type === 'option') {
      if (!(leg.strike > 0) || !Number.isFinite(leg.strike)) warnings.push('An option leg has an invalid strike.');
      if (!(leg.multiplier > 0) || !Number.isFinite(leg.multiplier)) {
        warnings.push('An option multiplier must be a finite number greater than 0.');
      }
      if (!Number.isFinite(leg.quantity) || !Number.isFinite(leg.entryPremium)) {
        warnings.push('An option leg has a non-finite quantity or entry premium.');
      }
    } else if (!Number.isFinite(leg.quantity) || !Number.isFinite(leg.entryPrice)) {
      warnings.push('A stock leg has a non-finite quantity or entry price.');
    }
  }

  const knots = [0, ...strikesOf(legs)];
  const values = knots.map((spot) => expirationPnl(spot, legs));
  const highStrike = knots[knots.length - 1] ?? 0;
  const slopeHigh = expirationSlopeAbove(highStrike, legs);
  const slopeLow = expirationSlopeAbove(0, legs);

  const finiteCandidates: { spot: number; value: number }[] = knots.map((spot, i) => ({
    spot,
    value: values[i] ?? NaN,
  }));

  let maxProfit: Extremum;
  if (slopeHigh > EPS) {
    maxProfit = {
      amount: null,
      unlimited: true,
      where: 'unlimited as the underlying rises, from the positive high-side slope',
    };
  } else {
    let best = -Infinity;
    const ats: number[] = [];
    for (const candidate of finiteCandidates) {
      if (!Number.isFinite(candidate.value)) continue;
      if (candidate.value > best + EPS) {
        best = candidate.value;
        ats.length = 0;
        ats.push(candidate.spot);
      } else if (Math.abs(candidate.value - best) <= EPS) {
        ats.push(candidate.spot);
      }
    }
    maxProfit = Number.isFinite(best) ? extremum(best, ats) : { amount: null, unlimited: false, where: 'unavailable' };
    if (!Number.isFinite(best)) warnings.push('Maximum expiration profit is unavailable.');
  }

  let maxLoss: Extremum;
  if (slopeHigh < -EPS) {
    maxLoss = {
      amount: null,
      unlimited: true,
      where: 'unlimited as the underlying rises, from the negative high-side slope',
    };
  } else {
    let worst = Infinity;
    const ats: number[] = [];
    for (const candidate of finiteCandidates) {
      if (!Number.isFinite(candidate.value)) continue;
      if (candidate.value < worst - EPS) {
        worst = candidate.value;
        ats.length = 0;
        ats.push(candidate.spot);
      } else if (Math.abs(candidate.value - worst) <= EPS) {
        ats.push(candidate.spot);
      }
    }
    maxLoss = Number.isFinite(worst)
      ? extremum(worst, ats)
      : { amount: null, unlimited: false, where: 'unavailable' };
    if (!Number.isFinite(worst)) warnings.push('Maximum expiration loss is unavailable.');
  }

  const breakevens = findBreakevens(knots, values, legs);

  let delta = 0;
  let gamma = 0;
  let theta = 0;
  let vega = 0;
  let rho = 0;
  let greeksDefined = true;
  let gammaDefined = true;
  let undefinedReason: string | null = null;
  for (const leg of legs) {
    if (leg.type === 'stock') {
      delta += leg.quantity;
      continue;
    }
    let valuation: Valuation;
    try {
      valuation = blackScholes(legMarket(base, leg), leg.right);
    } catch (error) {
      greeksDefined = false;
      gammaDefined = false;
      undefinedReason = error instanceof Error ? error.message : 'An option leg could not be priced.';
      break;
    }
    const scale = leg.quantity * leg.multiplier;
    if (valuation.boundary === 'expiration') {
      greeksDefined = false;
      gammaDefined = false;
      undefinedReason =
        'Aggregate Greeks are undefined because an option is at expiration, where these Greeks are undefined.';
      break;
    }
    if (
      valuation.delta === null ||
      valuation.thetaPerDay === null ||
      valuation.vegaPerPoint === null ||
      valuation.rhoPerPoint === null
    ) {
      greeksDefined = false;
      gammaDefined = false;
      undefinedReason = 'Aggregate Greeks are undefined because an option Greek is undefined at this boundary.';
      break;
    }
    delta += valuation.delta * scale;
    theta += valuation.thetaPerDay * scale;
    vega += valuation.vegaPerPoint * scale;
    rho += valuation.rhoPerPoint * scale;
    if (valuation.gamma === null) {
      gammaDefined = false;
      undefinedReason =
        'Aggregate gamma is undefined because an option is at zero volatility, where gamma is undefined. Delta, theta, vega, and rho use the zero-volatility limit.';
    } else {
      gamma += valuation.gamma * scale;
    }
  }

  const greeks: AggregateGreeks = {
    delta: greeksDefined ? delta : null,
    gamma: greeksDefined && gammaDefined ? gamma : null,
    thetaPerDay: greeksDefined ? theta : null,
    vegaPerPoint: greeksDefined ? vega : null,
    rhoPerPoint: greeksDefined ? rho : null,
    undefinedReason,
  };

  return {
    netEntry: netEntry(legs),
    currentValue: safeValue(() => currentValue(base, legs)),
    pnl: safeValue(() => modelPnl(base, legs)),
    expirationAtSpot: expirationPnl(base.S, legs),
    breakevens,
    maxProfit,
    maxLoss,
    slopeHigh,
    slopeLow,
    greeks,
    warnings,
  };
}

function safeValue(fn: () => number): number {
  try {
    const value = fn();
    return Number.isFinite(value) ? value : Number.NaN;
  } catch {
    return Number.NaN;
  }
}

function findBreakevens(knots: number[], values: number[], legs: Leg[]): Breakeven[] {
  const found: Breakeven[] = [];
  for (let i = 0; i < knots.length - 1; i += 1) {
    const left = knots[i];
    const right = knots[i + 1];
    const vLeft = values[i];
    if (left === undefined || right === undefined || vLeft === undefined) continue;
    const slope = expirationSlopeAbove(left, legs);
    if (Math.abs(slope) <= EPS && Math.abs(vLeft) <= EPS) {
      found.push({ kind: 'interval', at: left, to: right });
      continue;
    }
    if (Math.abs(slope) <= EPS) continue;
    const root = left - vLeft / slope;
    if (root > left + 1e-8 && root < right - 1e-8) {
      found.push({ kind: 'point', at: root });
    }
  }

  const last = knots[knots.length - 1];
  const vLast = values[values.length - 1];
  if (last !== undefined && vLast !== undefined) {
    const slope = expirationSlopeAbove(last, legs);
    if (Math.abs(slope) > EPS) {
      const root = last - vLast / slope;
      if (root > last + 1e-8) found.push({ kind: 'point', at: root });
    }
  }

  for (let i = 0; i < knots.length; i += 1) {
    const spot = knots[i];
    const value = values[i];
    if (spot === undefined || value === undefined) continue;
    if (Math.abs(value) <= EPS) {
      const already = found.some(
        (item) => item.kind === 'point' && Math.abs(item.at - spot) <= 1e-4,
      );
      const insideInterval = found.some(
        (item) => item.kind === 'interval' && item.to !== undefined && spot >= item.at && spot <= item.to,
      );
      if (!already && !insideInterval) found.push({ kind: 'point', at: spot });
    }
  }

  found.sort((a, b) => a.at - b.at);
  return found;
}

export interface PnlSample {
  spot: number;
  expiration: number;
  model: number;
}

/** Sample spots, always including strikes that fall inside the window so kinks are not skipped. */
export function sampleSpots(min: number, max: number, strikes: number[], count = 161): number[] {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  const spots = new Set<number>();
  const n = Math.max(2, count);
  for (let i = 0; i < n; i += 1) {
    spots.add(lo + ((hi - lo) * i) / (n - 1));
  }
  for (const strike of strikes) {
    if (strike >= lo && strike <= hi) spots.add(strike);
  }
  return [...spots].sort((a, b) => a - b);
}

export function sampleStrategyPnl(base: Market, legs: Leg[], spots: number[]): PnlSample[] {
  return spots.map((spot) => {
    const market = { ...base, S: spot };
    let model = Number.NaN;
    try {
      model = modelPnl(market, legs);
    } catch {
      model = Number.NaN;
    }
    return { spot, expiration: expirationPnl(spot, legs), model };
  });
}

export function strategyStrikes(legs: Leg[]): number[] {
  return strikesOf(legs);
}

let idCounter = 0;

export function createId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}-${Math.random().toString(36).slice(2, 7)}`;
}

export function optionLeg(partial: Omit<OptionLeg, 'id' | 'type'> & { id?: string }): OptionLeg {
  return {
    id: partial.id ?? createId('opt'),
    type: 'option',
    right: partial.right,
    strike: partial.strike,
    quantity: partial.quantity,
    entryPremium: partial.entryPremium,
    multiplier: partial.multiplier,
  };
}

export function stockLeg(partial: Omit<StockLeg, 'id' | 'type'> & { id?: string }): StockLeg {
  return {
    id: partial.id ?? createId('stk'),
    type: 'stock',
    quantity: partial.quantity,
    entryPrice: partial.entryPrice,
  };
}

/** Model premium per share for a new leg. Throws if the market is invalid. */
export function modelPremium(base: Market, right: Right, strike: number): number {
  return blackScholes({ ...base, K: strike }, right).price;
}
