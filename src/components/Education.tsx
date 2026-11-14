import type { ReactNode } from 'react';
import {
  blackScholes,
  metricUnit,
  type Valuation,
} from '../quant/black-scholes';
import { formatMoney, formatNumber, formatPercent, signedWord } from '../lib/format';
import type { ExplorerInput } from '../scenario/model';
import { marketFromExplorer } from '../scenario/model';
import { Formula } from './Formula';

interface EducationProps {
  explorer: ExplorerInput;
  valuation: Valuation;
  onExample: (patch: Partial<ExplorerInput>) => void;
}

export function Education({ explorer, valuation, onExample }: EducationProps) {
  const market = marketFromExplorer(explorer);
  const shock = 1;
  const up = safePrice({ ...market, S: market.S + shock }, explorer.right);
  const actual = up === null ? null : up - valuation.price;
  const deltaApprox = valuation.delta === null ? null : valuation.delta * shock;
  const both =
    valuation.delta === null || valuation.gamma === null
      ? null
      : valuation.delta * shock + 0.5 * valuation.gamma * shock * shock;
  const relation = explorer.S === explorer.K ? 'equal to' : explorer.S > explorer.K ? 'above' : 'below';
  const callItm = explorer.S > explorer.K;
  const itm = explorer.S === explorer.K ? null : explorer.right === 'call' ? callItm : !callItm;

  return (
    <section className="space-y-4" aria-label="Explanations">
      <div className="panel">
        <h2 className="text-base font-semibold">What this scenario says</h2>
        <p className="mt-2 text-sm leading-6 text-ink">
          This is a European {explorer.right}. Spot is {relation} the strike
          {itm === null ? ', so the contract is at the money.' : itm ? ', so the contract is in the money.' : ', so the contract is out of the money.'}{' '}
          The model price is {formatMoney(valuation.price, 4)} per share. Intrinsic value, the undiscounted exercise
          payoff, is {formatMoney(valuation.intrinsic, 4)}. Extrinsic value is {formatMoney(valuation.extrinsic, 4)}.
          {valuation.extrinsic < 0
            ? ' That extrinsic value is negative: a European option cannot be exercised early, so the model price can sit below intrinsic value.'
            : ' Extrinsic value is not promised to stay positive. European exercise can put the model price below intrinsic value.'}
        </p>
      </div>

      <div className="panel">
        <h2 className="text-base font-semibold">A one-dollar local approximation</h2>
        {valuation.delta === null || valuation.gamma === null ? (
          <p className="mt-2 text-sm text-ink">
            The approximation is unavailable here. {valuation.boundary === 'expiration' ? 'At expiration the Greeks are undefined and the price is intrinsic value.' : 'Gamma is undefined at zero volatility, so the delta–gamma step is not shown.'}
          </p>
        ) : (
          <div className="mt-2 space-y-2 text-sm leading-6 text-ink">
            <p>
              Delta says a ${shock.toFixed(0)} rise in the underlying changes the price by about {formatNumber(deltaApprox, 4)} per
              share. Adding the gamma term, ΔV ≈ delta×ΔS + ½×gamma×(ΔS)², gives {formatNumber(both, 4)}. Repricing the
              full formula at spot {formatNumber(explorer.S + shock, 4)} changes the price by {formatNumber(actual, 4)}.
              The gap is the rest of the Taylor series, plus any change in discounting along the new spot.
            </p>
            <p>Greeks are local sensitivities. They are not a forecast of a large move, and delta is not the probability of expiring in the money.</p>
          </div>
        )}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <GreekNote
          title="Delta"
          unit={metricUnit('delta')}
          value={valuation.delta}
          meaning="How much the model price changes for a $1 rise in the underlying, holding the other inputs fixed."
          sign={
            valuation.delta === null
              ? 'The sign is undefined at this boundary.'
              : `The sign is ${signedWord(valuation.delta)}. A long call delta is between 0 and e^{−qT}. A long put delta is between −e^{−qT} and 0.`
          }
          example={
            valuation.delta === null
              ? 'No per-share example at this boundary.'
              : `Here, a $1 spot increase is worth about ${formatNumber(valuation.delta, 4)} per share before gamma.`
          }
        />
        <GreekNote
          title="Gamma"
          unit={metricUnit('gamma')}
          value={valuation.gamma}
          meaning="How much delta changes for a $1 rise in the underlying. Call and put gamma are equal in this model."
          sign="Vanilla gamma is nonnegative away from the boundaries. It is largest near the strike and rises as expiration approaches, with volatility held fixed."
          example={
            valuation.gamma === null
              ? 'Gamma is undefined at this boundary, not recorded as zero.'
              : `Here gamma is ${formatNumber(valuation.gamma, 4)}. A $1 move changes delta by about that amount.`
          }
        />
        <GreekNote
          title="Theta"
          unit={metricUnit('theta')}
          value={valuation.thetaPerDay}
          meaning="How much the model price changes when one calendar day passes and time to expiration shrinks. The figure is the annual derivative divided by 365."
          sign="Theta is not negative for every long European option. A deep in-the-money put can gain from the passage of time when interest on the strike dominates."
          example={
            valuation.thetaPerDay === null
              ? 'Theta is undefined at expiration.'
              : `Passing one calendar day, with nothing else changed, moves this price by about ${formatNumber(valuation.thetaPerDay, 4)} per share. The sign is ${signedWord(valuation.thetaPerDay)}.`
          }
          action={
            <button
              type="button"
              className="btn mt-2"
              onClick={() => onExample({ right: 'put', S: 60, K: 100, days: 182.5, sigma: 0.15, r: 0.08, q: 0 })}
            >
              Load a long put with positive theta
            </button>
          }
        />
        <GreekNote
          title="Vega"
          unit={metricUnit('vega')}
          value={valuation.vegaPerPoint}
          meaning="How much the model price changes when volatility rises by one percentage point. The raw derivative is with respect to decimal volatility; the card multiplies by 0.01."
          sign="For a standard European call or put, with time left and the other inputs fixed, vega is nonnegative. A higher volatility raises the price."
          example={
            valuation.vegaPerPoint === null
              ? 'Vega is undefined at expiration.'
              : `One extra volatility point is worth about ${formatNumber(valuation.vegaPerPoint, 4)} per share here.`
          }
        />
        <GreekNote
          title="Rho"
          unit={metricUnit('rho')}
          value={valuation.rhoPerPoint}
          meaning="How much the model price changes when the continuous risk-free rate rises by one percentage point."
          sign="A call’s rho is typically positive and a put’s rho typically negative, because a higher rate lowers the present value of a fixed strike."
          example={
            valuation.rhoPerPoint === null
              ? 'Rho is undefined at expiration.'
              : `One extra rate point changes this price by about ${formatNumber(valuation.rhoPerPoint, 4)} per share. The sign is ${signedWord(valuation.rhoPerPoint)}.`
          }
        />
      </div>

      <details className="panel">
        <summary className="cursor-pointer text-base font-semibold">Terms</summary>
        <dl className="mt-3 space-y-3 text-sm leading-6">
          <Item term="Call" text="The right to buy the underlying at the strike at expiration. Payoff is max(S − K, 0)." />
          <Item term="Put" text="The right to sell the underlying at the strike at expiration. Payoff is max(K − S, 0)." />
          <Item term="Strike" text={`The fixed price in the payoff. This scenario uses ${formatMoney(explorer.K, 2)}.`} />
          <Item term="Premium" text="The option’s price. In the explorer this is the model value per share, not a premium you negotiated." />
          <Item term="Moneyness" text="In the money means immediate exercise would have a positive payoff. At the money means spot equals strike. Out of the money means the payoff would be zero." />
          <Item term="Time" text="Calendar days divided by 365. This is a modeling convention, not a claim about a listed contract’s day-count." />
          <Item term="Volatility" text={`Annualized standard deviation of the log of the underlying, entered as a percent and stored as a decimal. This scenario uses ${formatPercent(explorer.sigma)}.`} />
          <Item term="Dividend yield" text="A continuous yield q. The forward is S exp((r − q)T). It is not a schedule of cash dividends." />
          <Item term="Intrinsic" text="max(S − K, 0) for a call and max(K − S, 0) for a put, with no discounting." />
          <Item term="Extrinsic" text="Model price minus intrinsic value. It can be negative for a European option." />
        </dl>
      </details>

      <details className="panel">
        <summary className="cursor-pointer text-base font-semibold">Formulas and display units</summary>
        <div className="mt-3 space-y-2 text-sm leading-6">
          <p>For T &gt; 0 and σ &gt; 0:</p>
          <Formula display tex="d_1=\dfrac{\ln(S/K)+(r-q+\sigma^2/2)\,T}{\sigma\sqrt{T}},\quad d_2=d_1-\sigma\sqrt{T}" />
          <Formula display tex="C=Se^{-qT}N(d_1)-Ke^{-rT}N(d_2)" />
          <Formula display tex="P=Ke^{-rT}N(-d_2)-Se^{-qT}N(-d_1)" />
          <Formula display tex="\Delta_{\mathrm{call}}=e^{-qT}N(d_1),\quad \Delta_{\mathrm{put}}=-e^{-qT}N(-d_1)" />
          <Formula display tex="\Gamma=\dfrac{e^{-qT}\varphi(d_1)}{S\sigma\sqrt{T}}" />
          <Formula display tex="\theta_{\mathrm{day}}=\theta_{\mathrm{year}}/365,\quad \mathrm{vega}_{\mathrm{point}}=0.01\,\partial V/\partial\sigma,\quad \rho_{\mathrm{point}}=0.01\,\partial V/\partial r" />
          <p>
            Put–call parity: C − P = S e<sup>−qT</sup> − K e<sup>−rT</sup>. At expiration the price is intrinsic and every
            Greek is undefined. At zero volatility the price is the discounted deterministic payoff; gamma stays
            undefined. Time is days / 365. A contract multiplier is applied only to position value, P&amp;L, and position
            Greeks, not to the per-share cards.
          </p>
        </div>
      </details>

      <details className="panel">
        <summary className="cursor-pointer text-base font-semibold">Assumptions</summary>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-6">
          <li>European exercise only, in this tab. American exercise is a separate binomial tree.</li>
          <li>Volatility, the interest rate, and the dividend yield are constant inside one valuation.</li>
          <li>The dividend is a continuous yield. There are no transaction costs.</li>
          <li>The derivation assumes idealized continuous trading and lognormal dynamics.</li>
          <li>The app does not model a volatility smile, liquidity, bid–ask spreads, discrete dividends, or jumps.</li>
          <li>Smooth model prices are not market prices. The assumptions do not remove risk.</li>
        </ul>
      </details>

      <details className="panel">
        <summary className="cursor-pointer text-base font-semibold">Methodology</summary>
        <div className="mt-3 space-y-2 text-sm leading-6">
          <p>
            The call and put formulas are the Black–Scholes–Merton model with a continuous dividend yield. The normal
            CDF is Φ(x) = ½ erfc(−x/√2), using the error-function definitions in the NIST Digital Library of
            Mathematical Functions.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <a className="underline" href="https://doi.org/10.1086/260062">
                Black and Scholes, “The Pricing of Options and Corporate Liabilities,” Journal of Political Economy (1973)
              </a>
            </li>
            <li>
              <a className="underline" href="https://doi.org/10.2307/3003143">
                Merton, “Theory of Rational Option Pricing,” Bell Journal of Economics and Management Science (1973)
              </a>
            </li>
            <li>
              <a className="underline" href="https://dlmf.nist.gov/7.2">
                NIST Digital Library of Mathematical Functions, §7.2, error functions
              </a>
            </li>
            <li>
              <a className="underline" href="https://doi.org/10.1016/0304-405X(79)90015-1">
                Cox, Ross, and Rubinstein, “Option pricing: A simplified approach,” Journal of Financial Economics (1979)
              </a>
              , used by the American tab
            </li>
          </ul>
        </div>
      </details>
    </section>
  );
}

function safePrice(market: ReturnType<typeof marketFromExplorer>, right: ExplorerInput['right']): number | null {
  try {
    return blackScholes(market, right).price;
  } catch {
    return null;
  }
}

function GreekNote({
  title,
  unit,
  value,
  meaning,
  sign,
  example,
  action,
}: {
  title: string;
  unit: string;
  value: number | null;
  meaning: string;
  sign: string;
  example: string;
  action?: ReactNode;
}) {
  return (
    <article className="panel">
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-1 text-xs text-muted">Displayed unit: {unit}</p>
      <p className="tabular mt-2 text-lg">{value === null ? 'undefined at this boundary' : formatNumber(value, 4)}</p>
      <p className="mt-2 text-sm leading-6">{meaning}</p>
      <p className="mt-2 text-sm leading-6">{sign}</p>
      <p className="mt-2 text-sm leading-6">{example}</p>
      {action}
    </article>
  );
}

function Item({ term, text }: { term: string; text: string }) {
  return (
    <div>
      <dt className="font-medium">{term}</dt>
      <dd className="text-muted">{text}</dd>
    </div>
  );
}
