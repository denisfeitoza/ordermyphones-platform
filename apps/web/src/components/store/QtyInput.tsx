import { useEffect, useState, type InputHTMLAttributes } from 'react';

/** Largest quantity a single line accepts (well inside Postgres int). */
export const MAX_LINE_QTY = 100_000;

export function clampQty(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(MAX_LINE_QTY, Math.max(1, Math.floor(n)));
}

/**
 * Quantity field that lets the buyer clear it and type freely ("300" no
 * longer becomes "1300" because an empty field snapped back to 1). The
 * draft is committed — clamped to 1…MAX_LINE_QTY — on every valid
 * keystroke, and restored to the last value when left empty on blur.
 */
export function QtyInput({
  value,
  onChange,
  ...props
}: { value: number; onChange: (n: number) => void } & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'>) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <input
      {...props}
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      value={draft}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, '');
        setDraft(digits);
        if (digits !== '') onChange(clampQty(Number(digits)));
      }}
      onBlur={(e) => {
        if (draft === '') setDraft(String(value));
        props.onBlur?.(e);
      }}
    />
  );
}
