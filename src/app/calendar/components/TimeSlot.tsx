// src/app/calendar/components/TimeSlot.tsx
"use client";

import { useDroppable, useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { PostGroup, isSameDay } from "../types";
import { PostCard } from "./PostCard";

export function toSlotId(date: Date, hour: number): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(hour).padStart(2, "0");
  return `slot-${y}${m}${d}:${h}`;
}

function DraggableWeekCard({ group, supabaseUrl, onCardClick }: { group: PostGroup; supabaseUrl: string; onCardClick: (g: PostGroup, r: DOMRect) => void }) {
  const canDrag = group.status === "scheduled";
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `group-${group.groupId}`,
    disabled: !canDrag,
    data: { group },
  });
  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined;
  return (
    <div ref={setNodeRef} style={style} {...(canDrag ? { ...attributes, ...listeners } : {})}>
      <PostCard group={group} variant="week" supabaseUrl={supabaseUrl} onClick={onCardClick} dimmed={isDragging} />
    </div>
  );
}

type Props = {
  date: Date;
  hour: number;
  groups: PostGroup[];
  supabaseUrl: string;
  onCardClick: (group: PostGroup, rect: DOMRect) => void;
  isPast: boolean;
};

export function TimeSlot({ date, hour, groups, supabaseUrl, onCardClick, isPast }: Props) {
  const id = toSlotId(date, hour);
  const { setNodeRef, isOver } = useDroppable({ id });

  const slotGroups = groups.filter(g => {
    const d = new Date(g.scheduled_for);
    return isSameDay(d, date) && d.getHours() === hour;
  });

  const visible = slotGroups[0] ? [slotGroups[0]] : [];
  const overflow = slotGroups.length - 1;

  return (
    <div
      ref={setNodeRef}
      className={`relative border-b border-white/[0.04] h-[30px] overflow-hidden px-0.5 py-[3px] flex flex-col gap-0.5 transition-colors
        ${isPast ? "opacity-40" : ""}
        ${isOver ? "bg-blue-500/[0.08]" : ""}`}
    >
      {visible.map(group => (
        <DraggableWeekCard key={group.groupId} group={group} supabaseUrl={supabaseUrl} onCardClick={onCardClick} />
      ))}
      {overflow > 0 && (
        <span className="text-[9px] text-white/30 px-1">+{overflow} more</span>
      )}
    </div>
  );
}
