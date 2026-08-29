"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();

  useEffect(() => {
    /*
     * ========================================
     * RECOVERAI DEMO ACCESS
     * ========================================
     *
     * Login is currently bypassed.
     * We create the demo cookie and immediately
     * redirect the user to the dashboard.
     */

    document.cookie =
      "recoverai_demo=true; path=/; max-age=86400; SameSite=Lax";

    router.replace("/");
    router.refresh();
  }, [router]);

  return (
    <main className="min-h-screen bg-[#020617] text-white flex items-center justify-center">
      <div className="text-center">

        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10 text-3xl">
          ↗
        </div>

        <h1 className="text-3xl font-bold">
          RecoverAI
        </h1>

        <p className="mt-2 text-slate-400">
          Opening dashboard...
        </p>

        <div className="mt-6 h-2 w-48 overflow-hidden rounded-full bg-slate-800">
          <div className="h-full w-full animate-pulse rounded-full bg-emerald-500" />
        </div>

      </div>
    </main>
  );
}