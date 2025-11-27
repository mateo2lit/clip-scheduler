"use client";

import { FormEvent, useState } from "react";
import { supabase } from "./supabaseClient";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isLoginMode) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
      }

      // Go to dashboard on success
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl p-8 shadow-lg">
        <h1 className="text-2xl font-semibold mb-2">
          {isLoginMode ? "Log in" : "Create an account"}
        </h1>
        <p className="text-sm text-slate-400 mb-6">
          Use email and password to access your clip scheduler dashboard.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 rounded-md bg-slate-800 border border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm mb-1">Password</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-md bg-slate-800 border border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-900/40 border border-red-700 rounded-md px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-50 transition text-sm font-medium"
          >
            {loading
              ? isLoginMode
                ? "Logging in..."
                : "Creating account..."
              : isLoginMode
              ? "Log in"
              : "Sign up"}
          </button>
        </form>

        <button
          className="mt-4 w-full text-xs text-slate-400 hover:text-slate-200"
          onClick={() => setIsLoginMode((prev) => !prev)}
        >
          {isLoginMode
            ? "Need an account? Sign up instead."
            : "Already have an account? Log in instead."}
        </button>
      </div>
    </div>
  );
}

