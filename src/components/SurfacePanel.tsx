import { useMemo, useState } from 'react';
import {
  blackScholes,
  metricIsSigned,
  metricLabel,
  metricOf,
  metricUnit,
  type MetricName,
} from '../quant/black-scholes';
import {
  axisTitle,
  axesForPair,
  displayCoordinate,
  nullsToNaN,
  sampleSurface,
  type AxisId,
} from '../quant/surface';
import { colorRange, finiteValues } from '../lib/colorScale';
import { useDebounced } from '../lib/hooks';
import { DEFAULT_SURFACE_CAMERA } from '../lib/sceneCamera';
import type { ExplorerInput, ViewInput } from '../scenario/model';
import { marketFromExplorer } from '../scenario/model';
import { PLOT_CONFIG, PlotView } from './PlotView';

const SURFACE_COLORS = {
  light: { paper: '#ffffff', font: '#1b2330', grid: '#d5dce4', marker: '#8d2d2d' },
  dark: { paper: '#1b212b', font: '#e8edf2', grid: '#3a4656', marker: '#f0b4b4' },
} as const;

interface SurfacePanelProps {
  explorer: ExplorerInput;
  view: ViewInput;
  theme: 'light' | 'dark';
  webgl: boolean;
}

export function SurfacePanel({ explorer, view, theme, webgl }: SurfacePanelProps) {
  const [cameraRev, setCameraRev] = useState(0);
  const debounced = useDebounced({ explorer, view }, 60);
  const colors = SURFACE_COLORS[theme];
  // Axis pair and Z metric change the coordinate system, so the camera returns to the
  // default view. Scenario inputs, surface window, resolution, contours, and the
  // scenario marker do not. Reset camera uses the same default view.
  const sceneCamera = useMemo(
    () => ({
      resetKey: `${view.axes}|${view.metric}|${cameraRev}`,
      initial: DEFAULT_SURFACE_CAMERA,
    }),
    [view.axes, view.metric, cameraRev],
  );

  const built = useMemo(() => {
    const [xAxis, yAxis] = axesForPair(debounced.view.axes);
    const grid = sampleSurface({
      right: debounced.explorer.right,
      market: marketFromExplorer(debounced.explorer),
      days: debounced.explorer.days,
      pair: debounced.view.axes,
      metric: debounced.view.metric,
      resolution: debounced.view.resolution,
      x: { id: xAxis, min: axisBound(debounced.view, xAxis, 'min'), max: axisBound(debounced.view, xAxis, 'max') },
      y: { id: yAxis, min: axisBound(debounced.view, yAxis, 'min'), max: axisBound(debounced.view, yAxis, 'max') },
    });
    const values = finiteValues(grid.z);
    const range = colorRange(values, metricIsSigned(debounced.view.metric), debounced.view.robustColor);
    const scenario = scenarioPoint(debounced.explorer, debounced.view.metric, xAxis, yAxis, grid);
    return { grid, range, xAxis, yAxis, scenario, values };
  }, [debounced]);

  const unit = metricUnit(view.metric);
  const label = `${explorer.right} ${metricLabel(view.metric)}`;
  const summary = `${label} (${unit}) on ${axisTitle(built.xAxis)} × ${axisTitle(built.yAxis)}.`;

  const data = useMemo(() => {
    const x = built.grid.x.map((value) => displayCoordinate(built.xAxis, value));
    const y = built.grid.y.map((value) => displayCoordinate(built.yAxis, value));
    const traces: Record<string, unknown>[] = [
      {
        type: 'surface',
        name: label,
        x,
        y,
        z: nullsToNaN(built.grid.z),
        colorscale: metricIsSigned(view.metric) ? 'RdBu' : 'Cividis',
        cmin: built.range.cmin,
        cmax: built.range.cmax,
        cmid: built.range.cmid,
        showscale: true,
        contours: {
          z: { show: view.showContours, usecolormap: true, highlightcolor: colors.font, project: { z: false } },
        },
        colorbar: { title: { text: `${metricLabel(view.metric)} (${unit})` }, thickness: 14, len: 0.7 },
        hovertemplate: `${axisTitle(built.xAxis)}: %{x:.4g}<br>${axisTitle(built.yAxis)}: %{y:.4g}<br>${label}: %{z:.4g} ${unit}<extra></extra>`,
      },
    ];
    if (view.showMarker && built.scenario) {
      traces.push({
        type: 'scatter3d',
        mode: 'markers',
        name: 'Current scenario',
        x: [built.scenario.x],
        y: [built.scenario.y],
        z: [built.scenario.z],
        marker: { size: 6, color: colors.marker, symbol: 'diamond', line: { color: colors.font, width: 1 } },
        hovertemplate: `Current scenario<br>${label}: %{z:.4g} ${unit}<extra></extra>`,
      });
    }
    return traces;
  }, [built, colors, explorer.right, label, unit, view.metric, view.showContours, view.showMarker]);

  const layout = useMemo(
    () => ({
      paper_bgcolor: colors.paper,
      font: { family: 'IBM Plex Sans, sans-serif', color: colors.font, size: 12 },
      margin: { l: 0, r: 0, t: 12, b: 0 },
      showlegend: true,
      legend: { orientation: 'h' as const, y: 1.02 },
      scene: {
        // Orbit instead of Plotly's turntable default. A turntable relayout writes a
        // camera keyframe 500ms ahead and forces up to +z, so the view rolls back and
        // the next drag does not move. Orbit keeps the eye, center, and up the user set.
        dragmode: 'orbit' as const,
        aspectmode: 'manual' as const,
        aspectratio: { x: 1.15, y: 1.15, z: 0.8 },
        xaxis: axisStyle(axisTitle(built.xAxis), colors),
        yaxis: axisStyle(axisTitle(built.yAxis), colors),
        zaxis: axisStyle(`${label} (${unit})`, colors),
        bgcolor: colors.paper,
      },
    }),
    [built.xAxis, built.yAxis, colors, label, unit],
  );

  if (!webgl) {
    return (
      <section className="panel" aria-label="3D surface">
        <h2 className="text-base font-semibold">3D surface</h2>
        <p className="mt-2 text-sm text-ink" data-testid="chart-summary">
          {summary} 3D is unavailable because this browser has no WebGL context. The 2D slice uses the same model.
        </p>
      </section>
    );
  }

  return (
    <section className="panel" aria-label="3D surface">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">3D surface</h2>
          <p className="mt-1 text-sm text-ink" data-testid="chart-summary">
            {summary} Hover reads both axes, the metric, and the unit.
          </p>
        </div>
        <button type="button" className="btn" onClick={() => setCameraRev((n) => n + 1)}>
          Reset camera
        </button>
      </div>
      <PlotView data={data} layout={layout} config={PLOT_CONFIG} label={summary} sceneCamera={sceneCamera} />
      <div className="mt-2 space-y-1 text-xs text-muted">
        {metricIsSigned(view.metric) ? (
          <p>Diverging color scale centered at zero. Blue is higher and red is lower; the number is in the hover.</p>
        ) : (
          <p>Sequential color scale. Darker Cividis colors are higher; the number is in the hover.</p>
        )}
        {built.range.clipped ? (
          <p>
            Color scale shows the 1st to 99th percentile. Extreme values are still in the surface and the hover
            readout; the data itself is not clipped.
          </p>
        ) : (
          <p>Color scale uses the full range of finite surface values. Data is not clipped.</p>
        )}
        {view.showMarker && !built.scenario ? (
          <p>
            Scenario marker hidden. The current point is outside the surface window, or this Greek is undefined at
            the current boundary.
          </p>
        ) : null}
        {built.values.length === 0 ? <p>Every point on this surface is undefined at the current boundary.</p> : null}
      </div>
    </section>
  );
}

