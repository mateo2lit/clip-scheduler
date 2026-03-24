"use client";

import { useEffect, useRef, useState } from "react";

const SPOTLIGHT_DISABLED_KEY = "clipdash:disable-hover-spotlight";
const SPOTLIGHT_PREF_EVENT = "clipdash:spotlight-pref-change";

const COLORS = [
  ["rgba(96,165,250,0.22)",  "rgba(96,165,250,0.18)",  "0 0 140px 80px rgba(96,165,250,0.14)"],   // blue
  ["rgba(168,85,247,0.22)",  "rgba(168,85,247,0.18)",  "0 0 140px 80px rgba(168,85,247,0.14)"],   // purple
  ["rgba(236,72,153,0.20)",  "rgba(236,72,153,0.16)",  "0 0 140px 80px rgba(236,72,153,0.12)"],   // pink
  ["rgba(52,211,153,0.20)",  "rgba(52,211,153,0.16)",  "0 0 140px 80px rgba(52,211,153,0.12)"],   // teal
  ["rgba(251,146,60,0.20)",  "rgba(251,146,60,0.16)",  "0 0 140px 80px rgba(251,146,60,0.12)"],   // orange
];

export default function GlobalSpotlight({ children }: { children: React.ReactNode }) {
  const orbRef = useRef<HTMLDivElement>(null);
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
    const orb = orbRef.current;
    if (!orb) return;

    if (!enabled) {
      orb.style.opacity = "0";
      cancelAnimationFrame(rafRef.current);
      return;
    }
    orb.style.opacity = "1";

    const SIZE = 420;
    let colorIdx = 0;
    let px = window.innerWidth  * 0.3;
    let py = window.innerHeight * 0.25;
    let vx = 1.6;
    let vy = 1.2;

    function applyColor() {
      if (!orb) return;
      const [bg, inner, shadow] = COLORS[colorIdx % COLORS.length];
      orb.style.background = `radial-gradient(circle at center, ${inner} 0%, ${bg} 20%, transparent 70%)`;
      orb.style.boxShadow = shadow;
      colorIdx++;
    }
    applyColor();

    let last = performance.now();

    function tick(now: number) {
      const dt = Math.min(now - last, 50);
      last = now;

      px += vx * dt * 0.06;
      py += vy * dt * 0.06;

      const maxX = window.innerWidth  - SIZE;
      const maxY = window.innerHeight - SIZE;

      let bounced = false;
      if (px <= 0)    { px = 0;    vx =  Math.abs(vx); bounced = true; }
      if (px >= maxX) { px = maxX; vx = -Math.abs(vx); bounced = true; }
      if (py <= 0)    { py = 0;    vy =  Math.abs(vy); bounced = true; }
      if (py >= maxY) { py = maxY; vy = -Math.abs(vy); bounced = true; }

      if (bounced) applyColor();

      if (orb) {
        orb.style.left = `${px}px`;
        orb.style.top  = `${py}px`;
      }

      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [enabled]);

  return (
    <div className="relative min-h-screen">
      <div
        ref={orbRef}
        aria-hidden="true"
        className="pointer-events-none fixed z-50 transition-[background,box-shadow] duration-500"
        style={{
          width: "420px",
          height: "420px",
          borderRadius: "50%",
          opacity: 1,
        }}
      />
      <div className="relative z-0">{children}</div>
    </div>
  );
}
