import { useEffect, useState } from 'react';
import type { MetricName } from '../quant/black-scholes';
import { blackScholes, metricLabel, validateMarket } from '../quant/black-scholes';
import type { AxisPair, Resolution } from '../quant/surface';
import { RESOLUTION_SIZE } from '../quant/surface';
import { usePrefersReducedMotion } from '../lib/hooks';
import type { ExplorerInput, ViewInput } from '../scenario/model';
import { marketFromExplorer } from '../scenario/model';
import { Education } from './Education';
import { Guides } from './Guides';
import { MetricCards } from './MetricCards';
import { NumberField } from './NumberField';
import { SlicePanel } from './SlicePanel';
import { SurfacePanel } from './SurfacePanel';
import type { GuideDefinition } from '../content/guides';

interface ExplorerPanelProps {
  explorer: ExplorerInput;
  view: ViewInput;
  theme: 'light' | 'dark';
  webgl: boolean;
  onExplorer: (patch: Partial<ExplorerInput>) => void;
  onView: (patch: Partial<ViewInput>) => void;
  onGuide: (guide: GuideDefinition) => void;
}

export function ExplorerPanel(props: ExplorerPanelProps) {
  const { explorer, view, theme, webgl, onExplorer, onView, onGuide } = props;
  const [controlsOpen, setControlsOpen] = useState(true);
  const market = marketFromExplorer(explorer);
  const valid = validateMarket(market);
  const valuation = valid.ok ? blackScholes(market, explorer.right) : null;

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      <div className="min-w-0 lg:sticky lg:top-3">
        <button
          type="button"
          className="btn mb-2 w-full lg:hidden"
          aria-expanded={controlsOpen}
          onClick={() => setControlsOpen((open) => !open)}
        >
          {controlsOpen ? 'Hide inputs' : 'Show inputs'}
        </button>
        <div className={controlsOpen ? 'block' : 'hidden lg:block'}>
          <ExplorerControls explorer={explorer} view={view} onExplorer={onExplorer} onView={onView} />
        </div>
      </div>
      <div className="min-w-0 space-y-4">
        {valuation ? (
          <>
            <p className="text-sm leading-6 text-ink" data-testid="scenario-summary">
              {explorer.right === 'call' ? 'Call' : 'Put'}, spot {explorer.S}, strike {explorer.K}, {explorer.days}{' '}
              calendar days, volatility {(explorer.sigma * 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}%,
              rate {(explorer.r * 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}%, dividend{' '}
              {(explorer.q * 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}%.{' '}
              {view.metric === 'price' ? 'Chart metric: price.' : `Chart metric: ${metricLabel(view.metric)}.`}
            </p>
            <MetricCards valuation={valuation} contracts={explorer.contracts} multiplier={explorer.multiplier} />
            <SurfacePanel explorer={explorer} view={view} theme={theme} webgl={webgl} />
            <SlicePanel explorer={explorer} view={view} theme={theme} onHeld={(sliceHeld) => onView({ sliceHeld })} />
            <Guides explorer={explorer} activeId={view.guide} onApply={onGuide} onDismiss={() => onView({ guide: null })} />
            <Education explorer={explorer} valuation={valuation} onExample={onExplorer} />
          </>
        ) : (
          <p role="alert" className="panel text-sm text-danger">
            {valid.message}
          </p>
        )}
      </div>
    </div>
  );
}

function ExplorerControls({
  explorer,
  view,
  onExplorer,
  onView,
}: {
  explorer: ExplorerInput;
  view: ViewInput;
  onExplorer: (patch: Partial<ExplorerInput>) => void;
  onView: (patch: Partial<ViewInput>) => void;
}) {
  return (
    <div className="panel space-y-4">
      <fieldset>
        <legend className="text-sm font-medium">Option</legend>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button type="button" className="segment btn" data-testid="right-call" aria-pressed={explorer.right === 'call'} onClick={() => onExplorer({ right: 'call' })}>
            Call
          </button>
          <button type="button" className="segment btn" data-testid="right-put" aria-pressed={explorer.right === 'put'} onClick={() => onExplorer({ right: 'put' })}>
            Put
          </button>
        </div>
      </fieldset>
      <NumberField
        label="Spot"
        testId="spot-input"
        value={explorer.S}
        min={20}
        max={200}
        step={1}
        unit="$"
        hint="Default slider 20 to 200. Any spot above 0 is accepted."
        validate={(value) => (value > 0 ? null : 'Spot must be greater than 0.')}
        onChange={(S) => onExplorer({ S })}
      />
      <NumberField
        label="Strike"
        value={explorer.K}
        min={20}
        max={200}
        step={1}
        unit="$"
        hint="Default slider 20 to 200."
        validate={(value) => (value > 0 ? null : 'Strike must be greater than 0.')}
        onChange={(K) => onExplorer({ K })}
      />
      <NumberField
        label="Days to expiration"
        value={explorer.days}
        min={0}
        max={730}
        step={1}
        unit="calendar days"
        hint="Time in the formula is days / 365. Zero is expiration."
        validate={(value) => (value >= 0 ? null : 'Days cannot be negative.')}
        onChange={(days) => onExplorer({ days })}
      />
      <TimePlay days={explorer.days} onDays={(days) => onExplorer({ days })} />
      <NumberField
        label="Volatility"
        value={explorer.sigma * 100}
        min={0}
        max={150}
        step={0.5}
        unit="%"
        hint="Annualized volatility. 20% is stored as 0.20 in the model and in the share link."
        validate={(value) => (value >= 0 ? null : 'Volatility cannot be negative.')}
        onChange={(percent) => onExplorer({ sigma: percent / 100 })}
      />
      <NumberField
        label="Risk-free rate"
        value={explorer.r * 100}
        min={-5}
        max={20}
        step={0.1}
        unit="% continuous"
        hint="Continuous rate. Negative rates are allowed. 5% is stored as 0.05."
        onChange={(percent) => onExplorer({ r: percent / 100 })}
      />
      <NumberField
        label="Dividend yield"
        value={explorer.q * 100}
        min={0}
        max={15}
        step={0.1}
        unit="% continuous"
        hint="Continuous yield, not a cash dividend schedule."
        onChange={(percent) => onExplorer({ q: percent / 100 })}
      />
      <details>
        <summary className="cursor-pointer text-sm font-medium">Position size</summary>
        <div className="mt-3 space-y-3">
          <NumberField
            label="Contracts"
            value={explorer.contracts}
            min={-5}
            max={5}
            step={1}
            unit="signed contracts"
            hint="Positive buys, negative sells. The per-share cards do not include this."
            onChange={(contracts) => onExplorer({ contracts })}
          />
          <NumberField
            label="Multiplier"
            value={explorer.multiplier}
            min={1}
            max={100}
            step={1}
            unit="shares per contract"
            hint="Default 100. Applied to position value and position Greeks only."
            validate={(value) => (value > 0 ? null : 'Multiplier must be greater than 0.')}
            onChange={(multiplier) => onExplorer({ multiplier })}
          />
        </div>
      </details>
      <ChartControls view={view} onView={onView} />
    </div>
  );
}

function TimePlay({ days, onDays }: { days: number; onDays: (days: number) => void }) {
  const reduced = usePrefersReducedMotion();
  const [playing, setPlaying] = useState(false);
  const [origin, setOrigin] = useState<number | null>(null);

  useEffect(() => {
    if (!playing || reduced) return undefined;
    const id = window.setInterval(() => {
      onDays(Math.max(0, days - (days > 120 ? 2 : 1)));
      if (days <= 0) setPlaying(false);
    }, 180);
    return () => window.clearInterval(id);
  }, [playing, reduced, days, onDays]);

  return (
    <div className="flex flex-wrap gap-2">
      {reduced ? (
        <button type="button" className="btn" onClick={() => onDays(Math.max(0, days - 1))}>
          Step one day toward expiration
        </button>
      ) : (
        <button
          type="button"
          className="btn"
          onClick={() => {
            if (playing) {
              setPlaying(false);
              return;
            }
            setOrigin(days);
            setPlaying(true);
          }}
        >
          {playing ? 'Pause time' : 'Animate toward expiration'}
        </button>
      )}
      <button
        type="button"
        className="btn"
        onClick={() => {
          setPlaying(false);
          if (origin !== null) onDays(origin);
        }}
      >
        Reset time
      </button>
    </div>
  );
}

function ChartControls({ view, onView }: { view: ViewInput; onView: (patch: Partial<ViewInput>) => void }) {
  const metrics: MetricName[] = ['price', 'delta', 'gamma', 'theta', 'vega', 'rho'];
  const pairs: { id: AxisPair; label: string }[] = [
    { id: 'spot-days', label: 'Underlying × days' },
    { id: 'spot-vol', label: 'Underlying × volatility' },
    { id: 'days-vol', label: 'Days × volatility' },
  ];
  return (
    <div className="space-y-3 border-t border-line pt-3">
      <label className="block text-sm font-medium" htmlFor="metric-select">
        Surface metric
      </label>
      <select
        id="metric-select"
        data-testid="metric-select"
        value={view.metric}
        onChange={(event) => onView({ metric: event.target.value as MetricName })}
        className="w-full rounded-md border border-line bg-card px-2 py-2 text-sm"
      >
        {metrics.map((metric) => (
          <option key={metric} value={metric}>
            {metricLabel(metric)}
          </option>
        ))}
      </select>
      <fieldset>
        <legend className="text-sm font-medium">Axes</legend>
        <div className="mt-2 space-y-1">
          {pairs.map((pair) => (
            <label key={pair.id} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="axes"
                checked={view.axes === pair.id}
                onChange={() => onView({ axes: pair.id, sliceHeld: null })}
              />
              {pair.label}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="text-sm font-medium">Slice free axis</legend>
        <div className="mt-2 flex gap-2">
          <button type="button" className="segment btn" aria-pressed={view.sliceFree === 'x'} onClick={() => onView({ sliceFree: 'x', sliceHeld: null })}>
            First axis
          </button>
          <button type="button" className="segment btn" aria-pressed={view.sliceFree === 'y'} onClick={() => onView({ sliceFree: 'y', sliceHeld: null })}>
            Second axis
          </button>
        </div>
      </fieldset>
      <fieldset>
        <legend className="text-sm font-medium">Resolution</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {(['low', 'medium', 'high'] as Resolution[]).map((resolution) => (
            <button
              key={resolution}
              type="button"
              className="segment btn"
              aria-pressed={view.resolution === resolution}
              onClick={() => onView({ resolution })}
            >
              {resolution} ({RESOLUTION_SIZE[resolution]}²)
            </button>
          ))}
        </div>
      </fieldset>
      <NumberField label="Spot window from" value={view.spotMin} min={1} max={view.spotMax} step={1} unit="$" hint="Display window only. Values outside it are not deleted from the model." validate={(value) => (value > 0 && value < view.spotMax ? null : 'Spot minimum must be positive and below the maximum.')} onChange={(spotMin) => onView({ spotMin })} />
      <NumberField label="Spot window to" value={view.spotMax} min={view.spotMin} max={500} step={1} unit="$" hint="Raise this if the scenario marker sits outside the surface." validate={(value) => (value > view.spotMin ? null : 'Spot maximum must exceed the minimum.')} onChange={(spotMax) => onView({ spotMax })} />
      <NumberField label="Day window from" value={view.daysMin} min={0} max={Math.max(0, view.daysMax - 1)} step={1} unit="days" hint="The price surface may include expiration. Greek surfaces mask undefined points." validate={(value) => (value >= 0 && value < view.daysMax ? null : 'Day minimum must be nonnegative and below the maximum.')} onChange={(daysMin) => onView({ daysMin })} />
      <NumberField label="Day window to" value={view.daysMax} min={view.daysMin + 1} max={1000} step={1} unit="days" hint="Display window for the day axis." validate={(value) => (value > view.daysMin ? null : 'Day maximum must exceed the minimum.')} onChange={(daysMax) => onView({ daysMax })} />
      <NumberField label="Vol window from" value={view.volMin * 100} min={0} max={Math.max(0, view.volMax * 100 - 1)} step={1} unit="%" hint="Decimal volatility is this number divided by 100." validate={(value) => (value >= 0 && value / 100 < view.volMax ? null : 'Volatility minimum must be nonnegative and below the maximum.')} onChange={(percent) => onView({ volMin: percent / 100 })} />
      <NumberField label="Vol window to" value={view.volMax * 100} min={view.volMin * 100 + 1} max={300} step={1} unit="%" hint="Display window for the volatility axis." validate={(value) => (value / 100 > view.volMin ? null : 'Volatility maximum must exceed the minimum.')} onChange={(percent) => onView({ volMax: percent / 100 })} />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={view.showMarker} onChange={(event) => onView({ showMarker: event.target.checked })} />
        Show scenario marker
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={view.showContours} onChange={(event) => onView({ showContours: event.target.checked })} />
        Show surface contours
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={view.robustColor} onChange={(event) => onView({ robustColor: event.target.checked })} />
        Robust color scale (1st–99th percentile)
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={view.showPayoff} onChange={(event) => onView({ showPayoff: event.target.checked })} />
        Compare expiration payoff on the price slice
      </label>
    </div>
  );
}
