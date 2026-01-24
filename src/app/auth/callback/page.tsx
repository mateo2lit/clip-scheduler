// src/app/auth/callback/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../login/supabaseClient";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [msg, setMsg] = useState("Finishing sign-in...");

  useEffect(() => {
    const run = async () => {
      try {
        // This reads tokens from the URL (including the hash for recovery links)
        // and stores the session in Supabase client.
        const { error } = await supabase.auth.getSession();
        if (error) {
          setMsg(`Auth error: ${error.message}`);
          return;
        }

        // If this was a recovery link, go to reset-password form
        // Otherwise, go to dashboard.
        const hash = window.location.hash || "";
        if (hash.includes("type=recovery")) {
          router.replace("/reset-password");
        } else {
          router.replace("/dashboard");
        }
      } catch (e: any) {
        setMsg(`Auth error: ${String(e?.message ?? e)}`);
      }
    };

    run();
  }, [router]);

  return (
    <main className="min-h-screen w-full flex items-center justify-center p-6 bg-slate-950">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.06] backdrop-blur p-6 shadow-2xl text-slate-200">
        <h1 className="text-xl font-semibold text-white">Working...</h1>
        <p className="mt-2 text-sm text-slate-300">{msg}</p>
      </div>
    </main>
  );
}
