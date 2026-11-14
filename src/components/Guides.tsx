import { blackScholes } from '../quant/black-scholes';
import {
  GUIDES,
  guideById,
  itmOtmRows,
  losingTradeStory,
  sameExplorer,
  timeDecayRows,
  volatilityRows,
  type GuideDefinition,
} from '../content/guides';
import { formatMoney, formatNumber, formatPercent } from '../lib/format';
import type { ExplorerInput } from '../scenario/model';
import { marketFromExplorer } from '../scenario/model';

interface GuidesProps {
  explorer: ExplorerInput;
  activeId: string | null;
  onApply: (guide: GuideDefinition) => void;
  onDismiss: () => void;
}

export function Guides({ explorer, activeId, onApply, onDismiss }: GuidesProps) {
  const guide = guideById(activeId);
  return (
    <section className="panel" aria-label="Guided scenarios">
      <h2 className="text-base font-semibold">Guided scenarios</h2>
      <p className="mt-1 text-sm text-muted">Each preset sets the inputs and the chart, then shows figures computed from those inputs.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {GUIDES.map((item) => (
          <button
            key={item.id}
            type="button"
            className="btn"
            aria-pressed={activeId === item.id}
            onClick={() => onApply(item)}
          >
            {item.title}
          </button>
        ))}
      </div>
      {guide ? (
        <GuideBody guide={guide} explorer={explorer} onDismiss={onDismiss} />
      ) : null}
    </section>
  );
}

function GuideBody({
  guide,
  explorer,
  onDismiss,
}: {
  guide: GuideDefinition;
  explorer: ExplorerInput;
  onDismiss: () => void;
}) {
  const drifted = !sameExplorer(explorer, guide.explorer);
  return (
    <div className="mt-4 space-y-3 border-t border-line pt-3 text-sm leading-6">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-semibold">{guide.title}</h3>
        <button type="button" className="btn" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
      <p>{guide.objective}</p>
      <p><span className="font-medium">Look at: </span>{guide.lookAt}</p>
      <p><span className="font-medium">Why: </span>{guide.why}</p>
      <p><span className="font-medium">Left out: </span>{guide.leavesOut}</p>
      {drifted ? (
        <p className="text-warn">
          The inputs no longer match this preset. The figures below still describe the preset. The charts follow the inputs you are editing.
        </p>
      ) : null}
      {guide.id === 'time-decay' ? <TimeTable explorer={guide.explorer} /> : null}
      {guide.id === 'gamma-ridge' ? <GammaCompare explorer={guide.explorer} /> : null}
      {guide.id === 'vol-price' ? <VolTable explorer={guide.explorer} /> : null}
      {guide.id === 'itm-otm' ? <MoneynessTable explorer={guide.explorer} /> : null}
      {guide.id === 'right-direction' ? <LosingTrade /> : null}
    </div>
  );
}

