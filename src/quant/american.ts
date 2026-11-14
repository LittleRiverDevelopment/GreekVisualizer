/**
 * Cox–Ross–Rubinstein binomial tree for American and European exercise.
 *
 * This is not the Black–Scholes formula. Early exercise is allowed only in the
 * American tree: at each node the value is the maximum of intrinsic value and
 * the discounted risk-neutral continuation.
 *
 * u = exp(sigma √Δt), d = 1/u,
 * p* = (exp((r − q) Δt) − d) / (u − d),
 * continuation = exp(−r Δt) (p* V_up + (1 − p*) V_down).
 *
 * The tree is invalid when sigma = 0 (u = d) or when p* is not inside (0, 1).
 * Those cases return ok: false, or a separate deterministic scan when sigma = 0.
 * American Greeks are not computed. Finite differences on a CRR tree oscillate
 * with the step count and are not shown.
 */

import { blackScholes, intrinsicValue, zeroVolPrice, type Market, type Right } from './black-scholes';

export interface TreeResult {
  ok: boolean;
  message: string | null;
  /** American or European tree price. Null when the tree is not valid. */
  price: number | null;
  steps: number;
  riskNeutralProb: number | null;
  style: 'american' | 'european' | 'deterministic';
}

export interface AmericanComparison {
  inputsOk: boolean;
  message: string | null;
  steps: number;
  riskNeutralProb: number | null;
  american: number | null;
  europeanTree: number | null;
  europeanAnalytic: number | null;
  /** American tree minus European tree. Isolates early exercise on the same grid. */
  earlyExercisePremium: number | null;
  /** True when sigma = 0 and the deterministic scan was used instead of CRR. */
  deterministic: boolean;
}

function fail(steps: number, message: string, style: TreeResult['style']): TreeResult {
  return { ok: false, message, price: null, steps, riskNeutralProb: null, style };
}

/**
 * Zero-volatility value. European value is the discounted terminal payoff.
 * American value is the best discounted intrinsic value along the deterministic
 * path S_t = S exp((r − q) t), scanned on a fixed time grid plus the endpoints.
 * The CRR tree cannot represent this path because u = d.
 */
function deterministicValue(market: Market, right: Right, style: 'american' | 'european'): number {
  if (style === 'european') return zeroVolPrice(market, right);
  const { S, K, T, r, q } = market;
  const samples = 2000;
  let best = 0;
  for (let i = 0; i <= samples; i += 1) {
    const t = (T * i) / samples;
    const spot = S * Math.exp((r - q) * t);
    const exercise = Math.exp(-r * t) * intrinsicValue(spot, K, right);
    if (exercise > best) best = exercise;
  }
  return best;
}

export function binomialPrice(
  market: Market,
  right: Right,
  steps: number,
  style: 'american' | 'european',
): TreeResult {
  if (!Number.isInteger(steps) || steps < 1) {
    return fail(steps, 'Step count must be a whole number of at least 1.', style);
  }
  if (!(market.S > 0) || !(market.K > 0) || !(market.T >= 0)) {
    return fail(steps, 'Spot and strike must be positive, and time cannot be negative.', style);
  }
  if (!Number.isFinite(market.sigma) || market.sigma < 0 || !Number.isFinite(market.r) || !Number.isFinite(market.q)) {
    return fail(steps, 'Volatility, rate, and dividend yield must be finite, and volatility cannot be negative.', style);
  }
  if (market.T === 0) {
    return {
      ok: true,
      message: 'At expiration the tree price is the intrinsic payoff.',
      price: intrinsicValue(market.S, market.K, right),
      steps,
      riskNeutralProb: null,
      style,
    };
  }
  if (market.sigma === 0) {
    return {
      ok: true,
      message:
        'Volatility is zero, so the up and down moves coincide and the Cox–Ross–Rubinstein tree is singular. The value shown is a deterministic scan, not a binomial tree.',
      price: deterministicValue(market, right, style),
      steps,
      riskNeutralProb: null,
      style: 'deterministic',
    };
  }

  const dt = market.T / steps;
  const logU = market.sigma * Math.sqrt(dt);
  const growth = Math.exp((market.r - market.q) * dt);
  const u = Math.exp(logU);
  const d = Math.exp(-logU);
  const denominator = u - d;
  if (!(denominator > 0) || !Number.isFinite(growth)) {
    return fail(steps, 'The tree moves are not finite for these inputs.', style);
  }
  const p = (growth - d) / denominator;
  if (!(p > 0 && p < 1) || !Number.isFinite(p)) {
    return fail(
      steps,
      'The risk-neutral probability is outside (0, 1), so this Cox–Ross–Rubinstein tree is not valid. Increase the step count or change the rate, dividend, or volatility. No tree price is shown.',
      style,
    );
  }

  const discount = Math.exp(-market.r * dt);
  const logS = Math.log(market.S);
  const values = new Array<number>(steps + 1);
  for (let j = 0; j <= steps; j += 1) {
    const spot = Math.exp(logS + (2 * j - steps) * logU);
    values[j] = intrinsicValue(spot, market.K, right);
  }

  for (let step = steps - 1; step >= 0; step -= 1) {
    for (let j = 0; j <= step; j += 1) {
      const up = values[j + 1];
      const down = values[j];
      if (up === undefined || down === undefined) {
        return fail(steps, 'The tree could not be filled.', style);
      }
      const continuation = discount * (p * up + (1 - p) * down);
      if (style === 'american') {
        const spot = Math.exp(logS + (2 * j - step) * logU);
        const exercise = intrinsicValue(spot, market.K, right);
        values[j] = Math.max(continuation, exercise);
      } else {
        values[j] = continuation;
      }
    }
  }

  const price = values[0];
  if (price === undefined || !Number.isFinite(price)) {
    return fail(steps, 'The tree price was not finite.', style);
  }
  return { ok: true, message: null, price, steps, riskNeutralProb: p, style };
}

export function compareAmerican(market: Market, right: Right, steps: number): AmericanComparison {
  const rounded = Number.isFinite(steps) ? Math.round(steps) : 0;
  let analytic: number | null = null;
  try {
    analytic = blackScholes(market, right).price;
  } catch (error) {
    return {
      inputsOk: false,
      message: error instanceof Error ? error.message : 'These inputs cannot be priced.',
      steps: rounded,
      riskNeutralProb: null,
      american: null,
      europeanTree: null,
      europeanAnalytic: null,
      earlyExercisePremium: null,
      deterministic: false,
    };
  }

  const american = binomialPrice(market, right, rounded, 'american');
  const european = binomialPrice(market, right, rounded, 'european');
  const deterministic = american.style === 'deterministic' || european.style === 'deterministic';
  const message = american.message ?? european.message;
  const ok = american.ok && european.ok && american.price !== null && european.price !== null;
  return {
    inputsOk: ok,
    message,
    steps: rounded,
    riskNeutralProb: american.riskNeutralProb,
    american: american.price,
    europeanTree: european.price,
    europeanAnalytic: analytic,
    earlyExercisePremium:
      american.price !== null && european.price !== null ? american.price - european.price : null,
    deterministic,
  };
}
