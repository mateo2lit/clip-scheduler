"use client";

import { useEffect, useRef, useState } from "react";

const SPOTLIGHT_DISABLED_KEY = "clipdash:disable-hover-spotlight";
const SPOTLIGHT_PREF_EVENT = "clipdash:spotlight-pref-change";

type OrbState = { x: number; y: number; vx: number; vy: number };

export default function GlobalSpotlight({ children }: { children: React.ReactNode }) {
  const orb1Ref = useRef<HTMLDivElement>(null);
  const orb2Ref = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    const sync = () => {
      try {
        setEnabled(window.localStorage.getItem(SPOTLIGHT_DISABLED_KEY) !== "1");
      } catch {
        setEnabled(true);
      }
    };
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener(SPOTLIGHT_PREF_EVENT, sync as EventListener);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(SPOTLIGHT_PREF_EVENT, sync as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!enabled) {
      if (orb1Ref.current) orb1Ref.current.style.opacity = "0";
      if (orb2Ref.current) orb2Ref.current.style.opacity = "0";
      cancelAnimationFrame(rafRef.current);
      return;
    }
    if (orb1Ref.current) orb1Ref.current.style.opacity = "1";
    if (orb2Ref.current) orb2Ref.current.style.opacity = "1";

    // Start positions scattered so they don't always begin at corners
    const state: { o1: OrbState; o2: OrbState } = {
      o1: { x: 0.28, y: 0.22, vx: 0.00032, vy: 0.00026 },
      o2: { x: 0.72, y: 0.65, vx: -0.00022, vy: 0.00034 },
    };

    let last = performance.now();

    function tick(now: number) {
      const dt = Math.min(now - last, 50);
      last = now;

      state.o1.x += state.o1.vx * dt;
      state.o1.y += state.o1.vy * dt;
      state.o2.x += state.o2.vx * dt;
      state.o2.y += state.o2.vy * dt;

      if (state.o1.x <= 0 || state.o1.x >= 1) { state.o1.vx *= -1; state.o1.x = Math.max(0, Math.min(1, state.o1.x)); }
      if (state.o1.y <= 0 || state.o1.y >= 1) { state.o1.vy *= -1; state.o1.y = Math.max(0, Math.min(1, state.o1.y)); }
      if (state.o2.x <= 0 || state.o2.x >= 1) { state.o2.vx *= -1; state.o2.x = Math.max(0, Math.min(1, state.o2.x)); }
      if (state.o2.y <= 0 || state.o2.y >= 1) { state.o2.vy *= -1; state.o2.y = Math.max(0, Math.min(1, state.o2.y)); }

      const o1 = orb1Ref.current;
      const o2 = orb2Ref.current;
      if (o1) {
        o1.style.left = `${state.o1.x * 100}%`;
        o1.style.top = `${state.o1.y * 100}%`;
      }
      if (o2) {
        o2.style.left = `${state.o2.x * 100}%`;
        o2.style.top = `${state.o2.y * 100}%`;
      }

      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [enabled]);

  return (
    <div className="relative min-h-screen isolate">
      {/* Bouncing orb 1 — blue/purple */}
      <div
        ref={orb1Ref}
        aria-hidden="true"
        className="pointer-events-none fixed z-[5] transition-opacity duration-700"
        style={{
          width: "700px",
          height: "700px",
          transform: "translate(-50%, -50%)",
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(96,165,250,0.085) 0%, rgba(168,85,247,0.05) 38%, transparent 68%)",
          mixBlendMode: "screen",
          willChange: "left, top",
        }}
      />
      {/* Bouncing orb 2 — purple/pink */}
      <div
        ref={orb2Ref}
        aria-hidden="true"
        className="pointer-events-none fixed z-[5] transition-opacity duration-700"
        style={{
          width: "580px",
          height: "580px",
          transform: "translate(-50%, -50%)",
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(168,85,247,0.07) 0%, rgba(236,72,153,0.04) 38%, transparent 68%)",
          mixBlendMode: "screen",
          willChange: "left, top",
        }}
      />
      <div className="relative z-0">{children}</div>
    </div>
  );
}
