/**
 * Versioned scenario URLs. Version 1 is a query string of decimals, not percents:
 * sigma=0.20 means 20% volatility. Malformed or unsupported versions fall back
 * field-by-field, or entirely, without throwing.
 */

import type { MetricName, Right } from '../quant/black-scholes';
import type { AxisPair, Resolution } from '../quant/surface';
import { optionLeg, stockLeg, type Leg } from '../quant/strategies';
import {
  DEFAULT_EXPLORER,
  DEFAULT_VIEW,
  defaultStrategy,
  type AppModel,
  type ExplorerInput,
  type StrategyInput,
  type TabId,
  type ViewInput,
} from './model';

export const SCENARIO_VERSION = 1;

export interface ParseResult {
  model: AppModel;
  warning: string | null;
}

const RIGHTS: Right[] = ['call', 'put'];
const TABS: TabId[] = ['explorer', 'strategy', 'american'];
const AXES: AxisPair[] = ['spot-days', 'spot-vol', 'days-vol'];
const METRICS: MetricName[] = ['price', 'delta', 'gamma', 'theta', 'vega', 'rho'];
const RESOLUTIONS: Resolution[] = ['low', 'medium', 'high'];

function isOneOf<T extends string>(value: string | null, allowed: readonly T[]): value is T {
  return value !== null && (allowed as readonly string[]).includes(value);
}

