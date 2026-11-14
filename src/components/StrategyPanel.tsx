import { useMemo, useState } from 'react';
import { useDebounced } from '../lib/hooks';
import { formatMoney, formatNumber, trimNumber } from '../lib/format';
import {
  analyzeStrategy,
  modelPnl,
  modelPremium,
  optionLeg,
  sampleSpots,
  sampleStrategyPnl,
  stockLeg,
  strategyStrikes,
  type Extremum,
  type Leg,
  type OptionLeg,
} from '../quant/strategies';
import { yearsFromDays } from '../quant/black-scholes';
import { STRATEGY_PRESETS, buildStrategyPreset, marketFromExplorer, type ExplorerInput, type StrategyPresetId, type ViewInput } from '../scenario/model';
import { NumberField } from './NumberField';
import { PLOT_CONFIG, PlotView } from './PlotView';

interface StrategyPanelProps {
  explorer: ExplorerInput;
  view: ViewInput;
  legs: Leg[];
  showSurface: boolean;
  theme: 'light' | 'dark';
  webgl: boolean;
  onExplorer: (patch: Partial<ExplorerInput>) => void;
  onView: (patch: Partial<ViewInput>) => void;
  onLegs: (legs: Leg[]) => void;
  onShowSurface: (show: boolean) => void;
}

export function StrategyPanel(props: StrategyPanelProps) {
  const { explorer, view, legs, showSurface, theme, webgl, onExplorer, onView, onLegs, onShowSurface } = props;
  const [open, setOpen] = useState(true);
  const market = marketFromExplorer(explorer);
  const stats = useMemo(() => analyzeStrategy(market, legs), [market, legs]);
  const colors = theme === 'dark'
    ? { paper: '#1b212b', font: '#e8edf2', grid: '#3a4656', accent: '#8fd0cb', second: '#e6c27a' }
    : { paper: '#ffffff', font: '#1b2330', grid: '#d5dce4', accent: '#0e5c58', second: '#7a4e00' };

  function updateLeg(id: string, patch: Partial<OptionLeg> | { quantity?: number; entryPrice?: number }) {
    onLegs(
      legs.map((leg) => {
        if (leg.id !== id) return leg;
        if (leg.type === 'stock') {
          const stockPatch = patch as { quantity?: number; entryPrice?: number };
          return { ...leg, quantity: stockPatch.quantity ?? leg.quantity, entryPrice: stockPatch.entryPrice ?? leg.entryPrice };
        }
        return { ...leg, ...patch } as OptionLeg;
      }),
    );
  }

  function resetEntries() {
    onLegs(
      legs.map((leg) => {
        if (leg.type === 'stock') return { ...leg, entryPrice: explorer.S };
        return { ...leg, entryPremium: modelPremium(market, leg.right, leg.strike) };
      }),
    );
  }

  function addOption(right: 'call' | 'put') {
    const strike = explorer.K > 0 ? explorer.K : 100;
    onLegs([
      ...legs,
      optionLeg({
        right,
        strike,
        quantity: 1,
        entryPremium: modelPremium(market, right, strike),
        multiplier: explorer.multiplier > 0 ? explorer.multiplier : 100,
      }),
    ]);
  }

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      <div className="min-w-0">
        <button type="button" className="btn mb-2 w-full lg:hidden" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          {open ? 'Hide strategy inputs' : 'Show strategy inputs'}
        </button>
        <div className={open ? 'panel space-y-4' : 'hidden lg:block panel space-y-4'}>
          <p className="text-sm leading-6">
            Every option leg uses one expiration: <span className="tabular">{explorer.days}</span> calendar days. This version does not price calendar spreads.
          </p>
          <div className="flex flex-wrap gap-2">
            {STRATEGY_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className="btn"
                onClick={() => onLegs(buildStrategyPreset(preset.id as StrategyPresetId, explorer))}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <NumberField label="Spot" value={explorer.S} min={20} max={200} step={1} unit="$" hint="Shared by every leg. Entry prices do not follow this." validate={(value) => (value > 0 ? null : 'Spot must be greater than 0.')} onChange={(S) => onExplorer({ S })} />
          <NumberField label="Days to expiration" value={explorer.days} min={0} max={730} step={1} unit="days" hint="Shared expiration for every option." validate={(value) => (value >= 0 ? null : 'Days cannot be negative.')} onChange={(days) => onExplorer({ days })} />
          <NumberField label="Volatility" value={explorer.sigma * 100} min={0} max={150} step={0.5} unit="%" hint="Used for the model value. Expiration payoff does not depend on it." validate={(value) => (value >= 0 ? null : 'Volatility cannot be negative.')} onChange={(percent) => onExplorer({ sigma: percent / 100 })} />
          <NumberField label="Risk-free rate" value={explorer.r * 100} min={-5} max={20} step={0.1} unit="%" hint="Continuous rate, shared by the model value." onChange={(percent) => onExplorer({ r: percent / 100 })} />
          <NumberField label="Dividend yield" value={explorer.q * 100} min={0} max={15} step={0.1} unit="%" hint="Continuous yield. Dividend cash flows are not added to P&L." onChange={(percent) => onExplorer({ q: percent / 100 })} />
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn" onClick={() => addOption('call')}>Add call</button>
            <button type="button" className="btn" onClick={() => addOption('put')}>Add put</button>
            <button type="button" className="btn" onClick={() => onLegs([...legs, stockLeg({ quantity: 100, entryPrice: explorer.S })])}>Add stock</button>
            <button type="button" className="btn" onClick={resetEntries}>Reset entries to model</button>
          </div>
        </div>
      </div>
      <div className="min-w-0 space-y-4">
        <section className="panel space-y-3">
          <h2 className="text-base font-semibold">Legs</h2>
          <p className="text-sm leading-6 text-muted">
            Entry premiums start at the model value and stay fixed while the scenario changes, until you reset the trade.
            Buy is a positive quantity and sell is negative. Current theoretical value is not P&L.
          </p>
          {legs.length === 0 ? <p className="text-sm">No legs yet. Add an option or stock leg, or choose a preset.</p> : null}
          <div className="space-y-3">
            {legs.map((leg, index) => (
              <LegEditor
                key={leg.id}
                leg={leg}
                index={index}
                onChange={(patch) => updateLeg(leg.id, patch)}
                onRemove={() => onLegs(legs.filter((item) => item.id !== leg.id))}
                onUseModel={() => {
                  if (leg.type === 'option') updateLeg(leg.id, { entryPremium: modelPremium(market, leg.right, leg.strike) });
                  else updateLeg(leg.id, { entryPrice: explorer.S });
                }}
              />
            ))}
          </div>
        </section>
        <Stats stats={stats} days={explorer.days} />
        <PnlCharts
          explorer={explorer}
          view={view}
          legs={legs}
          colors={colors}
          showSurface={showSurface}
          webgl={webgl}
          onView={onView}
          onShowSurface={onShowSurface}
        />
      </div>
    </div>
  );
}

