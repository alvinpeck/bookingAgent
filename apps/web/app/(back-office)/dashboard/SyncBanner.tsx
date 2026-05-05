"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SyncBanner() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSync() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/sync-tenant", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? "Sync failed");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mb-6 flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
      <span className="text-amber-500 text-lg mt-0.5">⚠</span>
      <div className="flex-1 text-sm">
        <p className="font-medium text-amber-800">Workspace not synced to database</p>
        <p className="text-amber-700 mt-0.5">
          Your Clerk organisation was created but the database record is missing
          (the webhook is not configured locally). Click below to sync it now.
        </p>
        {error && <p className="text-red-600 mt-1">{error}</p>}
      </div>
      <button
        onClick={handleSync}
        disabled={loading}
        className="shrink-0 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-300 text-white text-xs font-medium rounded-lg transition-colors"
      >
        {loading ? "Syncing…" : "Sync now"}
      </button>
    </div>
  );
}
