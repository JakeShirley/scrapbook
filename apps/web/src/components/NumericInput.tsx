import { type InputHTMLAttributes, useEffect, useRef, useState } from "react";

type NumericInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "defaultValue" | "onChange" | "type" | "value"
> & {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
};

const clamp = (value: number, min: number | undefined, max: number | undefined): number => {
  let next = value;
  if (min !== undefined) next = Math.max(min, next);
  if (max !== undefined) next = Math.min(max, next);
  return next;
};

export function NumericInput({
  value,
  onChange,
  min,
  max,
  step,
  onBlur,
  onFocus,
  onKeyDown,
  ...rest
}: NumericInputProps) {
  const [draft, setDraft] = useState<string>(() => String(value));
  const focusedRef = useRef(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const valueRef = useRef(value);
  const minRef = useRef(min);
  const maxRef = useRef(max);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    if (!focusedRef.current) setDraft(String(value));
    valueRef.current = value;
  }, [value]);
  useEffect(() => {
    minRef.current = min;
  }, [min]);
  useEffect(() => {
    maxRef.current = max;
  }, [max]);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const commitDraft = (raw: string): boolean => {
    if (raw.trim() === "") {
      setDraft(String(valueRef.current));
      return false;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      setDraft(String(valueRef.current));
      return false;
    }
    const next = clamp(parsed, minRef.current, maxRef.current);
    setDraft(String(next));
    if (next !== valueRef.current) onChangeRef.current(next);
    return true;
  };

  // The browser fires a native `change` event on number inputs whenever the
  // value is committed via the spinner buttons (and once on blur after typing).
  // React's `onChange` prop maps to the native `input` event, so it cannot
  // distinguish typing from stepper clicks reliably. Listen to the real
  // `change` event so spinner clicks commit immediately while typing only
  // updates the draft until Enter/blur.
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return undefined;
    const handler = () => {
      const raw = input.value;
      if (raw.trim() === "") {
        setDraft(String(valueRef.current));
        return;
      }
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) {
        setDraft(String(valueRef.current));
        return;
      }
      const next = clamp(parsed, minRef.current, maxRef.current);
      setDraft(String(next));
      if (next !== valueRef.current) onChangeRef.current(next);
    };
    input.addEventListener("change", handler);
    return () => input.removeEventListener("change", handler);
  }, []);

  return (
    <input
      {...rest}
      ref={inputRef}
      type="number"
      value={draft}
      {...(min !== undefined ? { min } : {})}
      {...(max !== undefined ? { max } : {})}
      {...(step !== undefined ? { step } : {})}
      onFocus={(event) => {
        focusedRef.current = true;
        onFocus?.(event);
      }}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onBlur={(event) => {
        focusedRef.current = false;
        commitDraft(event.currentTarget.value);
        onBlur?.(event);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commitDraft(event.currentTarget.value);
          event.currentTarget.blur();
        }
        onKeyDown?.(event);
      }}
    />
  );
}
