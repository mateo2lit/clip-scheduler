// src/app/auth/callback/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../login/supabaseClient";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [msg, setMsg] = useState("Finishing sign-in...");

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === "PASSWORD_RECOVERY") {
          // Supabase detected a recovery token — send to reset form
          router.replace("/reset-password");
          return;
        }

        if (event === "SIGNED_IN" && session) {
          // Ensure the user has a team (idempotent)
          try {
            await fetch("/api/auth/after-signup", {
              method: "POST",
              headers: { Authorization: `Bearer ${session.access_token}` },
            });
          } catch {
            // Non-fatal: team will be created on next API call
          }
          router.replace("/dashboard");
        }
      }
    );

    // Fallback: if no auth event fires within 5 seconds, check session manually
    const fallbackTimer = setTimeout(async () => {
      const hash = window.location.hash || "";
      const params = new URLSearchParams(window.location.search);

      // Check hash or query params for recovery type
      if (hash.includes("type=recovery") || params.get("next") === "/reset-password") {
        router.replace("/reset-password");
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (data.session) {
        try {
          await fetch("/api/auth/after-signup", {
            method: "POST",
            headers: { Authorization: `Bearer ${data.session.access_token}` },
          });
        } catch {}
        router.replace("/dashboard");
      } else {
        setMsg("Session expired. Redirecting to login...");
        setTimeout(() => router.replace("/login"), 1500);
      }
    }, 5000);

    return () => {
      listener.subscription.unsubscribe();
      clearTimeout(fallbackTimer);
    };
  }, [router]);

  return (
    <main className="min-h-screen w-full flex items-center justify-center p-6 bg-[#0A0A0A]">
      <div className="w-full max-w-md rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 text-white">
        <h1 className="text-xl font-semibold">Working...</h1>
        <p className="mt-2 text-sm text-white/50">{msg}</p>
      </div>
    </main>
  );
}
