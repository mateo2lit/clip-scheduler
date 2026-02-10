"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/app/login/supabaseClient";

type TeamInfo = {
  teamId: string | null;
  teamName: string | null;
  role: "owner" | "member" | null;
  loading: boolean;
};

export function useTeam(): TeamInfo {
  const [teamId, setTeamId] = useState<string | null>(null);
  const [teamName, setTeamName] = useState<string | null>(null);
  const [role, setRole] = useState<"owner" | "member" | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const { data: sess } = await supabase.auth.getSession();
        const token = sess.session?.access_token;
        if (!token) {
          setLoading(false);
          return;
        }

        const res = await fetch("/api/team/me", {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
          setLoading(false);
          return;
        }

        const json = await res.json();
        if (cancelled) return;

        if (json.ok) {
          setTeamId(json.teamId);
          setTeamName(json.teamName);
          setRole(json.role);
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { teamId, teamName, role, loading };
}
