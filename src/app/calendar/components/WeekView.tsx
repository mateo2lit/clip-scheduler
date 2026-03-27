// src/app/calendar/components/WeekView.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { PostGroup, isSameDay } from "../types";
import { TimeSlot } from "./TimeSlot";

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatHour(h: number): string {
  if (h === 0) return "12 AM";
  if (h < 12) return `${h} AM`;
  if (h === 12) return "12 PM";
  return `${h - 12} PM`;
}

function getWeekDays(viewDate: Date): Date[] {
  const day = viewDate.getDay();
  const mon = new Date(viewDate);
  mon.setDate(viewDate.getDate() - ((day + 6) % 7)); // Monday
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    return d;
  });
}

type Props = {
  viewDate: Date;
  groups: PostGroup[];
  supabaseUrl: string;
  onCardClick: (group: PostGroup, rect: DOMRect) => void;
};

export function WeekView({ viewDate, groups, supabaseUrl, onCardClick }: Props) {
  const today = new Date();
  const days = getWeekDays(viewDate);
  const [currentHour, setCurrentHour] = useState(new Date().getHours());
  const [currentMinute, setCurrentMinute] = useState(new Date().getMinutes());
  const nowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentHour(new Date().getHours());
      setCurrentMinute(new Date().getMinutes());
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  // Scroll to current time on mount
  useEffect(() => {
    nowRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, []);

  return (
    <div className="rounded-3xl border border-white/[0.08] bg-white/[0.025] overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.4)]">
      {/* Scrollable container — header inside so columns align with scrollbar */}
      <div className="overflow-y-auto max-h-[calc(100vh-240px)]">
        {/* Header row — sticky inside scroll container */}
        <div className="grid sticky top-0 z-10 bg-[#0a0a0a] border-b border-white/[0.06]" style={{ gridTemplateColumns: "56px repeat(7, 1fr)" }}>
          <div className="border-r border-white/[0.04]" /> {/* time gutter */}
          {days.map((day, i) => {
            const isToday = isSameDay(day, today);
            const isPast = day < today && !isToday;
            return (
              <div key={i} className={`py-3 text-center border-r border-white/[0.04] last:border-r-0 ${isPast ? "opacity-50" : ""}`}>
                <p className="text-[10px] text-white/40 uppercase tracking-wider">{DAY_NAMES[day.getDay()]}</p>
                <p className={`text-lg font-semibold mt-0.5 ${isToday ? "text-blue-400" : "text-white/80"}`}>{day.getDate()}</p>
              </div>
            );
          })}
        </div>

        {/* Time grid */}
        {HOURS.map(hour => {
          return (
            <div key={hour} style={{ gridTemplateColumns: "56px repeat(7, 1fr)" }} className="grid relative">
              {/* Hour label */}
              <div className="border-r border-white/[0.04] flex items-start justify-end pr-2 pt-1">
                <span className="text-[10px] text-white/25 tabular-nums">{formatHour(hour)}</span>
              </div>

              {/* Day columns */}
              {days.map((day, i) => {
                const isToday = isSameDay(day, today);
                const isPastCol = day < today && !isToday;
                const isPastHour = isToday && hour < currentHour;

                return (
                  <div key={i} className={`relative border-r border-white/[0.04] last:border-r-0 min-w-0 overflow-hidden ${isPastCol ? "opacity-50" : ""}`}>
                    <TimeSlot
                      date={day}
                      hour={hour}
                      groups={groups}
                      supabaseUrl={supabaseUrl}
                      onCardClick={onCardClick}
                      isPast={isPastHour}
                    />
                    {/* Current time indicator */}
                    {isToday && hour === currentHour && (
                      <div
                        ref={nowRef}
                        className="absolute left-0 right-0 pointer-events-none z-10"
                        style={{ top: `${(currentMinute / 60) * 60}px` }}
                      >
                        <div className="w-2 h-2 rounded-full bg-red-500 -ml-1 -mt-1 absolute" />
                        <div className="h-px bg-red-500 w-full" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div> {/* end scrollable */}
    </div>
  );
}
