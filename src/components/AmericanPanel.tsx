import { useMemo, useState } from 'react';
import { compareAmerican } from '../quant/american';
import { blackScholes } from '../quant/black-scholes';
import { useDebounced } from '../lib/hooks';
import { formatMoney, formatNumber } from '../lib/format';
import { marketFromExplorer, type ExplorerInput } from '../scenario/model';
import { NumberField } from './NumberField';

interface AmericanPanelProps {
  explorer: ExplorerInput;
  steps: number;
  onExplorer: (patch: Partial<ExplorerInput>) => void;
  onSteps: (steps: number) => void;
}

export function AmericanPanel({ explorer, steps, onExplorer, onSteps }: AmericanPanelProps) {
  const [open, setOpen] = useState(true);
  const debounced = useDebounced({ explorer, steps }, 80);
  const comparison = useMemo(
    () => compareAmerican(marketFromExplorer(debounced.explorer), debounced.explorer.right, debounced.steps),
    [debounced],
  );
  const ladder = useMemo(() => {
    const current = Math.max(1, Math.round(debounced.steps));
    const counts = [...new Set([Math.max(10, Math.round(current / 2)), current, Math.min(800, current * 2)])].sort(
      (a, b) => a - b,
    );
    return counts.map((count) => ({
      count,
      result: compareAmerican(marketFromExplorer(debounced.explorer), debounced.explorer.right, count),
    }));
  }, [debounced]);
  let analytic: number | null = null;
  try {
    analytic = blackScholes(marketFromExplorer(explorer), explorer.right).price;
  } catch {
    analytic = null;
  }

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      <div>
        <button type="button" className="btn mb-2 w-full lg:hidden" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          {open ? 'Hide inputs' : 'Show inputs'}
        </button>
        <div className={`${open ? 'block' : 'hidden'} panel space-y-4 lg:block`}>
          <fieldset>
            <legend className="text-sm font-medium">Option</legend>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button type="button" className="segment btn" aria-pressed={explorer.right === 'call'} onClick={() => onExplorer({ right: 'call' })}>Call</button>
              <button type="button" className="segment btn" aria-pressed={explorer.right === 'put'} onClick={() => onExplorer({ right: 'put' })}>Put</button>
            </div>
          </fieldset>
          <NumberField label="Spot" value={explorer.S} min={20} max={200} step={1} unit="$" hint="Same inputs as the European explorer, priced on a different model." validate={(value) => (value > 0 ? null : 'Spot must be greater than 0.')} onChange={(S) => onExplorer({ S })} />
          <NumberField label="Strike" value={explorer.K} min={20} max={200} step={1} unit="$" hint="Exercise price." validate={(value) => (value > 0 ? null : 'Strike must be greater than 0.')} onChange={(K) => onExplorer({ K })} />
          <NumberField label="Days to expiration" value={explorer.days} min={0} max={730} step={1} unit="days" hint="Converted with days / 365." validate={(value) => (value >= 0 ? null : 'Days cannot be negative.')} onChange={(days) => onExplorer({ days })} />
          <NumberField label="Volatility" value={explorer.sigma * 100} min={0} max={150} step={0.5} unit="%" hint="Zero volatility uses a deterministic scan because the tree degenerates." validate={(value) => (value >= 0 ? null : 'Volatility cannot be negative.')} onChange={(percent) => onExplorer({ sigma: percent / 100 })} />
          <NumberField label="Risk-free rate" value={explorer.r * 100} min={-5} max={20} step={0.1} unit="%" hint="Continuous rate." onChange={(percent) => onExplorer({ r: percent / 100 })} />
          <NumberField label="Dividend yield" value={explorer.q * 100} min={0} max={15} step={0.1} unit="%" hint="A dividend yield can make early exercise of a call rational." onChange={(percent) => onExplorer({ q: percent / 100 })} />
          <NumberField label="Tree steps" value={steps} min={10} max={500} step={10} unit="steps" hint="Cox–Ross–Rubinstein steps. Manual entry can go higher; very large counts are slower." validate={(value) => (value >= 1 ? null : 'Use at least one step.')} onChange={(value) => onSteps(Math.round(value))} />
        </div>
      </div>
      <div className="min-w-0 space-y-4">
        <section className="panel space-y-3">
          <h2 className="text-base font-semibold">American binomial tree</h2>
          <p className="text-sm leading-6">
            This tab is a Cox–Ross–Rubinstein binomial tree. It is not the Black–Scholes formula. An American contract may
            be exercised at any node. A European contract on the same tree may be exercised only at the final nodes.
            Early exercise of a call can be rational when the dividend yield is high enough. Early exercise of a put can
            be rational when the contract is deep in the money, because waiting gives up interest that could be earned on
            the strike. With no dividend yield, this model does not exercise an American call early, so it matches the
            European call up to tree error.
          </p>
          <p className="text-sm leading-6">
            American Greeks are not shown. Finite differences on this tree oscillate as the step count changes, so they
            are not a stable display. Greeks in the Explorer tab are European Black–Scholes Greeks. They are not American Greeks.
          </p>
        </section>
        <section className="grid gap-3 sm:grid-cols-2" aria-label="American and European prices">
          <PriceCard title="American tree" value={comparison.american} hint={comparison.deterministic ? 'Deterministic scan, not a binomial tree.' : 'Early exercise allowed.'} />
          <PriceCard title="European tree" value={comparison.europeanTree} hint="Same grid, exercise only at expiration." />
          <PriceCard title="European Black–Scholes" value={analytic} hint="Closed form. Not an American price." />
          <PriceCard title="Early-exercise premium" value={comparison.earlyExercisePremium} hint="American tree minus European tree." />
        </section>
        {comparison.message ? (
          <p role="status" className="panel text-sm leading-6">
            {comparison.message}
          </p>
        ) : null}
        {comparison.riskNeutralProb !== null ? (
          <p className="text-sm text-muted">
            Risk-neutral probability at {comparison.steps} steps: {formatNumber(comparison.riskNeutralProb, 4)}. It must stay inside (0, 1).
          </p>
        ) : null}
        <section className="panel overflow-x-auto">
          <h2 className="text-base font-semibold">Convergence</h2>
          <p className="mt-1 text-sm leading-6">
            Prices move as the step count changes. The European tree should approach the Black–Scholes price. Cox–Ross–Rubinstein
            values can oscillate, so a larger step count is not a guarantee of a closer price on every single increment.
          </p>
          <table className="mt-3 w-full text-left text-sm">
            <thead>
              <tr className="text-muted">
                <th className="py-1 pr-3 font-medium">Steps</th>
                <th className="py-1 pr-3 font-medium">American</th>
                <th className="py-1 pr-3 font-medium">European tree</th>
                <th className="py-1 font-medium">Versus Black–Scholes</th>
              </tr>
            </thead>
            <tbody>
              {ladder.map((row) => {
                const eu = row.result.europeanTree;
                const gap = eu !== null && row.result.europeanAnalytic !== null ? eu - row.result.europeanAnalytic : null;
                return (
                  <tr key={row.count} className="tabular border-t border-line">
                    <td className="py-1 pr-3">{row.count}</td>
                    <td className="py-1 pr-3">{row.result.american === null ? 'unavailable' : formatMoney(row.result.american, 4)}</td>
                    <td className="py-1 pr-3">{eu === null ? 'unavailable' : formatMoney(eu, 4)}</td>
                    <td className="py-1">{gap === null ? 'unavailable' : formatNumber(gap, 4)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}

function PriceCard({ title, value, hint }: { title: string; value: number | null; hint: string }) {
  return (
    <article className="panel">
      <h3 className="text-xs font-medium tracking-wide text-muted uppercase">{title}</h3>
      <p className="tabular mt-1 text-lg">{value === null ? 'unavailable' : formatMoney(value, 4)}</p>
      <p className="mt-1 text-xs text-muted">{hint}</p>
    </article>
  );
}
