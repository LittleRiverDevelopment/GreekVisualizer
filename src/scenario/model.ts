import { yearsFromDays, type MetricName, type Right } from '../quant/black-scholes';
import type { AxisPair, Resolution } from '../quant/surface';
import { modelPremium, optionLeg, stockLeg, type Leg } from '../quant/strategies';

export type TabId = 'explorer' | 'strategy' | 'american';

export interface ExplorerInput {
  right: Right;
  S: number;
  K: number;
  days: number;
  /** Annualized volatility as a decimal. */
  sigma: number;
  /** Continuous risk-free rate as a decimal. */
  r: number;
  /** Continuous dividend yield as a decimal. */
  q: number;
  /** Signed contracts for the single-option position strip. */
  contracts: number;
  multiplier: number;
}

export interface ViewInput {
  tab: TabId;
  axes: AxisPair;
  metric: MetricName;
  resolution: Resolution;
  spotMin: number;
  spotMax: number;
  daysMin: number;
  daysMax: number;
  /** Decimal volatility. */
  volMin: number;
  volMax: number;
  showMarker: boolean;
  showContours: boolean;
  robustColor: boolean;
  /** Which axis of the current pair is the free axis of the 2D slice. */
  sliceFree: 'x' | 'y';
  /** Null follows the live scenario value of the held axis. */
  sliceHeld: number | null;
  showPayoff: boolean;
  steps: number;
  /** Active guided-scenario id, or null. */
  guide: string | null;
}

export interface StrategyInput {
  legs: Leg[];
  showSurface: boolean;
}

export interface AppModel {
  explorer: ExplorerInput;
  view: ViewInput;
  strategy: StrategyInput;
}

export const DEFAULT_EXPLORER: ExplorerInput = {
  right: 'call',
  S: 100,
  K: 100,
  days: 30,
  sigma: 0.2,
  r: 0.05,
  q: 0,
  contracts: 1,
  multiplier: 100,
};

export const DEFAULT_VIEW: ViewInput = {
  tab: 'explorer',
  axes: 'spot-days',
  metric: 'price',
  resolution: 'medium',
  spotMin: 50,
  spotMax: 150,
  daysMin: 0,
  daysMax: 180,
  volMin: 0,
  volMax: 0.8,
  showMarker: true,
  showContours: false,
  robustColor: false,
  sliceFree: 'x',
  sliceHeld: null,
  showPayoff: true,
  steps: 100,
  guide: null,
};

export function marketFromExplorer(input: ExplorerInput, strike = input.K) {
  return {
    S: input.S,
    K: strike,
    T: yearsFromDays(input.days),
    sigma: input.sigma,
    r: input.r,
    q: input.q,
  };
}

export function defaultStrategy(explorer: ExplorerInput = DEFAULT_EXPLORER): StrategyInput {
  const market = marketFromExplorer(explorer);
  const premium = modelPremium(market, 'call', explorer.K);
  return {
    showSurface: false,
    legs: [
      optionLeg({
        right: 'call',
        strike: explorer.K,
        quantity: 1,
        entryPremium: premium,
        multiplier: explorer.multiplier,
      }),
    ],
  };
}

export function defaultModel(): AppModel {
  const explorer = { ...DEFAULT_EXPLORER };
  return { explorer, view: { ...DEFAULT_VIEW }, strategy: defaultStrategy(explorer) };
}

export type StrategyPresetId =
  | 'long-call'
  | 'long-put'
  | 'covered-call'
  | 'protective-put'
  | 'bull-call-spread'
  | 'bear-put-spread'
  | 'long-straddle'
  | 'long-strangle'
  | 'iron-condor';

export const STRATEGY_PRESETS: { id: StrategyPresetId; label: string; blurb: string }[] = [
  { id: 'long-call', label: 'Long call', blurb: 'Buy one call. Upside is open; loss is limited to the premium.' },
  { id: 'long-put', label: 'Long put', blurb: 'Buy one put. Downside profit is limited by the spot hitting zero.' },
  { id: 'covered-call', label: 'Covered call', blurb: 'Long 100 shares and short one call with multiplier 100.' },
  { id: 'protective-put', label: 'Protective put', blurb: 'Long 100 shares and long one put.' },
  { id: 'bull-call-spread', label: 'Bull call spread', blurb: 'Long a call and short a higher-strike call. Both sides are bounded.' },
  { id: 'bear-put-spread', label: 'Bear put spread', blurb: 'Long a higher-strike put and short a lower-strike put.' },
  { id: 'long-straddle', label: 'Long straddle', blurb: 'Long a call and a put at the same strike.' },
  { id: 'long-strangle', label: 'Long strangle', blurb: 'Long an out-of-the-money put and an out-of-the-money call.' },
  { id: 'iron-condor', label: 'Iron condor', blurb: 'Short a put spread and short a call spread. Profit is capped on both sides.' },
];

function safeStrike(strike: number): number {
  return strike > 0 ? strike : 1;
}

export function buildStrategyPreset(id: StrategyPresetId, explorer: ExplorerInput): Leg[] {
  const market = marketFromExplorer(explorer);
  const mult = explorer.multiplier > 0 ? explorer.multiplier : 100;
  const k = safeStrike(explorer.K);
  const call = (strike: number, quantity: number) =>
    optionLeg({
      right: 'call',
      strike: safeStrike(strike),
      quantity,
      entryPremium: modelPremium(market, 'call', safeStrike(strike)),
      multiplier: mult,
    });
  const put = (strike: number, quantity: number) =>
    optionLeg({
      right: 'put',
      strike: safeStrike(strike),
      quantity,
      entryPremium: modelPremium(market, 'put', safeStrike(strike)),
      multiplier: mult,
    });
  const shares = mult;
  switch (id) {
    case 'long-call':
      return [call(k, 1)];
    case 'long-put':
      return [put(k, 1)];
    case 'covered-call':
      return [stockLeg({ quantity: shares, entryPrice: explorer.S }), call(k, -1)];
    case 'protective-put':
      return [stockLeg({ quantity: shares, entryPrice: explorer.S }), put(k, 1)];
    case 'bull-call-spread':
      return [call(k, 1), call(k + 10, -1)];
    case 'bear-put-spread':
      return [put(k + 10, 1), put(k, -1)];
    case 'long-straddle':
      return [call(k, 1), put(k, 1)];
    case 'long-strangle':
      return [put(Math.max(1, k - 10), 1), call(k + 10, 1)];
    case 'iron-condor':
      return [
        put(Math.max(1, k - 15), 1),
        put(Math.max(1, k - 5), -1),
        call(k + 5, -1),
        call(k + 15, 1),
      ];
    default: {
      const exhaustive: never = id;
      return exhaustive;
    }
  }
}
