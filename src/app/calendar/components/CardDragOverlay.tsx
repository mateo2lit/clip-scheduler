// src/app/calendar/components/CardDragOverlay.tsx
"use client";

import { DragOverlay } from "@dnd-kit/core";
import { restrictToWindowEdges } from "@dnd-kit/modifiers";
import { PostGroup } from "../types";
import { PostCard } from "./PostCard";

type Props = {
  activeGroup: PostGroup | null;
  supabaseUrl: string;
};

export function CardDragOverlay({ activeGroup, supabaseUrl }: Props) {
  return (
    <DragOverlay modifiers={[restrictToWindowEdges]} dropAnimation={null}>
      {activeGroup ? (
        <div className="w-48 shadow-[0_20px_40px_rgba(0,0,0,0.5)] rotate-1 scale-105">
          <PostCard
            group={activeGroup}
            variant="compact"
            supabaseUrl={supabaseUrl}
            onClick={() => {}}
          />
        </div>
      ) : null}
    </DragOverlay>
  );
}