function TimeTable({ explorer }: { explorer: ExplorerInput }) {
  const rows = timeDecayRows(explorer, [60, 30, 7, 1]);
  return (
    <table className="w-full text-left text-sm">
      <caption className="mb-1 text-left text-muted">Price and theta at four tenors, other preset inputs fixed.</caption>
      <thead>
        <tr className="text-muted">
          <th className="py-1 pr-3 font-medium">Days</th>
          <th className="py-1 pr-3 font-medium">Price</th>
          <th className="py-1 font-medium">Theta per day</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.days} className="tabular border-t border-line">
            <td className="py-1 pr-3">{row.days}</td>
            <td className="py-1 pr-3">{formatMoney(row.price, 4)}</td>
            <td className="py-1">{row.thetaPerDay === null ? 'undefined at this boundary' : formatNumber(row.thetaPerDay, 4)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function VolTable({ explorer }: { explorer: ExplorerInput }) {
  const rows = volatilityRows(explorer, [0.1, 0.2, 0.4, 0.6]);
  return (
    <table className="w-full text-left text-sm">
      <caption className="mb-1 text-left text-muted">Same contract at four volatilities.</caption>
      <thead>
        <tr className="text-muted">
          <th className="py-1 pr-3 font-medium">Volatility</th>
          <th className="py-1 pr-3 font-medium">Price</th>
          <th className="py-1 font-medium">Vega per point</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.sigma} className="tabular border-t border-line">
            <td className="py-1 pr-3">{formatPercent(row.sigma, 0)}</td>
            <td className="py-1 pr-3">{formatMoney(row.price, 4)}</td>
            <td className="py-1">{row.vegaPerPoint === null ? 'undefined at this boundary' : formatNumber(row.vegaPerPoint, 4)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MoneynessTable({ explorer }: { explorer: ExplorerInput }) {
  const rows = itmOtmRows(explorer);
  return (
    <table className="w-full text-left text-sm">
      <caption className="mb-1 text-left text-muted">Calls with strike 100, 30 days, and 20% volatility.</caption>
      <thead>
        <tr className="text-muted">
          <th className="py-1 pr-3 font-medium">Case</th>
          <th className="py-1 pr-3 font-medium">Price</th>
          <th className="py-1 pr-3 font-medium">Extrinsic</th>
          <th className="py-1 font-medium">Delta</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.S} className="tabular border-t border-line">
            <td className="py-1 pr-3">{row.label}</td>
            <td className="py-1 pr-3">{formatMoney(row.price, 4)}</td>
            <td className="py-1 pr-3">{formatMoney(row.extrinsic, 4)}</td>
            <td className="py-1">{row.delta === null ? 'undefined at this boundary' : formatNumber(row.delta, 4)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function GammaCompare({ explorer }: { explorer: ExplorerInput }) {
  const at = (days: number) => blackScholes(marketFromExplorer({ ...explorer, S: explorer.K, days }), 'call').gamma;
  const near = at(5);
  const far = at(60);
  return (
    <p>
      At the strike, call gamma with 5 days left is {near === null ? 'undefined at this boundary' : formatNumber(near, 4)}.
      With 60 days left it is {far === null ? 'undefined at this boundary' : formatNumber(far, 4)}.
      {near !== null && far !== null && near > far ? ' The shorter-dated gamma is larger in this comparison.' : ''}
      {' '}The surface masks gamma exactly at expiration and at zero volatility instead of drawing those points as zero.
    </p>
  );
}

function LosingTrade() {
  const story = losingTradeStory();
  const loss = story.pnlPerShare < 0;
  return (
    <div className="space-y-2">
      <p>
        Entry: buy the {story.entry.days}-day call at spot {story.entry.S}, strike {story.entry.K}, volatility{' '}
        {formatPercent(story.entry.sigma)}. The model premium is {formatMoney(story.entryPrice, 4)} per share
        ({formatMoney(story.entryPrice * story.multiplier, 2)} per contract at multiplier {story.multiplier}).
      </p>
      <p>
        If the underlying moves from {story.entry.S} to {story.after.S} and time and volatility stay at the entry
        values, the model price becomes {formatMoney(story.spotOnlyPrice, 4)}. That spot-only reprice is a{' '}
        {story.directionalPerShare >= 0 ? 'gain' : 'loss'} of {formatMoney(Math.abs(story.directionalPerShare), 4)} per share.
      </p>
      <p>
        The full reprice uses spot {story.after.S}, {story.after.days} days, and volatility {formatPercent(story.after.sigma)}.
        The price is {formatMoney(story.afterPrice, 4)} per share. That is a {loss ? 'loss' : 'gain'} of{' '}
        {formatMoney(Math.abs(story.pnlPerShare), 4)} per share, or {formatMoney(Math.abs(story.pnlPerShare) * story.multiplier, 2)} per
        contract. {loss ? 'The favorable spot move was not enough to offset time and volatility.' : 'On these inputs the full reprice is not a loss.'}
      </p>
    </div>
  );
}
