export interface ColorRange {
  cmin: number;
  cmax: number;
  cmid?: number;
  clipped: boolean;
}

export function finiteValues(grid: (number | null)[][]): number[] {
  const values: number[] = [];
  for (const row of grid) {
    for (const value of row) {
      if (value !== null && Number.isFinite(value)) values.push(value);
    }
  }
  return values;
}

export function colorRange(values: number[], signed: boolean, robust: boolean): ColorRange {
  if (values.length === 0) return { cmin: -1, cmax: 1, cmid: signed ? 0 : undefined, clipped: false };
  let lo = values[0] ?? 0;
  let hi = lo;
  for (const value of values) {
    if (value < lo) lo = value;
    if (value > hi) hi = value;
  }
  let clipped = false;
  if (robust && values.length > 30) {
    const sorted = [...values].sort((a, b) => a - b);
    const at = (p: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))))] ?? lo;
    const qlo = at(0.01);
    const qhi = at(0.99);
    if (qhi > qlo && (qlo > lo || qhi < hi)) {
      lo = qlo;
      hi = qhi;
      clipped = true;
    }
  }
  if (signed) {
    const limit = Math.max(Math.abs(lo), Math.abs(hi), 1e-12);
    return { cmin: -limit, cmax: limit, cmid: 0, clipped };
  }
  if (lo === hi) return { cmin: lo - 1, cmax: hi + 1, clipped: false };
  return { cmin: lo, cmax: hi, clipped };
}
