"use client";

import { useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../login/supabaseClient";

type User = {
  id: string;
  email?: string;
};

type Profile = {
  id: string;
  user_id: string;
  display_name: string | null;
};

export default function SettingsPage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Check auth + load existing profile
  useEffect(() => {
    const load = async () => {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      if (error || !user) {
        router.push("/login");
        return;
      }

      const authUser: User = { id: user.id, email: user.email || undefined };
      setUser(authUser);

      const { data: profileRow, error: profileError } = await supabase
        .from("profiles")
        .select("id, user_id, display_name")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!profileError && profileRow) {
        setProfile(profileRow as Profile);
        setDisplayName(profileRow.display_name || "");
      }

      setLoadingUser(false);
    };

    load();
  }, [router]);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const payload = {
        user_id: user.id,
        display_name: displayName || null,
        updated_at: new Date().toISOString(),
      };

      let result;
      if (profile) {
        // update existing row
        result = await supabase
          .from("profiles")
          .update(payload)
          .eq("id", profile.id)
          .select("id, user_id, display_name")
          .single();
      } else {
        // create first row for this user
        result = await supabase
          .from("profiles")
          .insert({
            ...payload,
            created_at: new Date().toISOString(),
          })
          .select("id, user_id, display_name")
          .single();
      }

      if (result.error) {
        throw result.error;
      }

      setProfile(result.data as Profile);
      setSuccessMessage("Settings saved.");
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  };

  const handleBackToDashboard = () => {
    router.push("/dashboard");
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  if (loadingUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
        <p className="text-slate-300">Loading settings...</p>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Account settings</h1>
          <p className="text-xs text-slate-400">
            Logged in as {user.email || "unknown"}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleBackToDashboard}
            className="text-xs px-3 py-1 rounded-md border border-slate-600 hover:bg-slate-800"
          >
            Back to dashboard
          </button>
          <button
            onClick={handleLogout}
            className="text-xs px-3 py-1 rounded-md border border-slate-600 hover:bg-slate-800"
          >
            Log out
          </button>
        </div>
      </header>

      <main className="p-6">
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-4 max-w-xl">
          <h2 className="text-sm font-semibold mb-2">Profile</h2>
          <p className="text-xs text-slate-400 mb-4">
            This information is used inside the app (for example, as your
            display name in future features).
          </p>

          <form onSubmit={handleSave} className="space-y-3">
            <div className="space-y-1">
              <label className="block text-xs text-slate-300">
                Display name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="What should we call you?"
                className="w-full px-3 py-2 rounded-md bg-slate-800 border border-slate-700 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs text-slate-300">
                Email (read-only for now)
              </label>
              <input
                type="email"
                value={user.email || ""}
                disabled
                className="w-full px-3 py-2 rounded-md bg-slate-900 border border-slate-800 text-xs text-slate-400"
              />
            </div>

            {error && (
              <p className="text-xs text-red-400 bg-red-900/40 border border-red-700 rounded-md px-3 py-2">
                {error}
              </p>
            )}

            {successMessage && (
              <p className="text-xs text-emerald-400 bg-emerald-900/30 border border-emerald-700 rounded-md px-3 py-2">
                {successMessage}
              </p>
            )}

            <button
              type="submit"
              disabled={saving}
              className="text-xs px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save changes"}
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
