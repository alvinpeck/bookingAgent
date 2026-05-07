"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AdminLogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);
    try {
      await fetch("/api/admin/auth/logout", { method: "POST" });
    } finally {
      router.push("/admin/login");
    }
  }

  return (
    <button
      onClick={handleLogout}
      disabled={loading}
      className="w-full px-3 py-1.5 rounded-md text-xs text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-50 transition-colors text-left"
    >
      {loading ? "Signing out…" : "Sign out"}
    </button>
  );
}
