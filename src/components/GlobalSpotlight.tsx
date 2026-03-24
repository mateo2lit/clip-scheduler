"use client";

import { useEffect, useRef, useState } from "react";

const SPOTLIGHT_DISABLED_KEY = "clipdash:disable-hover-spotlight";
const SPOTLIGHT_PREF_EVENT = "clipdash:spotlight-pref-change";

// Colors that cycle on each wall bounce — subtle but distinct
const GLOW_COLORS = [
  "rgba(96,165,250,0.55)",    // blue
  "rgba(168,85,247,0.55)",    // purple
  "rgba(236,72,153,0.50)",    // pink
  "rgba(52,211,153,0.45)",    // teal
  "rgba(251,146,60,0.45)",    // orange
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

    // DVD-style physics — position in viewport pixels
    const W = 500; // orb render width
    const H = 500; // orb render height
    let colorIdx = 0;

    let px = Math.random() * (window.innerWidth  - W);
    let py = Math.random() * (window.innerHeight - H);
    let vx =  (Math.random() > 0.5 ? 1 : -1) * 1.4; // px per ms at ~60fps ≈ ~1.4*16≈22px/frame
    let vy =  (Math.random() > 0.5 ? 1 : -1) * 1.1;

    let last = performance.now();

    function applyColor() {
      if (!orb) return;
      orb.style.background = GLOW_COLORS[colorIdx % GLOW_COLORS.length];
      colorIdx++;
    }
    applyColor();

    function tick(now: number) {
      const dt = Math.min(now - last, 50);
      last = now;

      px += vx * dt;
      py += vy * dt;

      const maxX = window.innerWidth  - W;
      const maxY = window.innerHeight - H;

      let bounced = false;
      if (px <= 0)    { px = 0;    vx = Math.abs(vx);  bounced = true; }
      if (px >= maxX) { px = maxX; vx = -Math.abs(vx); bounced = true; }
      if (py <= 0)    { py = 0;    vy = Math.abs(vy);  bounced = true; }
      if (py >= maxY) { py = maxY; vy = -Math.abs(vy); bounced = true; }

      if (bounced) applyColor();

      if (orb) {
        orb.style.transform = `translate(${px}px, ${py}px)`;
      }

      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [enabled]);

  return (
    <div className="relative min-h-screen">
      {/* DVD-style bouncing glow orb */}
      <div
        ref={orbRef}
        aria-hidden="true"
        className="pointer-events-none fixed top-0 left-0 z-[5] transition-[background] duration-700"
        style={{
          width: "500px",
          height: "500px",
          borderRadius: "50%",
          filter: "blur(90px)",
          willChange: "transform",
          opacity: 1,
        }}
      />
      <div className="relative z-0">{children}</div>
    </div>
  );
}
