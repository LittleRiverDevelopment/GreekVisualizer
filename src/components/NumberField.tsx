import { useEffect, useId, useState } from 'react';
import { trimNumber } from '../lib/format';

interface NumberFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  unit: string;
  hint: string;
  validate?: (value: number) => string | null;
  testId?: string;
  slider?: boolean;
}

export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step,
  unit,
  hint,
  validate,
  testId,
  slider = true,
}: NumberFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const [text, setText] = useState(trimNumber(value));
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!focused) setText(trimNumber(value));
  }, [value, focused]);

  const outside = value < min || value > max;
  const sliderValue = Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

  function commit(raw: string) {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      setError('Enter a finite number.');
      return;
    }
    const message = validate?.(parsed) ?? null;
    setError(message);
    if (!message) onChange(parsed);
  }

  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium text-ink">
        {label}
        <span className="ml-1 font-normal text-muted">({unit})</span>
      </label>
      <div className="flex items-center gap-2">
        {slider ? (
          <input
            aria-label={`${label} slider`}
            type="range"
            min={min}
            max={max}
            step={step}
            value={sliderValue}
            onChange={(event) => {
              const next = Number(event.target.value);
              setError(null);
              onChange(next);
            }}
            className="h-2 w-full accent-accent"
          />
        ) : null}
        <input
          id={id}
          data-testid={testId}
          inputMode="decimal"
          type="number"
          step="any"
          value={text}
          aria-invalid={error ? true : undefined}
          aria-describedby={`${hintId}${error ? ` ${errorId}` : ''}`}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            commit(text);
          }}
          onChange={(event) => {
            const next = event.target.value;
            setText(next);
            const parsed = Number(next);
            if (!Number.isFinite(parsed)) return;
            const message = validate?.(parsed) ?? null;
            setError(message);
            if (!message) onChange(parsed);
          }}
          className="tabular w-28 shrink-0 rounded-md border border-line bg-card px-2 py-1.5 text-sm text-ink"
        />
      </div>
      <p id={hintId} className="text-xs text-muted">
        {hint}
        {outside ? ' This value is outside the slider range. The typed number is still used.' : ''}
      </p>
      {error ? (
        <p id={errorId} role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
