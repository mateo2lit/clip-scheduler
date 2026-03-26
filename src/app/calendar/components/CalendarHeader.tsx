"use client";

import Link from "next/link";
import { PROVIDER_META } from "../types";

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

type Props = {
  view: "month" | "week";
  onViewChange: (v: "month" | "week") => void;
  viewDate: Date;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  platformFilter: string;
  onPlatformFilter: (p: string) => void;
  activePlatforms: string[];
  postCount: number;
};

function getWeekRange(date: Date): string {
  const day = date.getDay();
  const mon = new Date(date); mon.setDate(date.getDate() - ((day + 6) % 7));
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${fmt(mon)} – ${fmt(sun)}`;
}

export function CalendarHeader({ view, onViewChange, viewDate, onPrev, onNext, onToday, platformFilter, onPlatformFilter, activePlatforms, postCount }: Props) {
  const label = view === "month"
    ? `${MONTH_NAMES[viewDate.getMonth()]} ${viewDate.getFullYear()}`
    : getWeekRange(viewDate);

  return (
    <div className="space-y-4 mb-6">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Link href="/dashboard" className="h-8 w-8 rounded-full border border-white/10 bg-white/5 flex items-center justify-center text-white/40 hover:text-white/70 hover:bg-white/10 transition-all shrink-0">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
          </Link>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Calendar</h1>
            <p className="text-xs text-white/35 mt-0.5">{postCount} scheduled</p>
          </div>
        </div>
        <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] p-0.5 shrink-0">
          {(["month", "week"] as const).map(v => (
            <button key={v} onClick={() => onViewChange(v)} className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all capitalize ${view === v ? "bg-white/10 text-white" : "text-white/40 hover:text-white/60"}`}>{v}</button>
          ))}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={onPrev} className="h-8 w-8 rounded-full border border-white/10 bg-white/5 flex items-center justify-center text-white/50 hover:text-white/80 hover:bg-white/10 transition-all">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
          </button>
          <button onClick={onToday} className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/50 hover:bg-white/10 transition-colors">Today</button>
          <span className="text-sm font-semibold min-w-[180px] text-center">{label}</span>
          <button onClick={onNext} className="h-8 w-8 rounded-full border border-white/10 bg-white/5 flex items-center justify-center text-white/50 hover:text-white/80 hover:bg-white/10 transition-all">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
          </button>
        </div>
        <div className="flex-1 flex justify-end">
          <Link href="/uploads" className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-black hover:bg-white/90 transition-colors">New upload</Link>
        </div>
      </div>
      {activePlatforms.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button onClick={() => onPlatformFilter("all")} className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${platformFilter === "all" ? "border-white/20 bg-white/10 text-white" : "border-white/[0.08] text-white/40 hover:border-white/15 hover:text-white/60"}`}>
            All platforms
          </button>
          {activePlatforms.map(key => (
            <button key={key} onClick={() => onPlatformFilter(key === platformFilter ? "all" : key)} className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${platformFilter === key ? "border-white/20 bg-white/10 text-white" : "border-white/[0.08] text-white/40 hover:border-white/15 hover:text-white/60"}`}>
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${PROVIDER_META[key]?.dotClass ?? "bg-white/30"}`} />
              {PROVIDER_META[key]?.label ?? key}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
