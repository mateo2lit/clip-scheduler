"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../login/supabaseClient";

// Confetti particle config
const COLORS = ["#60a5fa", "#a78bfa", "#34d399", "#f472b6", "#fbbf24", "#fb923c", "#e879f9"];
const PARTICLE_COUNT = 80;

type Particle = {
  x: number;
  y: number;
  size: number;
  color: string;
  speedX: number;
  speedY: number;
  rotation: number;
  rotationSpeed: number;
  shape: "rect" | "circle" | "triangle";
  opacity: number;
  decay: number;
};

function randomBetween(a: number, b: number) {
  return a + Math.random() * (b - a);
}

function makeParticle(canvasWidth: number): Particle {
  return {
    x: randomBetween(0, canvasWidth),
    y: randomBetween(-120, -10),
    size: randomBetween(6, 14),
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    speedX: randomBetween(-2.5, 2.5),
    speedY: randomBetween(3, 7),
    rotation: randomBetween(0, 360),
    rotationSpeed: randomBetween(-6, 6),
    shape: (["rect", "circle", "triangle"] as const)[Math.floor(Math.random() * 3)],
    opacity: 1,
    decay: randomBetween(0.003, 0.008),
  };
}

function ConfettiCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let particles: Particle[] = [];

    function resize() {
      if (!canvas) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener("resize", resize);

    // Initial burst
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push(makeParticle(canvas.width));
    }

    // Trickle more particles over time
    let elapsed = 0;
    const trickleInterval = setInterval(() => {
      elapsed += 80;
      if (elapsed < 3000) {
        for (let i = 0; i < 5; i++) {
          particles.push(makeParticle(canvas.width));
        }
      }
    }, 80);

    function draw() {
      if (!canvas || !ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particles = particles.filter((p) => p.opacity > 0 && p.y < canvas.height + 50);

      for (const p of particles) {
        ctx.save();
        ctx.globalAlpha = p.opacity;
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillStyle = p.color;

        if (p.shape === "rect") {
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        } else if (p.shape === "circle") {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.moveTo(0, -p.size / 2);
          ctx.lineTo(p.size / 2, p.size / 2);
          ctx.lineTo(-p.size / 2, p.size / 2);
          ctx.closePath();
          ctx.fill();
        }

        ctx.restore();

        p.x += p.speedX;
        p.y += p.speedY;
        p.speedY += 0.08; // gravity
        p.rotation += p.rotationSpeed;
        p.speedX *= 0.99;
        if (p.y > canvas.height * 0.6) {
          p.opacity -= p.decay;
        }
      }

      animId = requestAnimationFrame(draw);
    }

    draw();

    return () => {
      cancelAnimationFrame(animId);
      clearInterval(trickleInterval);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none z-0" />;
}

export default function WelcomePage() {
  const router = useRouter();
  const [plan, setPlan] = useState<string | null>(null);
  const [trialEnds, setTrialEnds] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [show, setShow] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) { router.replace("/login"); return; }

      // Poll briefly for plan to be active (webhook may take a moment)
      let attempts = 0;
      let planStatus = "";
      while (attempts < 8 && planStatus !== "active" && planStatus !== "trialing") {
        const res = await fetch("/api/team/plan", {
          headers: { Authorization: `Bearer ${data.session.access_token}` },
        });
        const json = await res.json().catch(() => ({}));
        planStatus = json.plan_status || "";
        if (planStatus === "active" || planStatus === "trialing") {
          setPlan(json.plan);
          setTrialEnds(json.trial_ends_at);
          break;
        }
        attempts++;
        await new Promise((r) => setTimeout(r, 800));
      }

      setLoading(false);
      // Small delay for dramatic effect
      setTimeout(() => setShow(true), 100);
    })();
  }, [router]);

  function formatDate(iso: string | null) {
    if (!iso) return null;
    return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  }

  const planLabel = plan === "creator" ? "Creator" : plan === "team" ? "Team" : "your plan";

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-white/10 border-t-white/60 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white relative overflow-hidden flex items-center justify-center">
      <ConfettiCanvas />

      {/* Background glow */}
      <div className="pointer-events-none fixed top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-gradient-to-b from-blue-500/[0.12] via-purple-500/[0.07] to-transparent rounded-full blur-3xl" />

      <div
        className={`relative z-10 w-full max-w-md px-6 transition-all duration-700 ease-out ${
          show ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-8 scale-95"
        }`}
      >
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-8 text-center shadow-[0_40px_120px_rgba(96,165,250,0.12)]">
          {/* Animated checkmark */}
          <div className="relative mx-auto w-20 h-20 mb-6">
            <div className="absolute inset-0 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 animate-pulse opacity-20" />
            <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center">
              <svg className="w-10 h-10 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.5}
                  d="M5 13l4 4L19 7"
                  className={`transition-all duration-700 delay-300 ${show ? "opacity-100" : "opacity-0"}`}
                />
              </svg>
            </div>
          </div>

          <h1 className="text-3xl font-bold tracking-tight mb-2">
            You&apos;re in! 🎉
          </h1>
          <p className="text-white/50 text-base mb-6">
            Your <span className="text-white font-medium">{planLabel}</span> plan is active.
            {trialEnds && (
              <> Your trial runs until <span className="text-white font-medium">{formatDate(trialEnds)}</span>.</>
            )}
          </p>

          {/* Next steps */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 mb-6 text-left space-y-3">
            <p className="text-xs font-medium text-white/40 uppercase tracking-widest mb-2">Next steps</p>
            {[
              { icon: "🔗", text: "Add more social accounts", link: "/settings" },
              { icon: "📤", text: "Upload and schedule your first video", link: "/uploads" },
              { icon: "📊", text: "See your analytics after posting", link: "/analytics" },
            ].map((item, i) => (
              <button
                key={i}
                onClick={() => router.push(item.link)}
                className="flex w-full items-center gap-3 rounded-xl p-2.5 hover:bg-white/[0.05] transition-colors text-left"
              >
                <span className="text-lg">{item.icon}</span>
                <span className="text-sm text-white/70">{item.text}</span>
                <svg className="ml-auto w-3.5 h-3.5 text-white/20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            ))}
          </div>

          <button
            onClick={() => router.push("/dashboard")}
            className="w-full rounded-full bg-gradient-to-r from-blue-400 to-purple-500 py-3.5 text-sm font-semibold text-black hover:opacity-90 transition-opacity"
          >
            Go to Dashboard →
          </button>

          <p className="mt-4 text-xs text-white/25">
            No charges until your trial ends. Cancel anytime.
          </p>
        </div>
      </div>
    </div>
  );
}
