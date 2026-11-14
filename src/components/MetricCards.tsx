import { metricUnit, type Valuation } from '../quant/black-scholes';
import { formatMoney, formatNumber } from '../lib/format';

interface Card {
  id: string;
  label: string;
  value: string;
  unit: string;
  testId?: string;
}

export function MetricCards({
  valuation,
  contracts,
  multiplier,
}: {
  valuation: Valuation;
  contracts: number;
  multiplier: number;
}) {
  const cards: Card[] = [
    { id: 'price', label: 'Price', value: formatMoney(valuation.price, 4), unit: 'per share', testId: 'price-value' },
    { id: 'intrinsic', label: 'Intrinsic', value: formatMoney(valuation.intrinsic, 4), unit: 'undiscounted exercise value' },
    {
      id: 'extrinsic',
      label: 'Extrinsic',
      value: formatMoney(valuation.extrinsic, 4),
      unit: 'price − intrinsic; can be negative',
    },
    { id: 'delta', label: 'Delta', value: formatGreek(valuation.delta), unit: metricUnit('delta') },
    { id: 'gamma', label: 'Gamma', value: formatGreek(valuation.gamma), unit: metricUnit('gamma') },
    { id: 'theta', label: 'Theta', value: formatGreek(valuation.thetaPerDay), unit: metricUnit('theta') },
    { id: 'vega', label: 'Vega', value: formatGreek(valuation.vegaPerPoint), unit: metricUnit('vega') },
    { id: 'rho', label: 'Rho', value: formatGreek(valuation.rhoPerPoint), unit: metricUnit('rho') },
  ];
  const positionPrice = valuation.price * contracts * multiplier;
  const positionDelta = valuation.delta === null ? null : valuation.delta * contracts * multiplier;

  return (
    <section aria-label="Per-share value and Greeks">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cards.map((card) => (
          <article key={card.id} className="panel px-3 py-3">
            <h3 className="text-xs font-medium tracking-wide text-muted uppercase">{card.label}</h3>
            <p className="tabular mt-1 text-lg font-medium text-ink" data-testid={card.testId}>
              {card.value}
            </p>
            <p className="mt-1 text-xs text-muted">{card.unit}</p>
          </article>
        ))}
      </div>
      <p className="mt-3 text-sm text-muted">
        Position, {formatNumber(contracts, 4)} contract{contracts === 1 ? '' : 's'} × multiplier {formatNumber(multiplier, 2)}:{' '}
        <span className="tabular text-ink">{formatMoney(positionPrice, 2)}</span>
        {' · position delta '}
        <span className="tabular text-ink">
          {positionDelta === null ? 'undefined at this boundary' : formatNumber(positionDelta, 4)}
        </span>{' '}
        $ per $1 underlying. Cards above stay per share.
      </p>
    </section>
  );
}

function formatGreek(value: number | null): string {
  if (value === null) return 'undefined at this boundary';
  return formatNumber(value, 4);
}
