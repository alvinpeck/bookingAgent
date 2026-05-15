"use client";

import { useSession, signOut } from "next-auth/react";
import { useState, useEffect } from "react";

export default function OnboardingPage() {
  const { data: session, status } = useSession();

  const [checking, setChecking]     = useState(true);
  const [creating, setCreating]     = useState(false);
  const [name, setName]             = useState("");
  const [slug, setSlug]             = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [loading, setLoading]       = useState(false);

  // Auto-derive slug from name unless user has manually edited it
  useEffect(() => {
    if (!slugEdited) {
      setSlug(name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
    }
  }, [name, slugEdited]);

  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/workspaces")
      .then((r) => r.json())
      .then(async (workspaces: { tenantId: string; tenantName: string }[]) => {
        if (workspaces.length > 0) {
          await fetch("/api/workspaces/switch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tenantId: workspaces[0].tenantId }),
          });
          window.location.href = "/dashboard";
        } else {
          setChecking(false);
        }
      })
      .catch(() => setChecking(false));
  }, [status]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res  = await fetch("/api/workspaces/create", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ name, slug }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to create workspace."); return; }
      // Cookie is set by API — hard navigate so middleware picks it up
      window.location.href = "/dashboard";
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (status === "loading" || checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-lg p-8">

        {!creating ? (
          /* ── No workspace screen ── */
          <div className="text-center">
            <div className="w-14 h-14 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-5">
              <svg className="w-7 h-7 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <h1 className="text-xl font-semibold text-gray-900 mb-2">Welcome to BookingAgent</h1>
            <p className="text-sm text-gray-500 mb-6">
              You&apos;re not part of any workspace yet. Create your own or wait for an invitation from your administrator.
            </p>

            <button
              onClick={() => setCreating(true)}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors mb-3"
            >
              Create a new workspace
            </button>

            <div className="bg-gray-50 rounded-lg px-4 py-3 text-left text-xs text-gray-500 space-y-1 mt-4 mb-4">
              <p className="font-medium text-gray-700">Signed in as</p>
              <p>{session?.user?.email ?? "—"}</p>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: "/sign-in" })}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              Sign in with a different account
            </button>
          </div>
        ) : (
          /* ── Create workspace form ── */
          <div>
            <button
              onClick={() => { setCreating(false); setError(null); }}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 mb-5 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </button>

            <h1 className="text-xl font-semibold text-gray-900 mb-1">Create your workspace</h1>
            <p className="text-sm text-gray-500 mb-6">You&apos;ll be the owner and can invite your team later.</p>

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Business name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Acme Hair Studio"
                  required
                  minLength={2}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Workspace URL</label>
                <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-transparent">
                  <span className="px-3 py-2.5 bg-gray-50 text-xs text-gray-400 border-r border-gray-300 whitespace-nowrap">
                    bookingagent.app/
                  </span>
                  <input
                    type="text"
                    value={slug}
                    onChange={(e) => { setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "")); setSlugEdited(true); }}
                    placeholder="acme-hair-studio"
                    required
                    minLength={2}
                    pattern="[a-z0-9-]+"
                    className="flex-1 px-3 py-2.5 text-sm focus:outline-none"
                  />
                </div>
              </div>

              {error && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading || !name || !slug}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {loading ? "Creating…" : "Create Workspace"}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
