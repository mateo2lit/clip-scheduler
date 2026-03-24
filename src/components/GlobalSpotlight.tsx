"use client";

import { useEffect, useState } from "react";

const SPOTLIGHT_DISABLED_KEY = "clipdash:disable-hover-spotlight";
const SPOTLIGHT_PREF_EVENT = "clipdash:spotlight-pref-change";

export default function GlobalSpotlight({ children }: { children: React.ReactNode }) {
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

  return (
    <div className="relative min-h-screen">
      {enabled && <div aria-hidden="true" className="dvd-orb" />}
      <div className="relative z-0">{children}</div>
    </div>
  );
}
