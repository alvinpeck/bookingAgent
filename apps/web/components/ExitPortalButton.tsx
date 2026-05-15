"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ExitPortalButton() {
  const router  = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleExit() {
    setBusy(true);
    try {
      await fetch("/api/admin/exit-portal", { method: "POST" });
    } finally {
      // Always redirect to admin panel regardless of response
      router.push("/admin/tenants");
    }
  }

  return (
    <button
      onClick={handleExit}
      disabled={busy}
      className="flex items-center gap-1.5 px-3 py-1 text-xs font-semibold text-amber-900 bg-amber-300 hover:bg-amber-200 disabled:opacity-60 rounded-md transition-colors"
    >
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M11 17l-5-5m0 0l5-5m-5 5h12" />
      </svg>
      {busy ? "Exiting…" : "Exit to Admin Panel"}
    </button>
  );
}
