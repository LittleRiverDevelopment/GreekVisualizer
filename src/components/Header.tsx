interface HeaderProps {
  onReset: () => void;
  onShare: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  notice: string | null;
}

export function Header({ onReset, onShare, theme, onToggleTheme, notice }: HeaderProps) {
  return (
    <header className="border-b border-line bg-card">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-start justify-between gap-4 px-4 py-4">
        <div className="min-w-0">
          <p className="text-xs font-medium tracking-wide text-muted uppercase">Educational sandbox</p>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">GreekVisualizer</h1>
          <p className="mt-1 max-w-xl text-sm text-muted">
            European options, Black–Scholes–Merton, and the Greeks — priced in your browser.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" data-testid="reset" onClick={onReset} className="btn">
            Reset
          </button>
          <button type="button" data-testid="share" onClick={onShare} className="btn">
            Share scenario
          </button>
          <button type="button" onClick={onToggleTheme} className="btn" aria-pressed={theme === 'dark'}>
            {theme === 'dark' ? 'Light theme' : 'Dark theme'}
          </button>
        </div>
      </div>
      <div className="mx-auto max-w-[1400px] px-4 pb-4">
        <p className="max-w-3xl text-sm text-ink">
          Educational model only. Not a forecast, a quote, or a recommendation to trade. Prices are theoretical
          Black–Scholes–Merton values, not market prices.
        </p>
        {notice ? (
          <p role="status" className="mt-2 text-sm text-accent">
            {notice}
          </p>
        ) : null}
      </div>
    </header>
  );
}
