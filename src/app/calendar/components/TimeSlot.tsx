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

function DraggableFullCard({ group, supabaseUrl, onCardClick }: { group: PostGroup; supabaseUrl: string; onCardClick: (g: PostGroup, r: DOMRect) => void }) {
  const canDrag = group.status === "scheduled";
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `group-${group.groupId}`,
    disabled: !canDrag,
    data: { group },
  });
  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined;
  return (
    <div ref={setNodeRef} style={style} {...(canDrag ? { ...attributes, ...listeners } : {})}>
      <PostCard group={group} variant="full" supabaseUrl={supabaseUrl} onClick={onCardClick} dimmed={isDragging} />
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

  return (
    <div
      ref={setNodeRef}
      className={`relative border-b border-white/[0.04] min-h-[48px] p-1 flex flex-col gap-1 transition-colors
        ${isPast ? "opacity-40" : ""}
        ${isOver ? "bg-blue-500/[0.08]" : ""}`}
    >
      {slotGroups.map(group => (
        <DraggableFullCard key={group.groupId} group={group} supabaseUrl={supabaseUrl} onCardClick={onCardClick} />
      ))}
    </div>
  );
}
