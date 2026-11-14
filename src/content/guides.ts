/**
 * Guided scenarios. Every figure is computed from these parameter sets by the
 * pricing engine. Narrative text in the UI branches on the computed sign, so a
 * parameter edit cannot leave a hard-coded loss claim behind.
 */

import { blackScholes, yearsFromDays, type Market, type Right } from '../quant/black-scholes';
import type { ExplorerInput, ViewInput } from '../scenario/model';

export interface GuideDefinition {
  id: string;
  title: string;
  objective: string;
  lookAt: string;
  why: string;
  leavesOut: string;
  explorer: ExplorerInput;
  view: Pick<ViewInput, 'axes' | 'metric' | 'spotMin' | 'spotMax' | 'daysMin' | 'daysMax' | 'volMin' | 'volMax'>;
}

const baseExplorer = (patch: Partial<ExplorerInput>): ExplorerInput => ({
  right: 'call',
  S: 100,
  K: 100,
  days: 30,
  sigma: 0.2,
  r: 0.05,
  q: 0,
  contracts: 1,
  multiplier: 100,
  ...patch,
});

export const GUIDES: GuideDefinition[] = [
  {
    id: 'time-decay',
    title: 'Time decay near expiration',
    objective: 'See how an at-the-money call’s price and theta change at 60, 30, 7, and 1 calendar day.',
    lookAt: 'The price column and the theta-per-day column. Then set the surface metric to theta or price with underlying × days.',
    why: 'With the strike held at the spot, less time usually means less extrinsic value, and the daily decay is not constant.',
    leavesOut: 'A real contract’s implied volatility often changes as expiration approaches. This comparison holds volatility fixed.',
    explorer: baseExplorer({ days: 30, sigma: 0.2 }),
    view: {
      axes: 'spot-days',
      metric: 'price',
      spotMin: 70,
      spotMax: 130,
      daysMin: 0,
      daysMax: 90,
      volMin: 0.05,
      volMax: 0.6,
    },
  },
  {
    id: 'gamma-ridge',
    title: 'The gamma ridge',
    objective: 'See gamma concentrate near the strike as expiration approaches.',
    lookAt: 'The gamma surface over underlying price and days. The ridge sits near the strike and gets sharper at short dated tenors.',
    why: 'Gamma is the curvature of price in the underlying. For a vanilla option it is largest near the strike and rises as time runs out, while volatility is held fixed.',
    leavesOut: 'At the exact expiration boundary gamma is undefined in this app, not zero. The surface masks that edge instead of drawing a spike as a finite number.',
    explorer: baseExplorer({ days: 21, sigma: 0.2 }),
    view: {
      axes: 'spot-days',
      metric: 'gamma',
      spotMin: 70,
      spotMax: 130,
      daysMin: 0,
      daysMax: 60,
      volMin: 0.05,
      volMax: 0.6,
    },
  },
  {
    id: 'vol-price',
    title: 'Volatility changes the price',
    objective: 'Hold spot, strike, time, rate, and dividend fixed, and compare several volatilities.',
    lookAt: 'Value and vega. In this model a higher volatility raises both the call and the put.',
    why: 'Vega is the slope of price with respect to volatility. It is positive for a long vanilla call or put here, so the price change and the vega reading should agree in sign for a small vol increase.',
    leavesOut: 'Market quotes can move by the spot and the implied volatility together. This preset changes only the model volatility.',
    explorer: baseExplorer({ days: 30, sigma: 0.2 }),
    view: {
      axes: 'spot-vol',
      metric: 'price',
      spotMin: 70,
      spotMax: 130,
      daysMin: 0,
      daysMax: 90,
      volMin: 0.05,
      volMax: 0.8,
    },
  },
  {
    id: 'itm-otm',
    title: 'Deep ITM versus deep OTM',
    objective: 'Compare delta and extrinsic value for a deep in-the-money call and a deep out-of-the-money call.',
    lookAt: 'Delta near 1 versus delta near 0, and how much of the price is extrinsic.',
    why: 'A deep in-the-money call moves almost one-for-one with the share. A deep out-of-the-money call is mostly a small, mostly extrinsic price.',
    leavesOut: 'Extrinsic value here is model price minus undiscounted intrinsic value. It is not a quoted bid-ask spread, and for European options it can be negative.',
    explorer: baseExplorer({ S: 160, K: 100, days: 30, sigma: 0.2, right: 'call' }),
    view: {
      axes: 'spot-days',
      metric: 'delta',
      spotMin: 40,
      spotMax: 180,
      daysMin: 0,
      daysMax: 90,
      volMin: 0.05,
      volMax: 0.6,
    },
  },
  {
    id: 'right-direction',
    title: 'Right direction, losing trade',
    objective:
      'Buy a call, then reprice after the underlying rises while time passes and volatility falls. Direction alone is not the P&L.',
    lookAt: 'The entry price, the spot-only reprice, and the full reprice. The spot-only case keeps the original time and volatility.',
    why: 'A long call can gain from the underlying and still lose money if the drop in time value and volatility is larger. The figures are full Black–Scholes–Merton reprices, not a scripted dollar loss.',
    leavesOut:
      'No transaction costs, no borrow, and no change in the interest rate or dividend. A traded option’s implied volatility is not guaranteed to fall just because the spot rose.',
    explorer: baseExplorer({ S: 105, K: 100, days: 7, sigma: 0.15, right: 'call' }),
    view: {
      axes: 'spot-vol',
      metric: 'price',
      spotMin: 80,
      spotMax: 130,
      daysMin: 0,
      daysMax: 90,
      volMin: 0.05,
      volMax: 0.6,
    },
  },
];

