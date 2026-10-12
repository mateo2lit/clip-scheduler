// src/app/auth/confirm/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../login/supabaseClient";
import { confirmDestination, readConfirmParams } from "@/lib/authLinks";

/**
 * Landing page for links in Supabase's auth emails that carry a token hash
 * (`/auth/confirm?token_hash=...&type=recovery`). Unlike the `?code=` links handled
 * by /auth/callback, these work in any browser or device, not only the one that
 * asked for the email — so "Forgot password" works when the email is opened on a
 * phone. The email templates in Supabase must link here (see docs/supabase-auth-emails.md).
 */
export default function AuthConfirmPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const params = readConfirmParams(new URLSearchParams(window.location.search));
      if (!params) {
        setError("This link is incomplete. Request a new email from the login page.");
        return;
      }

      const { data, error } = await supabase.auth.verifyOtp({ token_hash: params.tokenHash, type: params.type });
      if (error || !data.session) {
        setError("This link has expired or was already used. Request a new one from the login page.");
        return;
      }

      if (params.type === "recovery") {
        router.replace("/reset-password");
        return;
      }

      // New sign-ups get a team (idempotent) and the onboarding flow.
      let isNew = false;
      try {
        const r = await fetch("/api/auth/after-signup", {
          method: "POST",
          headers: { Authorization: `Bearer ${data.session.access_token}` },
        });
        const json = await r.json().catch(() => ({}));
        isNew = Boolean(json.is_new);
      } catch {
        // Non-fatal: the dashboard still loads.
      }
      router.replace(confirmDestination(params, isNew));
    })();
  }, [router]);

  return (
    <main className="min-h-screen w-full flex items-center justify-center p-6 bg-[#050505]">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.02] p-6 text-white">
        <h1 className="text-xl font-semibold">{error ? "Link didn't work" : "Working..."}</h1>
        <p className="mt-2 text-sm text-white/50">{error ?? "Checking your link..."}</p>
        {error && (
          <Link href="/login" className="mt-4 inline-block text-sm text-blue-400 hover:text-blue-300">
            Go to login
          </Link>
        )}
      </div>
    </main>
  );
}
