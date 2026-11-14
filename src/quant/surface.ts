/**
 * Surface sampling is separate from rendering. Points where a Greek is
 * undefined are null. Callers that hand data to Plotly may convert those
 * nulls to NaN so the surface leaves a hole; that conversion must not invent zeros.
 */

import {
  blackScholes,
  metricOf,
  type Market,
  type MetricName,
  type Right,
  yearsFromDays,
} from './black-scholes';

export type AxisId = 'spot' | 'days' | 'vol';
export type AxisPair = 'spot-days' | 'spot-vol' | 'days-vol';
export type Resolution = 'low' | 'medium' | 'high';

export const RESOLUTION_SIZE: Record<Resolution, number> = {
  low: 25,
  medium: 45,
  high: 61,
};

export interface AxisSpec {
  id: AxisId;
  min: number;
  max: number;
}

export interface SurfaceRequest {
  right: Right;
  /** Fixed market. The two varying axes overwrite S, T, or sigma. */
  market: Market;
  /** Days corresponding to market.T. Used when an axis holds days fixed. */
  days: number;
  pair: AxisPair;
  metric: MetricName;
  x: AxisSpec;
  y: AxisSpec;
  resolution: Resolution;
}

export interface SurfaceGrid {
  x: number[];
  y: number[];
  /** z[row][col] matches y[row], x[col]. Null means the Greek is undefined there. */
  z: (number | null)[][];
  xAxis: AxisId;
  yAxis: AxisId;
}

export function axesForPair(pair: AxisPair): [AxisId, AxisId] {
  if (pair === 'spot-days') return ['spot', 'days'];
  if (pair === 'spot-vol') return ['spot', 'vol'];
  return ['days', 'vol'];
}

export function linspace(min: number, max: number, count: number): number[] {
  const n = Math.max(2, Math.floor(count));
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  const out: number[] = [];
  for (let i = 0; i < n; i += 1) out.push(lo + ((hi - lo) * i) / (n - 1));
  return out;
}

function withAxis(market: Market, days: number, axis: AxisId, value: number): { market: Market; days: number } {
  if (axis === 'spot') return { market: { ...market, S: value }, days };
  if (axis === 'days') return { market: { ...market, T: yearsFromDays(value) }, days: value };
  return { market: { ...market, sigma: value }, days };
}

export function sampleSurface(request: SurfaceRequest): SurfaceGrid {
  const [xAxis, yAxis] = axesForPair(request.pair);
  const size = RESOLUTION_SIZE[request.resolution];
  const x = linspace(request.x.min, request.x.max, size);
  const y = linspace(request.y.min, request.y.max, size);
  const z: (number | null)[][] = [];
  for (const yValue of y) {
    const row: (number | null)[] = [];
    for (const xValue of x) {
      let state = { market: request.market, days: request.days };
      state = withAxis(state.market, state.days, xAxis, xValue);
      state = withAxis(state.market, state.days, yAxis, yValue);
      if (!(state.market.S > 0)) {
        row.push(null);
        continue;
      }
      const valuation = blackScholes(state.market, request.right);
      row.push(metricOf(valuation, request.metric));
    }
    z.push(row);
  }
  return { x, y, z, xAxis, yAxis };
}

export function sampleSlice(
  request: Omit<SurfaceRequest, 'resolution' | 'x' | 'y'> & {
    free: AxisId;
    held: AxisId;
    freeMin: number;
    freeMax: number;
    heldValue: number;
    count?: number;
  },
): { x: number[]; y: (number | null)[] } {
  const count = request.count ?? 80;
  const xs = linspace(request.freeMin, request.freeMax, count);
  const ys = xs.map((freeValue) => {
    let state = { market: request.market, days: request.days };
    state = withAxis(state.market, state.days, request.held, request.heldValue);
    state = withAxis(state.market, state.days, request.free, freeValue);
    if (!(state.market.S > 0)) return null;
    return metricOf(blackScholes(state.market, request.right), request.metric);
  });
  return { x: xs, y: ys };
}

/** Plotly surfaces leave a hole on NaN. Nulls from the sampler become NaN here and nowhere else. */
export function nullsToNaN(grid: (number | null)[][]): number[][] {
  return grid.map((row) => row.map((value) => (value === null ? Number.NaN : value)));
}

export function axisTitle(axis: AxisId): string {
  if (axis === 'spot') return 'Underlying price ($)';
  if (axis === 'days') return 'Time to expiration (calendar days)';
  return 'Volatility (%)';
}

/** Volatility is sampled as a decimal and displayed as a percent. Other axes are unchanged. */
export function displayCoordinate(axis: AxisId, value: number): number {
  return axis === 'vol' ? value * 100 : value;
}
