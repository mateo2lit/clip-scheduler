"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled error:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0a0e17] px-6 text-center">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-3xl border border-red-500/20 bg-red-500/10">
        <svg className="h-9 w-9 text-red-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
      </div>
      <h1 className="text-2xl font-bold text-white">Something went wrong</h1>
      <p className="mt-3 max-w-md text-base text-white/50">
        An unexpected error occurred. This has been logged and we&apos;ll look into it.
      </p>
      <div className="mt-8 flex items-center gap-3">
        <button
          onClick={reset}
          className="rounded-full bg-gradient-to-r from-blue-500 to-purple-500 px-6 py-2.5 text-sm font-semibold text-white transition-all hover:from-blue-400 hover:to-purple-400"
        >
          Try Again
        </button>
        <a
          href="/"
          className="rounded-full border border-white/15 bg-white/5 px-6 py-2.5 text-sm font-medium text-white/70 transition-all hover:bg-white/10 hover:text-white"
        >
          Back to Home
        </a>
      </div>
    </div>
  );
}
