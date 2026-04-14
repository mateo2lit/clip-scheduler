"use client";

import { useMemo } from "react";

type Metric = {
  videoId: string;
  platform: string;
  title: string;
  views: number;
  likes: number;
  comments: number;
  shares?: number;
  postedAt: string;
};

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function getHourLabel(h: number): string {
  if (h === 0) return "12a";
  if (h < 12) return `${h}a`;
  if (h === 12) return "12p";
  return `${h - 12}p`;
}

function interpolateColor(value: number, max: number): string {
  if (max === 0 || value === 0) return "rgba(255,255,255,0.02)";
  const t = Math.min(value / max, 1);

  // From dark transparent to vibrant purple
  const r = Math.round(59 + t * (139 - 59));
  const g = Math.round(130 + t * (92 - 130));
  const b = Math.round(246 + t * (246 - 246));
  const a = 0.1 + t * 0.7;

  return `rgba(${r},${g},${b},${a})`;
}

export default function BestTimeHeatmap({ metrics }: { metrics: Metric[] }) {
  const { grid, maxVal } = useMemo(() => {
    // Build a 7x24 grid of avg engagement
    const cells: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
    const counts: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));

    for (const m of metrics) {
      const d = new Date(m.postedAt);
      const day = d.getDay();
      const hour = d.getHours();
      cells[day][hour] += m.likes + m.comments + m.views;
      counts[day][hour] += 1;
    }

    // Average engagement per cell
    let max = 0;
    for (let d = 0; d < 7; d++) {
      for (let h = 0; h < 24; h++) {
        if (counts[d][h] > 0) {
          cells[d][h] = Math.round(cells[d][h] / counts[d][h]);
        }
        if (cells[d][h] > max) max = cells[d][h];
      }
    }

    return { grid: cells, maxVal: max };
  }, [metrics]);

  const hasData = maxVal > 0;

  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.03] shadow-[0_20px_70px_rgba(2,6,23,0.45)] p-6">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-sm font-semibold text-white/70 uppercase tracking-wider">
          Best Time to Post
        </h3>
        {hasData && (
          <div className="flex items-center gap-2 text-[10px] text-white/30">
            <span>Low</span>
            <div className="flex gap-0.5">
              {[0.1, 0.3, 0.5, 0.7, 0.9].map((t) => (
                <span
                  key={t}
                  className="w-3 h-3 rounded-sm"
                  style={{
                    background: interpolateColor(t * maxVal, maxVal),
                  }}
                />
              ))}
            </div>
            <span>High</span>
          </div>
        )}
      </div>

      {!hasData ? (
        <div className="py-10 text-center">
          <p className="text-white/30 text-sm">
            Post more content to discover your best posting times
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[600px]">
            {/* Hour labels */}
            <div className="flex ml-10">
              {HOURS.filter((h) => h % 2 === 0).map((h) => (
                <div
                  key={h}
                  className="text-[10px] text-white/25 text-center"
                  style={{ width: `${100 / 12}%` }}
                >
                  {getHourLabel(h)}
                </div>
              ))}
            </div>

            {/* Grid rows */}
            <div className="space-y-1 mt-1">
              {DAYS.map((day, dayIdx) => (
                <div key={day} className="flex items-center gap-2">
                  <span className="w-8 text-[11px] text-white/35 text-right font-medium shrink-0">
                    {day}
                  </span>
                  <div className="flex-1 flex gap-[2px]">
                    {HOURS.map((hour) => (
                      <div
                        key={hour}
                        className="flex-1 aspect-[1.6] rounded-[3px] transition-colors relative group cursor-default"
                        style={{
                          background: interpolateColor(grid[dayIdx][hour], maxVal),
                        }}
                      >
                        {grid[dayIdx][hour] > 0 && (
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-20">
                            <div className="rounded-lg border border-white/10 bg-[#0a0a0a]/95 backdrop-blur-sm px-3 py-2 shadow-xl whitespace-nowrap">
                              <p className="text-[10px] text-white/50">
                                {day} {getHourLabel(hour)}
                              </p>
                              <p className="text-xs font-semibold text-white tabular-nums">
                                Avg engagement: {grid[dayIdx][hour].toLocaleString()}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