export function guideById(id: string | null): GuideDefinition | null {
  if (!id) return null;
  return GUIDES.find((guide) => guide.id === id) ?? null;
}

export interface TenorRow {
  days: number;
  price: number;
  thetaPerDay: number | null;
}

export function timeDecayRows(explorer: ExplorerInput, daysList: number[]): TenorRow[] {
  return daysList.map((days) => {
    const valuation = blackScholes(toMarket(explorer, { days }), explorer.right);
    return { days, price: valuation.price, thetaPerDay: valuation.thetaPerDay };
  });
}

export interface VolRow {
  sigma: number;
  price: number;
  vegaPerPoint: number | null;
}

export function volatilityRows(explorer: ExplorerInput, sigmas: number[]): VolRow[] {
  return sigmas.map((sigma) => {
    const valuation = blackScholes(toMarket(explorer, { sigma }), explorer.right);
    return { sigma, price: valuation.price, vegaPerPoint: valuation.vegaPerPoint };
  });
}

export interface MoneynessRow {
  label: string;
  S: number;
  price: number;
  intrinsic: number;
  extrinsic: number;
  delta: number | null;
}

export function itmOtmRows(explorer: ExplorerInput): MoneynessRow[] {
  const spots = [
    { label: 'Deep in the money (spot 160)', S: 160 },
    { label: 'At the money (spot 100)', S: 100 },
    { label: 'Deep out of the money (spot 60)', S: 60 },
  ];
  return spots.map((row) => {
    const valuation = blackScholes(toMarket(explorer, { S: row.S, K: 100, days: 30, sigma: 0.2 }), 'call');
    return {
      label: row.label,
      S: row.S,
      price: valuation.price,
      intrinsic: valuation.intrinsic,
      extrinsic: valuation.extrinsic,
      delta: valuation.delta,
    };
  });
}

export interface LosingTradeStory {
  entry: ExplorerInput;
  after: ExplorerInput;
  entryPrice: number;
  spotOnlyPrice: number;
  afterPrice: number;
  /** after − entry, per share. Negative is a loss. */
  pnlPerShare: number;
  /** spot-only − entry, per share. */
  directionalPerShare: number;
  multiplier: number;
}

export const LOSING_TRADE_ENTRY: ExplorerInput = baseExplorer({
  S: 100,
  K: 100,
  days: 60,
  sigma: 0.4,
  right: 'call',
});

export const LOSING_TRADE_AFTER: ExplorerInput = baseExplorer({
  S: 105,
  K: 100,
  days: 7,
  sigma: 0.15,
  right: 'call',
});

export function losingTradeStory(): LosingTradeStory {
  const entryPrice = blackScholes(toMarket(LOSING_TRADE_ENTRY), 'call').price;
  const spotOnlyPrice = blackScholes(
    toMarket(LOSING_TRADE_ENTRY, { S: LOSING_TRADE_AFTER.S }),
    'call',
  ).price;
  const afterPrice = blackScholes(toMarket(LOSING_TRADE_AFTER), 'call').price;
  return {
    entry: LOSING_TRADE_ENTRY,
    after: LOSING_TRADE_AFTER,
    entryPrice,
    spotOnlyPrice,
    afterPrice,
    pnlPerShare: afterPrice - entryPrice,
    directionalPerShare: spotOnlyPrice - entryPrice,
    multiplier: LOSING_TRADE_ENTRY.multiplier,
  };
}

function toMarket(
  explorer: ExplorerInput,
  patch: Partial<Pick<ExplorerInput, 'S' | 'K' | 'days' | 'sigma' | 'r' | 'q'>> = {},
): Market {
  const days = patch.days ?? explorer.days;
  return {
    S: patch.S ?? explorer.S,
    K: patch.K ?? explorer.K,
    T: yearsFromDays(days),
    sigma: patch.sigma ?? explorer.sigma,
    r: patch.r ?? explorer.r,
    q: patch.q ?? explorer.q,
  };
}

export function sameExplorer(a: ExplorerInput, b: ExplorerInput): boolean {
  return (
    a.right === b.right &&
    a.S === b.S &&
    a.K === b.K &&
    a.days === b.days &&
    a.sigma === b.sigma &&
    a.r === b.r &&
    a.q === b.q
  );
}

export function rightName(right: Right): string {
  return right === 'call' ? 'call' : 'put';
}
