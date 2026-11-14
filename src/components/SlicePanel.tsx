import { useMemo } from 'react';
import { intrinsicValue, metricLabel, metricUnit } from '../quant/black-scholes';
import { axisTitle, axesForPair, displayCoordinate, sampleSlice, type AxisId } from '../quant/surface';
import { useDebounced } from '../lib/hooks';
import type { ExplorerInput, ViewInput } from '../scenario/model';
import { marketFromExplorer } from '../scenario/model';
import { PLOT_CONFIG, PlotView } from './PlotView';
import { scenarioAxisValue } from './SurfacePanel';

interface SlicePanelProps {
  explorer: ExplorerInput;
  view: ViewInput;
  theme: 'light' | 'dark';
  onHeld: (value: number | null) => void;
}

export function SlicePanel({ explorer, view, theme, onHeld }: SlicePanelProps) {
  const debounced = useDebounced({ explorer, view }, 40);
  const colors = theme === 'dark'
    ? { paper: '#1b212b', font: '#e8edf2', grid: '#3a4656', accent: '#8fd0cb', payoff: '#e6c27a', marker: '#f0b4b4' }
    : { paper: '#ffffff', font: '#1b2330', grid: '#d5dce4', accent: '#0e5c58', payoff: '#7a4e00', marker: '#8d2d2d' };

  const slice = useMemo(() => {
    const [xAxis, yAxis] = axesForPair(debounced.view.axes);
    const free = debounced.view.sliceFree === 'x' ? xAxis : yAxis;
    const held = debounced.view.sliceFree === 'x' ? yAxis : xAxis;
    const heldValue = debounced.view.sliceHeld ?? scenarioAxisValue(debounced.explorer, held);
    const sampled = sampleSlice({
      right: debounced.explorer.right,
      market: marketFromExplorer(debounced.explorer),
      days: debounced.explorer.days,
      pair: debounced.view.axes,
      metric: debounced.view.metric,
      free,
      held,
      freeMin: bound(debounced.view, free, 'min'),
      freeMax: bound(debounced.view, free, 'max'),
      heldValue,
      count: 100,
    });
    return { free, held, heldValue, sampled };
  }, [debounced]);

  const unit = metricUnit(view.metric);
  const label = `${explorer.right} ${metricLabel(view.metric)}`;
  const x = slice.sampled.x.map((value) => displayCoordinate(slice.free, value));
  const y = slice.sampled.y.map((value) => value);
  const scenarioHeld = scenarioAxisValue(explorer, slice.held);
  const onScenario = Math.abs(slice.heldValue - scenarioHeld) <= tolerance(slice.held);
  const scenarioX = displayCoordinate(slice.free, scenarioAxisValue(explorer, slice.free));
  const showPayoff = view.showPayoff && view.metric === 'price' && slice.free === 'spot';

  const data: Record<string, unknown>[] = [
    {
      type: 'scatter',
      mode: 'lines',
      name: `Model ${metricLabel(view.metric)}`,
      x,
      y,
      line: { color: colors.accent, width: 2.5 },
      connectgaps: false,
      hovertemplate: `${axisTitle(slice.free)}: %{x:.4g}<br>${label}: %{y:.4g} ${unit}<extra></extra>`,
    },
  ];
  if (showPayoff) {
    data.push({
      type: 'scatter',
      mode: 'lines',
      name: 'Expiration payoff',
      x,
      y: slice.sampled.x.map((spot) => intrinsicValue(spot, explorer.K, explorer.right)),
      line: { color: colors.payoff, width: 2, dash: 'dash' },
      hovertemplate: `Underlying: %{x:.4g}<br>Expiration payoff: %{y:.4g} $ per share<extra>intrinsic</extra>`,
    });
  }
  if (onScenario) {
    const scenarioY = y[nearestIndex(x, scenarioX)] ?? null;
    if (scenarioY !== null && Number.isFinite(scenarioY)) {
      data.push({
        type: 'scatter',
        mode: 'markers',
        name: 'Current scenario',
        x: [scenarioX],
        y: [scenarioY],
        marker: { size: 10, color: colors.marker, symbol: 'diamond', line: { color: colors.font, width: 1 } },
        hovertemplate: `Current scenario<br>${label}: %{y:.4g} ${unit}<extra></extra>`,
      });
    }
  }

  const layout = {
    paper_bgcolor: colors.paper,
    plot_bgcolor: colors.paper,
    font: { family: 'IBM Plex Sans, sans-serif', color: colors.font, size: 12 },
    margin: { l: 64, r: 16, t: 16, b: 56 },
    legend: { orientation: 'h', y: 1.12 },
    uirevision: `slice-${view.axes}-${view.metric}-${view.sliceFree}`,
    xaxis: {
      title: { text: axisTitle(slice.free) },
      gridcolor: colors.grid,
      zerolinecolor: colors.grid,
    },
    yaxis: {
      title: { text: `${label} (${unit})` },
      gridcolor: colors.grid,
      zerolinecolor: colors.grid,
    },
    shapes: onScenario
      ? [
          {
            type: 'line',
            x0: scenarioX,
            x1: scenarioX,
            y0: 0,
            y1: 1,
            yref: 'paper',
            line: { color: colors.marker, width: 1, dash: 'dot' },
          },
        ]
      : [],
  };

  const heldMin = bound(view, slice.held, 'min');
  const heldMax = bound(view, slice.held, 'max');
  const heldShown = displayCoordinate(slice.held, slice.heldValue);

  return (
    <section className="panel" aria-label="2D slice">
      <h2 className="text-base font-semibold">2D slice</h2>
      <p className="mt-1 text-sm text-ink">
        {label} ({unit}) versus {axisTitle(slice.free)}. Held fixed: {axisTitle(slice.held)} at{' '}
        <span className="tabular">{formatHeld(slice.held, heldShown)}</span>.
        {onScenario ? ' The dotted line and diamond mark the current scenario.' : ' This slice is off the current scenario.'}
        {showPayoff ? ' The dashed curve is the expiration payoff, not the model price.' : ''}
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <label className="block text-sm">
          <span className="font-medium">Held {axisTitle(slice.held)}</span>
          <input
            aria-label={`Held ${axisTitle(slice.held)}`}
            type="range"
            min={displayCoordinate(slice.held, Math.min(heldMin, heldMax))}
            max={displayCoordinate(slice.held, Math.max(heldMin, heldMax))}
            step={slice.held === 'vol' ? 0.5 : slice.held === 'days' ? 1 : 0.5}
            value={Math.min(
              displayCoordinate(slice.held, Math.max(heldMin, heldMax)),
              Math.max(displayCoordinate(slice.held, Math.min(heldMin, heldMax)), heldShown),
            )}
            onChange={(event) => {
              const display = Number(event.target.value);
              onHeld(slice.held === 'vol' ? display / 100 : display);
            }}
            className="mt-1 h-2 w-full accent-accent"
          />
        </label>
        <button type="button" className="btn" onClick={() => onHeld(null)} disabled={view.sliceHeld === null}>
          Follow scenario
        </button>
      </div>
      <div className="mt-3">
        <PlotView
          data={data}
          layout={layout}
          config={PLOT_CONFIG}
          heightClass="h-[380px]"
          label={`${label} versus ${axisTitle(slice.free)}, holding ${axisTitle(slice.held)} at ${formatHeld(slice.held, heldShown)}`}
        />
      </div>
    </section>
  );
}

function bound(view: ViewInput, axis: AxisId, edge: 'min' | 'max'): number {
  if (axis === 'spot') return edge === 'min' ? view.spotMin : view.spotMax;
  if (axis === 'days') return edge === 'min' ? view.daysMin : view.daysMax;
  return edge === 'min' ? view.volMin : view.volMax;
}

function tolerance(axis: AxisId): number {
  if (axis === 'vol') return 1e-8;
  if (axis === 'days') return 1e-6;
  return 1e-6;
}

function formatHeld(axis: AxisId, shown: number): string {
  if (axis === 'vol') return `${shown.toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;
  if (axis === 'days') return `${shown.toLocaleString('en-US', { maximumFractionDigits: 2 })} days`;
  return `$${shown.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

function nearestIndex(xs: number[], target: number): number {
  let best = 0;
  let bestDist = Infinity;
  xs.forEach((value, index) => {
    const dist = Math.abs(value - target);
    if (dist < bestDist) {
      bestDist = dist;
      best = index;
    }
  });
  return best;
}