function num(value: string | null): number | null {
  if (value === null || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function bool(value: string | null, fallback: boolean): boolean {
  if (value === '1' || value === 'true') return true;
  if (value === '0' || value === 'false') return false;
  return fallback;
}

function readExplorer(params: URLSearchParams, warnings: string[]): ExplorerInput {
  const base = { ...DEFAULT_EXPLORER };
  const right = params.get('right');
  if (right !== null) {
    if (isOneOf(right, RIGHTS)) base.right = right;
    else warnings.push('Option type was not call or put and was reset.');
  }
  const S = num(params.get('S'));
  if (params.has('S')) {
    if (S !== null && S > 0) base.S = S;
    else warnings.push('Spot was invalid and was reset.');
  }
  const K = num(params.get('K'));
  if (params.has('K')) {
    if (K !== null && K > 0) base.K = K;
    else warnings.push('Strike was invalid and was reset.');
  }
  const days = num(params.get('days'));
  if (params.has('days')) {
    if (days !== null && days >= 0) base.days = days;
    else warnings.push('Days were invalid and were reset.');
  }
  const sigma = num(params.get('sigma'));
  if (params.has('sigma')) {
    if (sigma !== null && sigma >= 0) base.sigma = sigma;
    else warnings.push('Volatility was invalid and was reset. Use a decimal, so 20% is 0.20.');
  }
  const r = num(params.get('r'));
  if (params.has('r')) {
    if (r !== null) base.r = r;
    else warnings.push('The interest rate was invalid and was reset.');
  }
  const q = num(params.get('q'));
  if (params.has('q')) {
    if (q !== null) base.q = q;
    else warnings.push('Dividend yield was invalid and was reset.');
  }
  const contracts = num(params.get('qty'));
  if (params.has('qty')) {
    if (contracts !== null) base.contracts = contracts;
    else warnings.push('Contract quantity was invalid and was reset.');
  }
  const multiplier = num(params.get('mult'));
  if (params.has('mult')) {
    if (multiplier !== null && multiplier > 0) base.multiplier = multiplier;
    else warnings.push('Multiplier was invalid and was reset.');
  }
  return base;
}

function readView(params: URLSearchParams, warnings: string[]): ViewInput {
  const base = { ...DEFAULT_VIEW };
  const tab = params.get('tab');
  if (tab !== null) {
    if (isOneOf(tab, TABS)) base.tab = tab;
    else warnings.push('The tab was unrecognized and was reset.');
  }
  const axes = params.get('axes');
  if (axes !== null) {
    if (isOneOf(axes, AXES)) base.axes = axes;
    else warnings.push('The axis pair was unrecognized and was reset.');
  }
  const metric = params.get('metric');
  if (metric !== null) {
    if (isOneOf(metric, METRICS)) base.metric = metric;
    else warnings.push('The chart metric was unrecognized and was reset.');
  }
  const resolution = params.get('res');
  if (resolution !== null) {
    if (isOneOf(resolution, RESOLUTIONS)) base.resolution = resolution;
    else warnings.push('Resolution was unrecognized and was reset.');
  }
  const assignRange = (key: string, apply: (value: number) => void, allowNegative: boolean) => {
    if (!params.has(key)) return;
    const value = num(params.get(key));
    if (value === null || (!allowNegative && value < 0)) {
      warnings.push(`${key} was invalid and was reset.`);
      return;
    }
    apply(value);
  };
  assignRange('smin', (value) => { base.spotMin = value; }, false);
  assignRange('smax', (value) => { base.spotMax = value; }, false);
  assignRange('dmin', (value) => { base.daysMin = value; }, false);
  assignRange('dmax', (value) => { base.daysMax = value; }, false);
  assignRange('vmin', (value) => { base.volMin = value; }, false);
  assignRange('vmax', (value) => { base.volMax = value; }, false);
  if (base.spotMin <= 0) base.spotMin = DEFAULT_VIEW.spotMin;
  if (base.spotMax <= base.spotMin) {
    base.spotMax = base.spotMin + 1;
    warnings.push('The spot window was empty and was widened.');
  }
  if (base.daysMax <= base.daysMin) base.daysMax = base.daysMin + 1;
  if (base.volMax <= base.volMin) base.volMax = base.volMin + 0.01;
  base.showMarker = bool(params.get('marker'), base.showMarker);
  base.showContours = bool(params.get('contours'), base.showContours);
  base.robustColor = bool(params.get('robust'), base.robustColor);
  base.showPayoff = bool(params.get('payoff'), base.showPayoff);
  const slice = params.get('slice');
  if (slice === 'x' || slice === 'y') base.sliceFree = slice;
  else if (slice !== null) warnings.push('The slice axis was unrecognized and was reset.');
  if (params.has('held')) {
    const held = num(params.get('held'));
    base.sliceHeld = held;
    if (held === null) warnings.push('The held slice value was invalid and now follows the scenario.');
  }
  if (params.has('steps')) {
    const steps = num(params.get('steps'));
    if (steps !== null && steps >= 1) base.steps = Math.round(steps);
    else warnings.push('The binomial step count was invalid and was reset.');
  }
  const guide = params.get('guide');
  base.guide = guide && guide.trim() !== '' ? guide : null;
  return base;
}

function parseLegs(raw: string | null, warnings: string[]): Leg[] | null {
  if (raw === null) return null;
  if (raw.trim() === '') return [];
  const legs: Leg[] = [];
  const parts = raw.split(';').filter((part) => part.length > 0);
  for (const part of parts) {
    const bits = part.split(',');
    const kind = bits[0];
    if (kind === 'o') {
      const right = bits[1];
      const strike = Number(bits[2]);
      const quantity = Number(bits[3]);
      const entry = Number(bits[4]);
      const multiplier = Number(bits[5]);
      if (
        (right === 'call' || right === 'put') &&
        Number.isFinite(strike) &&
        strike > 0 &&
        Number.isFinite(quantity) &&
        Number.isFinite(entry) &&
        Number.isFinite(multiplier) &&
        multiplier > 0
      ) {
        legs.push(optionLeg({ right, strike, quantity, entryPremium: entry, multiplier }));
      } else {
        warnings.push('An option leg in the link was skipped.');
      }
    } else if (kind === 's') {
      const quantity = Number(bits[1]);
      const entry = Number(bits[2]);
      if (Number.isFinite(quantity) && Number.isFinite(entry)) {
        legs.push(stockLeg({ quantity, entryPrice: entry }));
      } else {
        warnings.push('A stock leg in the link was skipped.');
      }
    } else {
      warnings.push('A strategy leg in the link was skipped.');
    }
  }
  return legs;
}

function readStrategy(params: URLSearchParams, explorer: ExplorerInput, warnings: string[]): StrategyInput {
  const fallback = defaultStrategy(explorer);
  const legs = parseLegs(params.get('legs'), warnings);
  return {
    legs: legs ?? fallback.legs,
    showSurface: bool(params.get('pnl3d'), fallback.showSurface),
  };
}

export function parseScenario(search: string): ParseResult {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  if ([...params.keys()].length === 0) {
    const model = { explorer: { ...DEFAULT_EXPLORER }, view: { ...DEFAULT_VIEW }, strategy: defaultStrategy() };
    return { model, warning: null };
  }
  const version = params.get('v');
  if (version !== null && version !== String(SCENARIO_VERSION)) {
    const model = { explorer: { ...DEFAULT_EXPLORER }, view: { ...DEFAULT_VIEW }, strategy: defaultStrategy() };
    return {
      model,
      warning: `This link uses scenario version “${version}”, which this page does not read. Defaults were loaded.`,
    };
  }
  const warnings: string[] = [];
  const explorer = readExplorer(params, warnings);
  const view = readView(params, warnings);
  const strategy = readStrategy(params, explorer, warnings);
  const warning =
    warnings.length > 0
      ? `Some of this link could not be read, so those fields were reset. ${warnings.slice(0, 3).join(' ')}`
      : null;
  return { model: { explorer, view, strategy }, warning };
}

function fmt(value: number): string {
  if (Object.is(value, -0)) return '0';
  const text = String(value);
  return text;
}

export function serializeLegs(legs: Leg[]): string {
  return legs
    .map((leg) =>
      leg.type === 'option'
        ? ['o', leg.right, fmt(leg.strike), fmt(leg.quantity), fmt(leg.entryPremium), fmt(leg.multiplier)].join(',')
        : ['s', fmt(leg.quantity), fmt(leg.entryPrice)].join(','),
    )
    .join(';');
}

export function serializeScenario(model: AppModel): string {
  const { explorer, view, strategy } = model;
  const params = new URLSearchParams();
  params.set('v', String(SCENARIO_VERSION));
  params.set('tab', view.tab);
  params.set('right', explorer.right);
  params.set('S', fmt(explorer.S));
  params.set('K', fmt(explorer.K));
  params.set('days', fmt(explorer.days));
  params.set('sigma', fmt(explorer.sigma));
  params.set('r', fmt(explorer.r));
  params.set('q', fmt(explorer.q));
  params.set('qty', fmt(explorer.contracts));
  params.set('mult', fmt(explorer.multiplier));
  params.set('axes', view.axes);
  params.set('metric', view.metric);
  params.set('res', view.resolution);
  params.set('smin', fmt(view.spotMin));
  params.set('smax', fmt(view.spotMax));
  params.set('dmin', fmt(view.daysMin));
  params.set('dmax', fmt(view.daysMax));
  params.set('vmin', fmt(view.volMin));
  params.set('vmax', fmt(view.volMax));
  params.set('marker', view.showMarker ? '1' : '0');
  params.set('contours', view.showContours ? '1' : '0');
  params.set('robust', view.robustColor ? '1' : '0');
  params.set('slice', view.sliceFree);
  if (view.sliceHeld !== null) params.set('held', fmt(view.sliceHeld));
  params.set('payoff', view.showPayoff ? '1' : '0');
  params.set('steps', fmt(view.steps));
  if (view.guide) params.set('guide', view.guide);
  params.set('legs', serializeLegs(strategy.legs));
  params.set('pnl3d', strategy.showSurface ? '1' : '0');
  const query = params.toString();
  return query ? `?${query}` : '';
}
