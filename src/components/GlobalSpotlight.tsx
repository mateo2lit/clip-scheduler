"use client";

import { useEffect, useRef, useState } from "react";

type GlobalSpotlightProps = {
  children: React.ReactNode;
};

const SPOTLIGHT_DISABLED_KEY = "clipdash:disable-hover-spotlight";
const SPOTLIGHT_PREF_EVENT = "clipdash:spotlight-pref-change";

export default function GlobalSpotlight({ children }: GlobalSpotlightProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [spotlightEnabled, setSpotlightEnabled] = useState(true);

  useEffect(() => {
    const syncPreference = () => {
      try {
        setSpotlightEnabled(window.localStorage.getItem(SPOTLIGHT_DISABLED_KEY) !== "1");
      } catch {
        setSpotlightEnabled(true);
      }
    };

    syncPreference();
    window.addEventListener("storage", syncPreference);
    window.addEventListener(SPOTLIGHT_PREF_EVENT, syncPreference as EventListener);
    return () => {
      window.removeEventListener("storage", syncPreference);
      window.removeEventListener(SPOTLIGHT_PREF_EVENT, syncPreference as EventListener);
    };
  }, []);

  const setSpotlight = (x: number, y: number, opacity: string) => {
    const el = wrapperRef.current;
    if (!el) return;

    el.style.setProperty("--spotlight-x", `${x}px`);
    el.style.setProperty("--spotlight-y", `${y}px`);
    el.style.setProperty("--spotlight-opacity", opacity);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!spotlightEnabled || event.pointerType !== "mouse") return;
    const rect = event.currentTarget.getBoundingClientRect();
    setSpotlight(event.clientX - rect.left, event.clientY - rect.top, "1");
  };

  const handlePointerEnter = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!spotlightEnabled || event.pointerType !== "mouse") return;
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
      className="relative min-h-screen isolate"
      style={{
        ["--spotlight-x" as string]: "50%",
        ["--spotlight-y" as string]: "20%",
        ["--spotlight-opacity" as string]: 0,
      }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-[5] transition-opacity duration-300"
        style={{
          opacity: spotlightEnabled ? "var(--spotlight-opacity)" : 0,
          mixBlendMode: "screen",
          background:
            "radial-gradient(380px circle at var(--spotlight-x) var(--spotlight-y), rgba(96,165,250,0.07) 0%, rgba(168,85,247,0.045) 28%, rgba(236,72,153,0.025) 45%, rgba(5,5,5,0) 70%)",
        }}
      />
      <div className="relative z-0">{children}</div>
    </div>
  );
}
