"use client";

import { OrganizationProfile } from "@clerk/nextjs";
import Link from "next/link";
import { useState } from "react";
import { trpc } from "@/lib/trpc/client";

// ─── Data Retention Section ───────────────────────────────────────────────────

function DataRetentionSection() {
  const { data: settings, isLoading, refetch } = trpc.compliance.getRetentionSettings.useQuery();

  const updateMutation = trpc.compliance.updateRetentionSettings.useMutation({
    onSuccess: () => {
      refetch();
      setSaveMessage("Settings saved.");
      setTimeout(() => setSaveMessage(""), 3000);
    },
    onError: (err) => {
      setSaveMessage(`Error: ${err.message}`);
    },
  });

  const erasureMutation = trpc.compliance.requestErasure.useMutation({
    onSuccess: () => {
      setErasureUserId("");
      setErasureReason("");
      setErasureMessage("Erasure request completed.");
      setTimeout(() => setErasureMessage(""), 4000);
    },
    onError: (err) => {
      setErasureMessage(`Error: ${err.message}`);
    },
  });

  const [conversations, setConversations] = useState<number | "">("");
  const [webhookEvents, setWebhookEvents] = useState<number | "">("");
  const [retentionBookings, setRetentionBookings] = useState<number | "">("");
  const [saveMessage, setSaveMessage] = useState("");

  const [erasureUserId, setErasureUserId] = useState("");
  const [erasureReason, setErasureReason] = useState("");
  const [erasureMessage, setErasureMessage] = useState("");
  const [erasureConfirmPending, setErasureConfirmPending] = useState(false);

  if (isLoading) {
    return (
      <div className="animate-pulse rounded-xl border border-gray-200 p-6">
        <div className="h-4 bg-gray-100 rounded w-48 mb-3" />
        <div className="h-4 bg-gray-100 rounded w-64" />
      </div>
    );
  }

  const current = settings ?? { conversations: 90, webhookEvents: 30, bookings: 365 };

  function handleSave() {
    const patch: {
      conversations?: number;
      webhookEvents?: number;
      bookings?: number;
    } = {};
    if (conversations !== "" && conversations !== current.conversations) {
      patch.conversations = conversations as number;
    }
    if (webhookEvents !== "" && webhookEvents !== current.webhookEvents) {
      patch.webhookEvents = webhookEvents as number;
    }
    if (retentionBookings !== "" && retentionBookings !== current.bookings) {
      patch.bookings = retentionBookings as number;
    }
    if (Object.keys(patch).length === 0) {
      setSaveMessage("No changes to save.");
      setTimeout(() => setSaveMessage(""), 2000);
      return;
    }
    updateMutation.mutate(patch);
  }

  function handleErasureSubmit() {
    if (!erasureUserId.trim()) return;
    if (!erasureConfirmPending) {
      setErasureConfirmPending(true);
      return;
    }
    // Confirmed — run erasure
    setErasureConfirmPending(false);
    erasureMutation.mutate({
      externalUserId: erasureUserId.trim(),
      reason: erasureReason.trim() || undefined,
    });
  }

  return (
    <div className="space-y-8">
      {/* Retention periods */}
      <div className="rounded-xl border border-gray-200 divide-y divide-gray-100">
        <div className="px-6 py-4">
          <h3 className="text-base font-semibold text-gray-900">Retention Periods</h3>
          <p className="text-sm text-gray-500 mt-1">
            Data older than these thresholds is automatically deleted by the nightly
            retention job. Changes take effect on the next run.
          </p>
        </div>

        {/* Conversations */}
        <div className="px-6 py-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-gray-800">Conversation history</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Current: <span className="font-semibold">{current.conversations} days</span>{" "}
              &bull; Allowed: 7–730 days
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={7}
              max={730}
              placeholder={String(current.conversations)}
              value={conversations}
              onChange={(e) =>
                setConversations(e.target.value === "" ? "" : parseInt(e.target.value, 10))
              }
              className="w-24 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <span className="text-sm text-gray-400">days</span>
          </div>
        </div>

        {/* Webhook events */}
        <div className="px-6 py-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-gray-800">Webhook event payloads</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Current: <span className="font-semibold">{current.webhookEvents} days</span>{" "}
              &bull; Allowed: 7–90 days
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={7}
              max={90}
              placeholder={String(current.webhookEvents)}
              value={webhookEvents}
              onChange={(e) =>
                setWebhookEvents(e.target.value === "" ? "" : parseInt(e.target.value, 10))
              }
              className="w-24 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <span className="text-sm text-gray-400">days</span>
          </div>
        </div>

        {/* Bookings */}
        <div className="px-6 py-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-gray-800">Booking records</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Current: <span className="font-semibold">{current.bookings} days</span>{" "}
              &bull; Allowed: 90–2555 days
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={90}
              max={2555}
              placeholder={String(current.bookings)}
              value={retentionBookings}
              onChange={(e) =>
                setRetentionBookings(e.target.value === "" ? "" : parseInt(e.target.value, 10))
              }
              className="w-24 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <span className="text-sm text-gray-400">days</span>
          </div>
        </div>

        {/* Save row */}
        <div className="px-6 py-4 flex items-center justify-between">
          <p className="text-sm text-gray-500">
            {saveMessage || "Enter new values above and click Save."}
          </p>
          <button
            onClick={handleSave}
            disabled={updateMutation.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {updateMutation.isPending ? "Saving…" : "Save retention settings"}
          </button>
        </div>
      </div>

      {/* GDPR erasure */}
      <div className="rounded-xl border border-red-100 bg-red-50 divide-y divide-red-100">
        <div className="px-6 py-4">
          <h3 className="text-base font-semibold text-red-800">Request User Erasure</h3>
          <p className="text-sm text-red-700 mt-1">
            Permanently deletes all conversation history for the specified external user ID
            (WhatsApp number, Telegram user ID, etc.) across all channels. This cannot be
            undone. Booking records linked to this user are also returned in the deletion
            scope — use with caution.
          </p>
        </div>
        <div className="px-6 py-4 space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              External user ID <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. 447911123456 or telegram:12345678"
              value={erasureUserId}
              onChange={(e) => {
                setErasureUserId(e.target.value);
                setErasureConfirmPending(false);
              }}
              className="w-full max-w-sm rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Reason (optional)
            </label>
            <input
              type="text"
              placeholder="e.g. GDPR erasure request via email"
              value={erasureReason}
              onChange={(e) => setErasureReason(e.target.value)}
              className="w-full max-w-sm rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
            />
          </div>

          {erasureMessage && (
            <p className="text-sm font-medium text-red-700">{erasureMessage}</p>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={handleErasureSubmit}
              disabled={!erasureUserId.trim() || erasureMutation.isPending}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50 ${
                erasureConfirmPending
                  ? "bg-red-700 hover:bg-red-800"
                  : "bg-red-600 hover:bg-red-700"
              }`}
            >
              {erasureMutation.isPending
                ? "Processing…"
                : erasureConfirmPending
                ? "Confirm erasure — this is irreversible"
                : "Request erasure"}
            </button>
            {erasureConfirmPending && (
              <button
                onClick={() => setErasureConfirmPending(false)}
                className="text-sm text-gray-500 hover:text-gray-700 underline"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">Settings</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage your workspace, members, and security settings.
        </p>
      </div>

      {/* MFA notice */}
      <div className="mb-6 flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
        <span className="text-amber-500 text-lg mt-0.5">&#9888;</span>
        <div className="text-sm">
          <p className="font-medium text-amber-800">Enable MFA for your team</p>
          <p className="text-amber-700 mt-0.5">
            For back-office accounts handling bookings and integrations, we
            strongly recommend requiring MFA. Configure this in the{" "}
            <strong>Members</strong> tab below, or visit your{" "}
            <Link
              href="https://dashboard.clerk.com"
              target="_blank"
              className="underline"
            >
              Clerk dashboard
            </Link>{" "}
            to enforce MFA org-wide.
          </p>
        </div>
      </div>

      {/* Profile link */}
      <div className="mb-6">
        <Link
          href="/settings/profile"
          className="inline-flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-700 font-medium"
        >
          &#8594; Manage your personal profile &amp; MFA
        </Link>
      </div>

      {/* Clerk org profile: handles members, roles, invitations */}
      <OrganizationProfile
        appearance={{
          elements: {
            rootBox: "w-full",
            card: "shadow-none border border-gray-200 rounded-xl",
          },
        }}
      />

      {/* ── Data Retention ──────────────────────────────────────────────── */}
      <div className="mt-12">
        <div className="mb-5">
          <h2 className="text-lg font-semibold text-gray-900">Data Retention</h2>
          <p className="text-sm text-gray-500 mt-1">
            Configure how long conversation history and event payloads are kept.
            See our{" "}
            <Link href="/privacy" className="text-indigo-600 hover:underline">
              Privacy Policy
            </Link>{" "}
            for details.
          </p>
        </div>
        <DataRetentionSection />
      </div>
    </div>
  );
}
