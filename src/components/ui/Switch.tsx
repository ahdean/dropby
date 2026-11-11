"use client";

import type { ReactNode } from "react";

/** A two-position lever: "on" lights up. Used for yes/no settings. */
export function Switch({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className={`flex min-h-[44px] items-center justify-between gap-4 ${disabled ? "opacity-50" : "cursor-pointer"}`}>
      <span>
        <span className="block text-ink">{label}</span>
        {hint && <span className="block text-[17px] text-ink-faint">{hint}</span>}
      </span>
      <span className="relative inline-flex shrink-0">
        <input
          type="checkbox"
          role="switch"
          className="peer sr-only"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="slot block h-7 w-14 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-locked" />
        <span
          className={`tile absolute top-[3px] h-[22px] w-6 transition-[left] duration-100 ${
            checked ? "tile-join left-[29px]" : "left-[3px]"
          }`}
          aria-hidden="true"
        />
      </span>
    </label>
  );
}

/** A row of mutually exclusive tiles, e.g. "One-off | Weekly". */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: ReactNode; activeClass?: string }[];
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-2">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={`btn tile flex-1 ${active ? (option.activeClass ?? "tile-locked") : "tile-dark"}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
