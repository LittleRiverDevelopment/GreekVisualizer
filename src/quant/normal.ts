/**
 * Standard normal density and CDF.
 *
 * The CDF is Φ(x) = ½ erfc(−x / √2). erf and erfc follow the definitions in
 * NIST DLMF §7.2 (https://dlmf.nist.gov/7.2). Numerically:
 * - |z| < 1.5: Taylor series for erf
 * - |z| ≥ 1.5: Lentz continued fraction for erfc
 *
 * Absolute error against a double-precision erf is on the order of 1e-15
 * for ordinary arguments. That bound is locked in by tests; it is not a
 * claim of correctly rounded last-bit accuracy.
 */

const SQRT_PI = Math.sqrt(Math.PI);
const SQRT2 = Math.SQRT2;
const INV_SQRT_2PI = 1 / Math.sqrt(2 * Math.PI);

/** Standard normal PDF φ(x). */
export function normalPdf(x: number): number {
  if (!Number.isFinite(x)) return NaN;
  return Math.exp(-0.5 * x * x) * INV_SQRT_2PI;
}

function erfSeries(ax: number): number {
  let sum = 0;
  let term = ax;
  for (let n = 0; n < 300; n += 1) {
    sum += term / (2 * n + 1);
    const next = (term * -ax * ax) / (n + 1);
    if (Math.abs(next) < 1e-18 * (Math.abs(sum) + 1) && n > 2) break;
    term = next;
  }
  return (sum * 2) / SQRT_PI;
}

/**
 * Complementary error function for x > 0 via the continued fraction
 * erfc(x) = exp(−x²) / (√π · f),
 * f = x + (1/2) / (x + (2/2) / (x + (3/2) / (x + …))).
 */
function erfcContinuedFraction(x: number): number {
  const tiny = 1e-30;
  let f = x === 0 ? tiny : x;
  let c = f;
  let d = 0;
  for (let j = 1; j < 300; j += 1) {
    const a = j / 2;
    const b = x;
    d = b + a * d;
    if (d === 0) d = tiny;
    c = b + a / c;
    if (c === 0) c = tiny;
    d = 1 / d;
    const delta = c * d;
    f *= delta;
    if (Math.abs(delta - 1) < 1e-15) break;
  }
  return Math.exp(-x * x) / (SQRT_PI * f);
}

/** Standard normal CDF Φ(x). Non-finite inputs return NaN. */
export function normalCdf(x: number): number {
  if (x === Infinity) return 1;
  if (x === -Infinity) return 0;
  if (!Number.isFinite(x) || Number.isNaN(x)) return NaN;
  if (x === 0) return 0.5;

  const ax = Math.abs(x);
  const t = ax / SQRT2;

  let upperTail: number;
  if (t === 0) {
    upperTail = 0.5;
  } else if (t < 1.5) {
    const erf = erfSeries(t);
    upperTail = 0.5 * (1 - erf);
  } else if (t > 12) {
    // Far past the point where the tail underflows to 0 in IEEE-754.
    upperTail = 0;
  } else {
    upperTail = 0.5 * erfcContinuedFraction(t);
  }

  if (x > 0) {
    const value = 1 - upperTail;
    return value > 1 ? 1 : value;
  }
  return upperTail < 0 ? 0 : upperTail;
}
