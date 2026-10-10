"use client";

import type { ReactNode } from "react";

export type FormatOption<T extends string> = {
  value: T;
  label: string;
  hint?: string;
  icon?: ReactNode;
};

/** Segmented card picker for a platform's post format (Short vs Video, Reel vs Post…). */
export function FormatPicker<T extends string>({
  label = "Format",
  options,
  value,
  onChange,
}: {
  label?: string;
  options: FormatOption<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div>
      <label className="block text-xs text-white/40 mb-1.5">{label}</label>
      <div role="radiogroup" aria-label={label} className="flex gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
        {options.map((opt) => {
          const selected = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(opt.value)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-left transition-all ${
                selected
                  ? "bg-blue-400 text-black shadow-[0_4px_16px_rgba(96,165,250,0.25)]"
                  : "text-white/60 hover:bg-white/5 hover:text-white/85"
              }`}
            >
              {opt.icon && <span className={`shrink-0 ${selected ? "text-black" : "text-white/45"}`}>{opt.icon}</span>}
              <span className="flex min-w-0 flex-col leading-tight">
                <span className="text-sm font-medium">{opt.label}</span>
                {opt.hint && (
                  <span className={`truncate text-[11px] ${selected ? "text-black/60" : "text-white/35"}`}>{opt.hint}</span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
