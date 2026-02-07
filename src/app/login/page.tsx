import { Suspense } from "react";
import LoginClient from "./LoginClient";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#050505] text-white p-10">Loading…</div>}>
      <LoginClient/>
    </Suspense>
  );
}
