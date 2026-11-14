import { useEffect, useRef, useState } from 'react';

interface PlotlyApi {
  react(el: HTMLElement, data: unknown[], layout?: unknown, config?: unknown): Promise<unknown>;
  purge(el: HTMLElement): void;
  Plots: { resize(el: HTMLElement): void };
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
}

export function PlotView({ data, layout, config, heightClass = 'h-[520px]', label }: PlotViewProps) {
  const ref = useRef<HTMLDivElement>(null);
  const generation = useRef(0);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState('Loading chart…');

  useEffect(() => {
    const id = ++generation.current;
    let alive = true;
    setStatus((current) => (current === 'ready' ? current : 'loading'));
    (async () => {
      try {
        const Plotly = await loadPlotly();
        if (!alive || id !== generation.current || !ref.current) return;
        await Plotly.react(ref.current, data, layout, config);
        if (!alive || id !== generation.current) return;
        setStatus('ready');
      } catch (error) {
        if (!alive || id !== generation.current) return;
        setStatus('error');
        setMessage(error instanceof Error ? error.message : 'The chart failed to render.');
      }
    })();
    return () => {
      alive = false;
    };
  }, [data, layout, config]);

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
