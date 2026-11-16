import { useEffect, useRef, useState } from 'react';
import {
  camerasClose,
  cameraForPlotly,
  cloneCamera,
  layoutWithSceneCamera,
  readSceneCamera,
  type SceneCamera,
} from '../lib/sceneCamera';

interface PlotlyApi {
  react(el: HTMLElement, data: unknown[], layout?: unknown, config?: unknown): Promise<unknown>;
  relayout(el: HTMLElement, update: Record<string, unknown>): Promise<unknown>;
  purge(el: HTMLElement): void;
  Plots: { resize(el: HTMLElement): void };
}

interface PlotDiv extends HTMLElement {
  on?(event: string, handler: () => void): void;
  removeListener?(event: string, handler: () => void): void;
}

async function loadPlotly(): Promise<PlotlyApi> {
  const module = await import('plotly.js-dist-min');
  return module.default as unknown as PlotlyApi;
}

interface PlotViewProps {
  data: unknown[];
  layout: unknown;
  config?: unknown;
  heightClass?: string;
  label: string;
  /**
   * When set, the 3D scene camera survives data and layout revisions.
   * A new `resetKey` applies `initial` instead of the camera the user left in place.
   */
  sceneCamera?: {
    resetKey: string;
    initial: SceneCamera;
  };
}

export function PlotView({ data, layout, config, heightClass = 'h-[520px]', label, sceneCamera }: PlotViewProps) {
  const ref = useRef<HTMLDivElement>(null);
  const generation = useRef(0);
  const queue = useRef(Promise.resolve());
  const heldCamera = useRef<SceneCamera | null>(null);
  const appliedResetKey = useRef<string | null>(null);
  const inFlight = useRef(false);
  const flightToken = useRef(0);
  const listening = useRef(false);
  const detachListener = useRef<(() => void) | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState('Loading chart…');
  const resetKey = sceneCamera?.resetKey;
  const initialCamera = sceneCamera?.initial;

  useEffect(() => {
    const id = ++generation.current;
    const flight = ++flightToken.current;
    const gd = ref.current;
    if (!gd) return undefined;
    let alive = true;
    setStatus((current) => (current === 'ready' ? current : 'loading'));

    let cameraForUpdate: SceneCamera | null = null;
    let resetting = false;
    if (resetKey !== undefined && initialCamera) {
      resetting = appliedResetKey.current !== resetKey;
      if (resetting) {
        appliedResetKey.current = resetKey;
        cameraForUpdate = cloneCamera(initialCamera);
      } else if (inFlight.current && heldCamera.current) {
        cameraForUpdate = cloneCamera(heldCamera.current);
      } else {
        cameraForUpdate =
          readSceneCamera(gd) ??
          (heldCamera.current ? cloneCamera(heldCamera.current) : cloneCamera(initialCamera));
      }
      heldCamera.current = cameraForUpdate;
    }
    inFlight.current = true;

    queue.current = queue.current
      .catch(() => undefined)
      .then(async () => {
        try {
          if (!alive || id !== generation.current || !ref.current) return;
          const Plotly = await loadPlotly();
          if (!alive || id !== generation.current || !ref.current) return;
          const node = ref.current;
          const latestCamera = !resetting && resetKey !== undefined ? readSceneCamera(node) ?? cameraForUpdate : cameraForUpdate;
          if (latestCamera) {
            cameraForUpdate = latestCamera;
            heldCamera.current = latestCamera;
          }
          const layoutForPlot =
            cameraForUpdate && resetKey !== undefined
              ? layoutWithSceneCamera(layout, cameraForUpdate, resetKey)
              : layout;
          await Plotly.react(node, data, layoutForPlot, config);
          if (!alive || id !== generation.current) return;
          rememberUserCamera(node);
          if (cameraForUpdate && resetKey !== undefined) {
            const after = readSceneCamera(node);
            if (!after || !camerasClose(after, cameraForUpdate, 0.02)) {
              await Plotly.relayout(node, { 'scene.camera': cameraForPlotly(cameraForUpdate) });
            }
            const settled = readSceneCamera(node);
            if (settled) heldCamera.current = settled;
          }
          if (!alive || id !== generation.current) return;
          setStatus('ready');
        } catch (error) {
          if (!alive || id !== generation.current) return;
          setStatus('error');
          setMessage(error instanceof Error ? error.message : 'The chart failed to render.');
        } finally {
          if (flightToken.current === flight) inFlight.current = false;
        }
      });

    return () => {
      alive = false;
    };

    function rememberUserCamera(node: HTMLElement) {
      if (listening.current || resetKey === undefined) return;
      const plot = node as PlotDiv;
      if (typeof plot.on !== 'function') return;
      const handler = () => {
        if (inFlight.current) return;
        const next = readSceneCamera(node);
        if (next) heldCamera.current = next;
      };
      plot.on('plotly_relayout', handler);
      listening.current = true;
      detachListener.current = () => plot.removeListener?.('plotly_relayout', handler);
    }
  }, [data, layout, config, resetKey, initialCamera]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const observer = new ResizeObserver(() => {
      void loadPlotly().then((Plotly) => {
        if (ref.current) Plotly.Plots.resize(ref.current);
      });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const el = ref.current;
    return () => {
      detachListener.current?.();
      if (!el) return;
      void loadPlotly().then((Plotly) => Plotly.purge(el));
    };
  }, []);

  return (
    <div className={`relative w-full min-w-0 ${heightClass}`}>
      <div ref={ref} className="h-full w-full" role="img" aria-label={label} />
      {status !== 'ready' ? (
        <p className="absolute inset-0 flex items-center justify-center px-4 text-center text-sm text-muted" role="status">
          {status === 'error' ? message : 'Loading chart…'}
        </p>
      ) : null}
    </div>
  );
}

export const PLOT_CONFIG = {
  responsive: true,
  displaylogo: false,
  displayModeBar: true,
  modeBarButtonsToRemove: ['lasso2d', 'select2d'],
  toImageButtonOptions: { filename: 'greekvisualizer' },
};