function LegEditor({
  leg,
  index,
  onChange,
  onRemove,
  onUseModel,
}: {
  leg: Leg;
  index: number;
  onChange: (patch: Partial<OptionLeg> | { quantity?: number; entryPrice?: number }) => void;
  onRemove: () => void;
  onUseModel: () => void;
}) {
  const title = leg.type === 'stock' ? `Stock leg ${index + 1}` : `${leg.right === 'call' ? 'Call' : 'Put'} leg ${index + 1}`;
  return (
    <fieldset className="rounded-md border border-line p-3">
      <legend className="px-1 text-sm font-medium">{title}</legend>
      {leg.type === 'option' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            Right
            <select
              aria-label={`${title} right`}
              value={leg.right}
              onChange={(event) => onChange({ right: event.target.value as 'call' | 'put' })}
              className="mt-1 w-full rounded-md border border-line bg-card px-2 py-1.5"
            >
              <option value="call">Call</option>
              <option value="put">Put</option>
            </select>
          </label>
          <label className="text-sm">
            Strike ($)
            <input aria-label={`${title} strike`} type="number" step="any" value={trimNumber(leg.strike)} onChange={(event) => onChange({ strike: Number(event.target.value) })} className="tabular mt-1 w-full rounded-md border border-line bg-card px-2 py-1.5" />
          </label>
          <label className="text-sm">
            Quantity (contracts, signed)
            <input aria-label={`${title} quantity`} type="number" step="any" value={trimNumber(leg.quantity)} onChange={(event) => onChange({ quantity: Number(event.target.value) })} className="tabular mt-1 w-full rounded-md border border-line bg-card px-2 py-1.5" />
          </label>
          <label className="text-sm">
            Entry premium ($ per share)
            <input aria-label={`${title} entry premium`} type="number" step="any" value={inputNumber(leg.entryPremium)} onChange={(event) => onChange({ entryPremium: Number(event.target.value) })} className="tabular mt-1 w-full rounded-md border border-line bg-card px-2 py-1.5" />
          </label>
          <label className="text-sm">
            Multiplier
            <input aria-label={`${title} multiplier`} type="number" step="any" value={trimNumber(leg.multiplier)} onChange={(event) => onChange({ multiplier: Number(event.target.value) })} className="tabular mt-1 w-full rounded-md border border-line bg-card px-2 py-1.5" />
          </label>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            Quantity (shares, signed)
            <input aria-label={`${title} quantity`} type="number" step="any" value={trimNumber(leg.quantity)} onChange={(event) => onChange({ quantity: Number(event.target.value) })} className="tabular mt-1 w-full rounded-md border border-line bg-card px-2 py-1.5" />
          </label>
          <label className="text-sm">
            Entry price ($ per share)
            <input aria-label={`${title} entry price`} type="number" step="any" value={trimNumber(leg.entryPrice)} onChange={(event) => onChange({ entryPrice: Number(event.target.value) })} className="tabular mt-1 w-full rounded-md border border-line bg-card px-2 py-1.5" />
          </label>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="btn" onClick={onUseModel}>
          Set entry to current model
        </button>
        <button type="button" className="btn" onClick={onRemove}>
          Remove {title}
        </button>
      </div>
    </fieldset>
  );
}

function Stats({ stats, days }: { stats: ReturnType<typeof analyzeStrategy>; days: number }) {
  return (
    <section className="panel" aria-label="Strategy statistics">
      <h2 className="text-base font-semibold">Value, payoff, and P&L</h2>
      <p className="mt-2 text-sm leading-6">
        Net entry is the cash paid to open the position. Positive is a debit and negative is a credit. Current model value
        marks every option with Black–Scholes–Merton and the stock at the spot. P&L subtracts the fixed entry. Fees,
        financing, and dividend cash flows are excluded. {days === 0 ? 'Time is zero, so the model value matches the expiration payoff. Greeks are undefined at expiration.' : ''}
      </p>
      <dl className="mt-3 grid gap-3 sm:grid-cols-3">
        <Stat label="Net entry" value={moneyOr(stats.netEntry)} hint={stats.netEntry > 0 ? 'debit' : stats.netEntry < 0 ? 'credit' : 'flat'} />
        <Stat label="Current model value" value={moneyOr(stats.currentValue)} hint="not P&L" />
        <Stat label="Current model P&L" value={moneyOr(stats.pnl)} hint="value minus fixed entry" />
      </dl>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
        <Stat label="Expiration breakevens" value={breakevenText(stats.breakevens)} hint="solved from the payoff, not from the chart window" />
        <Stat label="Max expiration profit" value={extremumText(stats.maxProfit)} hint={stats.maxProfit.unlimited ? 'from the high-side slope' : 'finite on S ≥ 0'} />
        <Stat label="Max expiration loss" value={extremumText(stats.maxLoss)} hint={stats.maxLoss.unlimited ? 'from the high-side slope' : 'the downside of these vanillas is finite at S = 0'} />
        <Stat label="High-side slope" value={`${formatNumber(stats.slopeHigh, 4)} $ P&L per $1`} hint="as the underlying rises without bound" />
      </dl>
      <h3 className="mt-4 text-sm font-semibold">Aggregate position Greeks</h3>
      {stats.greeks.undefinedReason ? <p className="mt-1 text-sm">{stats.greeks.undefinedReason}</p> : null}
      <dl className="mt-2 grid gap-3 sm:grid-cols-3">
        <Stat label="Delta" value={greek(stats.greeks.delta)} hint="$ per $1 underlying" />
        <Stat label="Gamma" value={greek(stats.greeks.gamma)} hint="change in delta per $1" />
        <Stat label="Theta" value={greek(stats.greeks.thetaPerDay)} hint="$ per calendar day" />
        <Stat label="Vega" value={greek(stats.greeks.vegaPerPoint)} hint="$ per 1 vol point" />
        <Stat label="Rho" value={greek(stats.greeks.rhoPerPoint)} hint="$ per 1 rate point" />
      </dl>
      <p className="mt-2 text-xs text-muted">
        Option Greeks are per share × signed contracts × multiplier. Stock delta is the signed share count. Other stock Greeks are zero.
      </p>
      {stats.warnings.length > 0 ? (
        <ul className="mt-2 list-disc pl-5 text-sm text-danger">
          {stats.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function PnlCharts({
  explorer,
  view,
  legs,
  colors,
  showSurface,
  webgl,
  onView,
  onShowSurface,
}: {
  explorer: ExplorerInput;
  view: ViewInput;
  legs: Leg[];
  colors: { paper: string; font: string; grid: string; accent: string; second: string };
  showSurface: boolean;
  webgl: boolean;
  onView: (patch: Partial<ViewInput>) => void;
  onShowSurface: (show: boolean) => void;
}) {
  const debounced = useDebounced({ explorer, view, legs, showSurface }, 60);
  const chart = useMemo(() => {
    const spots = sampleSpots(debounced.view.spotMin, debounced.view.spotMax, strategyStrikes(debounced.legs), 181);
    const rows = sampleStrategyPnl(marketFromExplorer(debounced.explorer), debounced.legs, spots);
    return { spots, rows };
  }, [debounced]);
  const layout2d = (title: string) => ({
    paper_bgcolor: colors.paper,
    plot_bgcolor: colors.paper,
    font: { family: 'IBM Plex Sans, sans-serif', color: colors.font, size: 12 },
    margin: { l: 64, r: 16, t: 28, b: 48 },
    title: { text: title, font: { size: 13 } },
    xaxis: { title: { text: 'Underlying price ($)' }, gridcolor: colors.grid },
    yaxis: { title: { text: 'P&L ($)' }, gridcolor: colors.grid, zeroline: true },
    showlegend: false,
  });
  const surface = useMemo(() => {
    if (!debounced.showSurface) return null;
    const spots = sampleSpots(debounced.view.spotMin, debounced.view.spotMax, strategyStrikes(debounced.legs), 31);
    const dayCount = 31;
    const days = Array.from({ length: dayCount }, (_, i) => (debounced.view.daysMax * i) / (dayCount - 1));
    const z = days.map((day) =>
      spots.map((spot) => {
        try {
          return modelPnl(
            { ...marketFromExplorer(debounced.explorer), S: spot, T: yearsFromDays(day) },
            debounced.legs,
          );
        } catch {
          return null;
        }
      }),
    );
    return { spots, days, z };
  }, [debounced]);

  return (
    <section className="space-y-4" aria-label="Strategy charts">
      <div className="panel">
        <h2 className="text-base font-semibold">Expiration P&L</h2>
        <p className="mt-1 text-sm leading-6">
          Piecewise-linear payoff minus fixed entry cost, including stock cost basis. Unlimited profit or loss is decided
          from the tail slope, not from the edges of this window. Window: ${view.spotMin} to ${view.spotMax}.
        </p>
        <PlotView
          data={[
            {
              type: 'scatter',
              mode: 'lines',
              x: chart.spots,
              y: chart.rows.map((row) => row.expiration),
              line: { color: colors.accent, width: 2.5 },
              hovertemplate: 'Underlying %{x:.2f}<br>Expiration P&L %{y:.2f}<extra></extra>',
            },
          ]}
          layout={layout2d('')}
          config={PLOT_CONFIG}
          heightClass="h-[360px]"
          label="Expiration profit and loss versus underlying price"
        />
      </div>
      <div className="panel">
        <h2 className="text-base font-semibold">Model P&L before expiration</h2>
        <p className="mt-1 text-sm leading-6">
          Black–Scholes–Merton value at {explorer.days} days and {formatNumber(explorer.sigma * 100, 2)}% volatility, minus
          the same fixed entry. This is not the expiration payoff unless time is zero.
        </p>
        <PlotView
          data={[
            {
              type: 'scatter',
              mode: 'lines',
              name: 'Model P&L',
              x: chart.spots,
              y: chart.rows.map((row) => row.model),
              line: { color: colors.second, width: 2.5, dash: 'dash' },
              hovertemplate: 'Underlying %{x:.2f}<br>Model P&L %{y:.2f}<extra></extra>',
            },
          ]}
          layout={layout2d('')}
          config={PLOT_CONFIG}
          heightClass="h-[360px]"
          label="Model profit and loss versus underlying price before expiration"
        />
      </div>
      <div className="panel">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={showSurface} onChange={(event) => onShowSurface(event.target.checked)} />
          Show model P&L against underlying and time
        </label>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <NumberField label="Chart spot from" value={view.spotMin} min={1} max={view.spotMax} step={1} unit="$" hint="Chart window only." validate={(value) => (value > 0 && value < view.spotMax ? null : 'Minimum must be positive and below the maximum.')} onChange={(spotMin) => onView({ spotMin })} />
          <NumberField label="Chart spot to" value={view.spotMax} min={view.spotMin} max={500} step={1} unit="$" hint="Does not decide whether a tail is unlimited." validate={(value) => (value > view.spotMin ? null : 'Maximum must exceed the minimum.')} onChange={(spotMax) => onView({ spotMax })} />
        </div>
        {showSurface && !webgl ? (
          <p className="mt-3 text-sm">The 3D P&L surface needs WebGL. The 2D charts above are the fallback.</p>
        ) : null}
        {showSurface && webgl && surface ? (
          <div className="mt-3">
            <PlotView
              data={[
                {
                  type: 'surface',
                  x: surface.spots,
                  y: surface.days,
                  z: surface.z.map((row) => row.map((value) => (value === null ? Number.NaN : value))),
                  colorscale: 'RdBu',
                  cmid: 0,
                  colorbar: { title: { text: 'Model P&L ($)' }, thickness: 14 },
                  hovertemplate: 'Underlying %{x:.2f}<br>Days %{y:.2f}<br>P&L %{z:.2f}<extra></extra>',
                },
              ]}
              layout={{
                paper_bgcolor: colors.paper,
                font: { color: colors.font, family: 'IBM Plex Sans, sans-serif', size: 12 },
                margin: { l: 0, r: 0, t: 8, b: 0 },
                scene: {
                  uirevision: 'pnl-camera',
                  xaxis: { title: { text: 'Underlying price ($)' } },
                  yaxis: { title: { text: 'Time to expiration (calendar days)' } },
                  zaxis: { title: { text: 'Model P&L ($)' } },
                },
              }}
              config={PLOT_CONFIG}
              label="Model profit and loss versus underlying price and calendar days"
            />
            <p className="mt-2 text-xs text-muted">Diverging colors are centered at zero P&L. The surface is model P&L, not expiration payoff, except along the day = 0 edge.</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div>
      <dt className="text-xs font-medium tracking-wide text-muted uppercase">{label}</dt>
      <dd className="tabular mt-1 text-sm text-ink">{value}</dd>
      <dd className="text-xs text-muted">{hint}</dd>
    </div>
  );
}

function inputNumber(value: number): string {
  if (!Number.isFinite(value)) return '';
  return String(Math.round(value * 1e6) / 1e6);
}

function moneyOr(value: number): string {
  return Number.isFinite(value) ? formatMoney(value, 2) : 'unavailable';
}

function greek(value: number | null): string {
  return value === null ? 'undefined at this boundary' : formatNumber(value, 4);
}

function extremumText(item: Extremum): string {
  if (item.unlimited) return item.where;
  if (item.amount === null) return 'unavailable';
  return `${formatMoney(item.amount, 2)} ${item.where}`;
}

function breakevenText(items: { kind: 'point' | 'interval'; at: number; to?: number }[]): string {
  if (items.length === 0) return 'none for S ≥ 0';
  return items
    .map((item) =>
      item.kind === 'interval' && item.to !== undefined
        ? `${formatMoney(item.at, 2)} to ${formatMoney(item.to, 2)}`
        : formatMoney(item.at, 2),
    )
    .join(', ');
}
