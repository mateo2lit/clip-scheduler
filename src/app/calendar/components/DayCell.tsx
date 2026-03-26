// src/app/calendar/components/DayCell.tsx
"use client";

import { useDroppable, useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { PostGroup } from "../types";
import { PostCard } from "./PostCard";

const MAX_VISIBLE = 3;

function toCellId(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `day-${y}-${m}-${d}`;
}

function DraggableCard({ group, supabaseUrl, onCardClick }: { group: PostGroup; supabaseUrl: string; onCardClick: (g: PostGroup, r: DOMRect) => void }) {
  const canDrag = group.status === "scheduled";
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `group-${group.groupId}`,
    disabled: !canDrag,
    data: { group },
  });
  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined;

  return (
    <div ref={setNodeRef} style={style} {...(canDrag ? { ...attributes, ...listeners } : {})}>
      <PostCard group={group} variant="compact" supabaseUrl={supabaseUrl} onClick={onCardClick} dimmed={isDragging} />
    </div>
  );
}

type Props = {
  date: Date;
  groups: PostGroup[];
  isToday: boolean;
  isPast: boolean;
  supabaseUrl: string;
  onCardClick: (group: PostGroup, rect: DOMRect) => void;
  onOverflow: (groups: PostGroup[], rect: DOMRect) => void;
};

export function DayCell({ date, groups, isToday, isPast, supabaseUrl, onCardClick, onOverflow }: Props) {
  const id = toCellId(date);
  const { setNodeRef, isOver } = useDroppable({ id });
  const visible = groups.slice(0, MAX_VISIBLE);
  const overflow = groups.length - MAX_VISIBLE;

  return (
    <div
      ref={setNodeRef}
      className={`min-h-[140px] border-b border-r border-white/[0.04] p-2 flex flex-col gap-1 transition-colors
        ${isPast ? "opacity-50" : ""}
        ${isOver ? "bg-blue-500/[0.08] ring-1 ring-inset ring-blue-400/30" : ""}`}
    >
      {/* Day number */}
      <div className={`text-xs leading-none shrink-0 mb-0.5 self-start ${
        isToday
          ? "inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-500 text-white font-semibold"
          : "text-white/50"
      }`}>
        {date.getDate()}
      </div>

      {/* Cards */}
      {visible.map(group => (
        <DraggableCard key={group.groupId} group={group} supabaseUrl={supabaseUrl} onCardClick={onCardClick} />
      ))}

      {/* Overflow */}
      {overflow > 0 && (
        <button
          onClick={e => {
            e.stopPropagation();
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            onOverflow(groups, rect);
          }}
          className="text-[10px] text-white/35 hover:text-white/60 px-1 text-left transition-colors"
        >
          +{overflow} more
        </button>
      )}
    </div>
  );
}

export { toCellId };
