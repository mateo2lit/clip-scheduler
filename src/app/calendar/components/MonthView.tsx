// src/app/calendar/components/MonthView.tsx
"use client";

import { PostGroup, isSameDay } from "../types";
import { DayCell } from "./DayCell";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getMonthCells(year: number, month: number): Array<Date | null> {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Array<Date | null> = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  const trailing = (7 - (cells.length % 7)) % 7;
  for (let i = 0; i < trailing; i++) cells.push(null);
  return cells;
}

type Props = {
  year: number;
  month: number;
  groups: PostGroup[];
  supabaseUrl: string;
  onCardClick: (group: PostGroup, rect: DOMRect) => void;
  onOverflow: (groups: PostGroup[], rect: DOMRect) => void;
};

export function MonthView({ year, month, groups, supabaseUrl, onCardClick, onOverflow }: Props) {
  const cells = getMonthCells(year, month);
  const today = new Date();

  function getGroupsForDate(date: Date): PostGroup[] {
    return groups.filter(g => isSameDay(new Date(g.scheduled_for), date));
  }

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] overflow-hidden h-full">
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-white/[0.06]">
        {DAY_NAMES.map(day => (
          <div key={day} className="px-2 py-3 text-center text-[11px] font-medium text-white/30 uppercase tracking-wider">{day}</div>
        ))}
      </div>
      {/* Cells */}
      <div className="grid grid-cols-7">
        {cells.map((date, i) => {
          if (!date) {
            return <div key={i} className={`min-h-[140px] border-b border-r border-white/[0.04] ${i % 7 === 6 ? "border-r-0" : ""}`} />;
          }
          const isToday = isSameDay(date, today);
          const isPast = date < today && !isToday;
          const dayGroups = getGroupsForDate(date);
          return (
            <div key={i} className={i % 7 === 6 ? "border-r-0" : ""}>
              <DayCell
                date={date}
                groups={dayGroups}
                isToday={isToday}
                isPast={isPast}
                supabaseUrl={supabaseUrl}
                onCardClick={onCardClick}
                onOverflow={onOverflow}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