function axisStyle(title: string, colors: { grid: string; font: string; paper: string }) {
  return {
    title: { text: title },
    gridcolor: colors.grid,
    zerolinecolor: colors.grid,
    backgroundcolor: colors.paper,
    color: colors.font,
  };
}

function axisBound(view: ViewInput, axis: AxisId, edge: 'min' | 'max'): number {
  if (axis === 'spot') return edge === 'min' ? view.spotMin : view.spotMax;
  if (axis === 'days') return edge === 'min' ? view.daysMin : view.daysMax;
  return edge === 'min' ? view.volMin : view.volMax;
}

function scenarioPoint(
  explorer: ExplorerInput,
  metric: MetricName,
  xAxis: AxisId,
  yAxis: AxisId,
  grid: { x: number[]; y: number[] },
): { x: number; y: number; z: number } | null {
  const rawX = axisValue(explorer, xAxis);
  const rawY = axisValue(explorer, yAxis);
  const xMin = grid.x[0];
  const xMax = grid.x[grid.x.length - 1];
  const yMin = grid.y[0];
  const yMax = grid.y[grid.y.length - 1];
  if (xMin === undefined || xMax === undefined || yMin === undefined || yMax === undefined) return null;
  if (rawX < Math.min(xMin, xMax) || rawX > Math.max(xMin, xMax)) return null;
  if (rawY < Math.min(yMin, yMax) || rawY > Math.max(yMin, yMax)) return null;
  const value = metricOf(blackScholes(marketFromExplorer(explorer), explorer.right), metric);
  if (value === null || !Number.isFinite(value)) return null;
  return { x: displayCoordinate(xAxis, rawX), y: displayCoordinate(yAxis, rawY), z: value };
}

function axisValue(explorer: ExplorerInput, axis: AxisId): number {
  if (axis === 'spot') return explorer.S;
  if (axis === 'days') return explorer.days;
  return explorer.sigma;
}

export function scenarioAxisValue(explorer: ExplorerInput, axis: AxisId): number {
  return axisValue(explorer, axis);
}
