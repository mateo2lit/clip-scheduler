"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/app/login/supabaseClient";

/**
 * The Clip Dash logo in the top-left nav. Goes to the dashboard when the
 * visitor is signed in, and to the homepage otherwise.
 */
export function LogoLink({ className = "flex items-center" }: { className?: string }) {
  const [href, setHref] = useState("/");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setHref("/dashboard");
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setHref(session ? "/dashboard" : "/");
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <Link href={href} className={className}>
      <img src="/logo.svg" alt="Clip Dash" className="h-10 w-auto" />
    </Link>
  );
}
