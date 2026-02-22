"use client";

import { useRef } from "react";

type GlobalSpotlightProps = {
  children: React.ReactNode;
};

export default function GlobalSpotlight({ children }: GlobalSpotlightProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const setSpotlight = (x: number, y: number, opacity: string) => {
    const el = wrapperRef.current;
    if (!el) return;

    el.style.setProperty("--spotlight-x", `${x}px`);
    el.style.setProperty("--spotlight-y", `${y}px`);
    el.style.setProperty("--spotlight-opacity", opacity);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse") return;
    const rect = event.currentTarget.getBoundingClientRect();
    setSpotlight(event.clientX - rect.left, event.clientY - rect.top, "1");
  };

  const handlePointerEnter = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse") return;
    const rect = event.currentTarget.getBoundingClientRect();
    setSpotlight(event.clientX - rect.left, event.clientY - rect.top, "1");
  };

  const handlePointerLeave = () => {
    setSpotlight(0, 0, "0");
  };

  return (
    <div
      ref={wrapperRef}
      onPointerMove={handlePointerMove}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      className="relative min-h-screen"
      style={{
        ["--spotlight-x" as string]: "50%",
        ["--spotlight-y" as string]: "20%",
        ["--spotlight-opacity" as string]: 0,
      }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 transition-opacity duration-300"
        style={{
          opacity: "var(--spotlight-opacity)",
          background:
            "radial-gradient(420px circle at var(--spotlight-x) var(--spotlight-y), rgba(96,165,250,0.16) 0%, rgba(168,85,247,0.12) 28%, rgba(236,72,153,0.07) 45%, rgba(5,5,5,0) 72%)",
        }}
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
