"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { trpc } from "@/lib/trpc/client";

const inputCls =
  "w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

// ─── Calendar selector ────────────────────────────────────────────────────────

function CalendarSelector({
  integrationId,
  currentCalendarId,
}: {
  integrationId: string;
  currentCalendarId: string | null;
}) {
  const utils = trpc.useUtils();
  const { data: calendars, isLoading } = trpc.integrations.listGoogleCalendars.useQuery(
    { integrationId },
    { retry: false }
  );
  const updateMutation = trpc.integrations.update.useMutation({
    onSuccess: () => utils.integrations.getMine.invalidate(),
  });

  if (isLoading) return <span className="text-xs text-gray-400">Loading calendars…</span>;
  if (!calendars?.length) return <span className="text-xs text-gray-400">No calendars found</span>;

  return (
    <select
      value={currentCalendarId ?? "primary"}
      onChange={(e) =>
        updateMutation.mutate({ integrationId, googleCalendarId: e.target.value })
      }
      className={inputCls}
      disabled={updateMutation.isPending}
    >
      {calendars.map((c) => (
        <option key={c.id} value={c.id}>
          {c.summary}
          {c.primary ? " (primary)" : ""}
        </option>
      ))}
    </select>
  );
}

// ─── Connected card ───────────────────────────────────────────────────────────

type MyIntegration = {
  id: string;
  status: string;
  googleEmail?: string | null;
  googleCalendarId?: string | null;
  writeBackEnabled: boolean;
  lastSyncAt?: Date | string | null;
  lastSyncError?: string | null;
};

