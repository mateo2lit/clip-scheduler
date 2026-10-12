"use client";

import { useState, type ReactNode } from "react";
import { CaretRight } from "@phosphor-icons/react/dist/ssr";

/**
 * A platform card's rarely used settings, collapsed by default so the upload page
 * stays simple. Matches the "Customize caption" row. When some of the hidden
 * settings differ from their defaults (from a template, a draft or Upload
 * Defaults), the closed row says how many, so nothing is changed out of sight.
 */
export function MoreOptions({
  platformName,
  changedCount = 0,
  className = "pt-4 border-t border-white/10",
  children,
}: {
  platformName: string;
  /** How many of the hidden settings are not at their default. */
  changedCount?: number;
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={className}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 text-xs text-white/40 transition-colors hover:text-white/70"
      >
        <CaretRight className={`h-3 w-3 transition-transform ${open ? "rotate-90" : ""}`} weight="bold" />
        More {platformName} options
        {!open && changedCount > 0 && (
          <span className="rounded-full bg-blue-400/15 px-1.5 py-px text-[10px] font-medium text-blue-200">
            {changedCount} changed
          </span>
        )}
      </button>
      {open && <div className="mt-3 space-y-4">{children}</div>}
    </div>
  );
}
