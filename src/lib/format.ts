export function formatNumber(value: number | null, digits = 4): string {
  if (value === null) return 'undefined at this boundary';
  if (!Number.isFinite(value)) return 'unavailable';
  const abs = Math.abs(value);
  if (abs !== 0 && (abs < 1e-4 || abs >= 1e7)) return value.toExponential(3);
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

export function formatMoney(value: number | null, digits = 2): string {
  if (value === null) return 'undefined at this boundary';
  if (!Number.isFinite(value)) return 'unavailable';
  const sign = value < 0 ? '−' : '';
  const abs = Math.abs(value);
  const body =
    abs !== 0 && (abs < 1e-4 || abs >= 1e7)
      ? abs.toExponential(3)
      : abs.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return `${sign}$${body}`;
}

export function formatPercent(decimal: number, digits = 2): string {
  if (!Number.isFinite(decimal)) return 'unavailable';
  return `${(decimal * 100).toLocaleString('en-US', { maximumFractionDigits: digits })}%`;
}

export function trimNumber(value: number): string {
  if (!Number.isFinite(value)) return '';
  const rounded = Math.round(value * 1e8) / 1e8;
  return String(rounded);
}

export function signedWord(value: number): string {
  if (value > 0) return 'positive';
  if (value < 0) return 'negative';
  return 'zero';
}