function ConnectedCard({ integration }: { integration: MyIntegration }) {
  const utils = trpc.useUtils();

  const disconnectMutation = trpc.integrations.disconnect.useMutation({
    onSuccess: () => utils.integrations.getMine.invalidate(),
  });
  const updateMutation = trpc.integrations.update.useMutation({
    onSuccess: () => utils.integrations.getMine.invalidate(),
  });

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center text-lg shrink-0">
            📅
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-900">Google Calendar</span>
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                connected
              </span>
            </div>
            {integration.googleEmail && (
              <p className="text-xs text-gray-500 mt-0.5">{integration.googleEmail}</p>
            )}
          </div>
        </div>
        <button
          onClick={() => {
            if (confirm("Disconnect Google Calendar? Existing calendar events won't be removed.")) {
              disconnectMutation.mutate({ integrationId: integration.id });
            }
          }}
          disabled={disconnectMutation.isPending}
          className="text-xs text-gray-400 hover:text-red-500 px-2 py-1 rounded-md hover:bg-red-50 transition-colors"
        >
          {disconnectMutation.isPending ? "Disconnecting…" : "Disconnect"}
        </button>
      </div>

      {/* Calendar selector */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1.5">
          Sync with calendar
        </label>
        <CalendarSelector
          integrationId={integration.id}
          currentCalendarId={integration.googleCalendarId}
        />
        <p className="text-xs text-gray-400 mt-1">
          New bookings and cancellations will update this calendar.
        </p>
      </div>

      {/* Write-back toggle */}
      <div className="flex items-center justify-between py-2 border-t border-gray-100">
        <div>
          <p className="text-sm text-gray-700 font-medium">Write bookings to calendar</p>
          <p className="text-xs text-gray-400 mt-0.5">
            Automatically create calendar events when a booking is confirmed.
          </p>
        </div>
        <button
          role="switch"
          aria-checked={integration.writeBackEnabled}
          onClick={() =>
            updateMutation.mutate({
              integrationId: integration.id,
              writeBackEnabled: !integration.writeBackEnabled,
            })
          }
          disabled={updateMutation.isPending}
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
            integration.writeBackEnabled ? "bg-indigo-600" : "bg-gray-200"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform ${
              integration.writeBackEnabled ? "translate-x-4" : "translate-x-0"
            }`}
          />
        </button>
      </div>

      {/* Free/busy sync note */}
      <div className="py-2 border-t border-gray-100">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-700 font-medium">Block busy times from bookings</p>
            <p className="text-xs text-gray-400 mt-0.5">
              When customers view available slots, times blocked in your Google Calendar
              will be hidden automatically.
            </p>
          </div>
          <span className="px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700">
            Always on
          </span>
        </div>
      </div>

      {integration.lastSyncError && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600">
          Last error: {integration.lastSyncError}
        </div>
      )}
    </div>
  );
}

// ─── Not-connected card ───────────────────────────────────────────────────────

function NotConnectedCard() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center text-lg shrink-0">
          📅
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium text-gray-900">Google Calendar</span>
            <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-500">
              not connected
            </span>
          </div>
          <p className="text-xs text-gray-500 mb-4">
            Connect your Google Calendar to automatically block your busy times and write
            new bookings as calendar events.
          </p>
          <a
            href="/api/integrations/google/connect"
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12.545 10.239v3.821h5.445c-.712 2.315-2.647 3.972-5.445 3.972a6.033 6.033 0 1 1 0-12.064c1.498 0 2.866.549 3.921 1.453l2.814-2.814A9.969 9.969 0 0 0 12.545 2C7.021 2 2.543 6.477 2.543 12s4.478 10 10.002 10c8.396 0 10.249-7.85 9.426-11.748l-9.426-.013z" />
            </svg>
            Connect Google Calendar
          </a>
        </div>
      </div>
    </div>
  );
}

// ─── No staff record warning ──────────────────────────────────────────────────

function NoStaffWarning() {
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl px-6 py-5">
      <p className="text-sm font-medium text-amber-800">You need a staff record to connect Google Calendar.</p>
      <p className="text-xs text-amber-700 mt-1">
        Ask an admin to add you as a staff member under{" "}
        <a href="/staff" className="underline">Staff</a>, then come back here.
      </p>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function IntegrationsPage() {
  const searchParams = useSearchParams();
  const [banner, setBanner] = useState<{ type: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    if (searchParams.get("connected") === "true") {
      setBanner({ type: "success", message: "Google Calendar connected successfully." });
    } else if (searchParams.get("error")) {
      const err = searchParams.get("error")!;
      const messages: Record<string, string> = {
        no_refresh_token:
          "No refresh token received. Please disconnect your Google account from this app in your Google Account settings, then try again.",
        token_exchange_failed: "Failed to exchange the authorization code. Please try again.",
        invalid_state: "Security check failed. Please try again.",
        staff_not_found: "Could not find your staff record. Contact an admin.",
        misconfigured: "Google OAuth is not configured on this server.",
      };
      setBanner({ type: "error", message: messages[err] ?? `Error: ${err}` });
    }
  }, [searchParams]);

  const { data: myIntegration, isLoading } = trpc.integrations.getMine.useQuery();

  // null = no staff record, undefined = loading, object | null = resolved
  const hasNoStaffRecord = !isLoading && myIntegration === null;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">Integrations</h1>
        <p className="mt-1 text-sm text-gray-500">
          Connect third-party services to automate your scheduling workflow.
        </p>
      </div>

      {/* Status banner */}
      {banner && (
        <div
          className={`mb-6 rounded-xl px-5 py-4 text-sm ${
            banner.type === "success"
              ? "bg-green-50 border border-green-200 text-green-800"
              : "bg-red-50 border border-red-200 text-red-700"
          }`}
        >
          <div className="flex items-start justify-between gap-4">
            <span>{banner.message}</span>
            <button
              onClick={() => setBanner(null)}
              className="shrink-0 text-xs underline opacity-70 hover:opacity-100"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 h-32 animate-pulse" />
      ) : hasNoStaffRecord ? (
        <NoStaffWarning />
      ) : myIntegration ? (
        <ConnectedCard integration={myIntegration as unknown as MyIntegration} />
      ) : (
        <NotConnectedCard />
      )}

      {/* How it works */}
      <div className="mt-8 bg-gray-50 border border-gray-200 rounded-xl p-5">
        <h3 className="text-xs font-semibold text-gray-700 mb-2">How Google Calendar sync works</h3>
        <ul className="text-xs text-gray-500 space-y-1 list-disc list-inside">
          <li>Busy time in your Google Calendar hides those slots from the booking page.</li>
          <li>When a booking is confirmed, an event is created in your chosen calendar.</li>
          <li>When a booking is cancelled, the event is automatically removed.</li>
          <li>Each staff member connects their own Google account — no shared access.</li>
        </ul>
        <p className="text-xs text-gray-400 mt-3">
          Requires <code className="bg-white border border-gray-200 rounded px-1">GOOGLE_CLIENT_ID</code>,{" "}
          <code className="bg-white border border-gray-200 rounded px-1">GOOGLE_CLIENT_SECRET</code>, and{" "}
          <code className="bg-white border border-gray-200 rounded px-1">GOOGLE_REDIRECT_URI</code> in your
          environment. Register{" "}
          <code className="bg-white border border-gray-200 rounded px-1">
            {typeof window !== "undefined" ? window.location.origin : ""}/api/integrations/google/callback
          </code>{" "}
          as an authorized redirect URI in Google Cloud Console.
        </p>
      </div>
    </div>
  );
}
