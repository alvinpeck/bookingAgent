"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/lib/trpc/client";

// ─── Enter Portal button ──────────────────────────────────────────────────────

function EnterPortalButton({ tenantId }: { tenantId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleEnter() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/enter-portal", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ tenantId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert((err as any).error ?? "Failed to enter portal");
        return;
      }
      router.push("/dashboard");
    } catch {
      alert("Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={handleEnter}
      disabled={busy}
      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-900 disabled:text-indigo-400 text-white text-sm font-medium rounded-lg transition-colors"
    >
      {busy ? "Opening…" : "Enter Portal →"}
    </button>
  );
}

// ─── Badge helpers ────────────────────────────────────────────────────────────

type Plan = "starter" | "growth" | "enterprise";
type Status = "active" | "suspended" | "delinquent" | "cancelled";
type BookingStatus =
  | "pending"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "no_show"
  | "rescheduled";

const PLAN_BADGE: Record<Plan, string> = {
  starter:    "bg-gray-700 text-gray-200",
  growth:     "bg-blue-700 text-blue-100",
  enterprise: "bg-purple-700 text-purple-100",
};

const STATUS_BADGE: Record<Status, string> = {
  active:     "bg-green-700 text-green-100",
  suspended:  "bg-red-700 text-red-100",
  delinquent: "bg-yellow-700 text-yellow-100",
  cancelled:  "bg-gray-700 text-gray-400",
};

const BOOKING_STATUS_BADGE: Record<BookingStatus, string> = {
  confirmed:   "bg-green-800 text-green-200",
  pending:     "bg-yellow-800 text-yellow-200",
  completed:   "bg-blue-800 text-blue-200",
  cancelled:   "bg-red-800 text-red-200",
  no_show:     "bg-gray-700 text-gray-400",
  rescheduled: "bg-purple-800 text-purple-200",
};

const CHANNEL_STATUS_BADGE: Record<string, string> = {
  active:        "bg-green-800 text-green-200",
  inactive:      "bg-gray-700 text-gray-400",
  error:         "bg-red-800 text-red-200",
  pending_setup: "bg-yellow-800 text-yellow-200",
};

function fmtDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function fmtDateTime(d: Date | string | null | undefined) {
  if (!d) return "—";
  const dt = new Date(d);
  return (
    dt.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }) +
    " " +
    dt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TenantDetailPage() {
  const params   = useParams<{ tenantId: string }>();
  const tenantId = params.tenantId;

  const utils = trpc.useUtils();

  const { data: tenantData, isLoading: loadingTenant } =
    trpc.admin.getTenant.useQuery({ tenantId });

  const { data: bookingsData, isLoading: loadingBookings } =
    trpc.admin.getTenantBookings.useQuery({ tenantId, pageSize: 20 });

  const { data: channelsData, isLoading: loadingChannels } =
    trpc.admin.getTenantChannels.useQuery({ tenantId });

  // Plan / status controls
  const [selectedPlan, setSelectedPlan] = useState<Plan | "">("");
  const [selectedStatus, setSelectedStatus] = useState<
    "active" | "suspended" | ""
  >("");
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  // Invite member
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"owner" | "admin" | "staff" | "readonly">("staff");
  const [inviteMsg, setInviteMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  const inviteMember = trpc.admin.inviteMember.useMutation({
    onSuccess: (data) => {
      setInviteEmail("");
      setInviteLink(data.inviteUrl);
      setInviteMsg({
        type: "success",
        text: data.email ? `Invite link generated for ${data.email}` : "Invite link generated.",
      });
    },
    onError: (err) => {
      setInviteMsg({ type: "error", text: err.message });
    },
  });

  const updatePlan = trpc.admin.updateTenantPlan.useMutation({
    onSuccess: () => {
      utils.admin.getTenant.invalidate({ tenantId });
      utils.admin.listTenants.invalidate();
      setSaveMsg("Plan updated.");
      setTimeout(() => setSaveMsg(null), 3000);
    },
  });

  const updateStatus = trpc.admin.updateTenantStatus.useMutation({
    onSuccess: () => {
      utils.admin.getTenant.invalidate({ tenantId });
      utils.admin.listTenants.invalidate();
      setSaveMsg("Status updated.");
      setTimeout(() => setSaveMsg(null), 3000);
    },
  });

  async function handleSave() {
    const tenant = tenantData?.tenant;
    if (!tenant) return;

    const planToSave = selectedPlan || (tenant.plan as Plan);
    const statusToSave = selectedStatus || (tenant.status as "active" | "suspended");

    const planChanged = selectedPlan && selectedPlan !== tenant.plan;
    const statusChanged =
      selectedStatus &&
      selectedStatus !== tenant.status &&
      (selectedStatus === "active" || selectedStatus === "suspended");

    if (planChanged) {
      await updatePlan.mutateAsync({ tenantId, plan: planToSave });
    }
    if (statusChanged) {
      await updateStatus.mutateAsync({
        tenantId,
        status: statusToSave as "active" | "suspended",
      });
    }
    if (!planChanged && !statusChanged) {
      setSaveMsg("No changes to save.");
      setTimeout(() => setSaveMsg(null), 3000);
    }
  }

  if (loadingTenant) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 bg-slate-900 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (!tenantData) {
    return (
      <div className="text-slate-400 text-sm">
        Tenant not found.{" "}
        <Link href="/admin" className="text-indigo-400 underline">
          Back to dashboard
        </Link>
      </div>
    );
  }

  const { tenant, settings, stats } = tenantData;

  const currentPlan = (selectedPlan || tenant.plan) as Plan;
  const currentStatus = selectedStatus || tenant.status;

  return (
    <div className="space-y-8">
      {/* Back link */}
      <Link
        href="/admin"
        className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white transition-colors"
      >
        ← All Tenants
      </Link>

      {/* ── Section 1: Header ── */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl px-6 py-5">
        <div className="flex flex-wrap items-start gap-4 justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">{tenant.name}</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              /{tenant.slug} &nbsp;·&nbsp; {tenant.id}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <EnterPortalButton tenantId={tenant.id} />
            <span
              className={`px-2 py-0.5 rounded text-xs font-semibold capitalize ${
                PLAN_BADGE[tenant.plan as Plan] ?? "bg-gray-700 text-gray-200"
              }`}
            >
              {tenant.plan}
            </span>
            <span
              className={`px-2 py-0.5 rounded text-xs font-semibold capitalize ${
                STATUS_BADGE[tenant.status as Status] ??
                "bg-gray-700 text-gray-400"
              }`}
            >
              {tenant.status}
            </span>
            <span className="text-xs text-slate-500">
              Created {fmtDate(tenant.createdAt)}
            </span>
          </div>
        </div>

        {/* Extra tenant details */}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs text-slate-400">
          <div>
            <p className="text-slate-600 uppercase tracking-wide">Email</p>
            <p className="text-slate-300">{tenant.businessEmail ?? "—"}</p>
          </div>
          <div>
            <p className="text-slate-600 uppercase tracking-wide">Phone</p>
            <p className="text-slate-300">{tenant.businessPhone ?? "—"}</p>
          </div>
          <div>
            <p className="text-slate-600 uppercase tracking-wide">Timezone</p>
            <p className="text-slate-300">{tenant.timezone}</p>
          </div>
          <div>
            <p className="text-slate-600 uppercase tracking-wide">Website</p>
            <p className="text-slate-300 truncate">{tenant.websiteUrl ?? "—"}</p>
          </div>
        </div>
      </div>

      {/* ── Section 2: Quick stats ── */}
      <div>
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3">
          Stats
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <StatCard label="Bookings"       value={stats.bookingCount} />
          <StatCard label="Staff"          value={stats.staffCount} />
          <StatCard label="Channels"       value={stats.channelCount} />
          <StatCard label="Active Convos"  value={stats.activeConversations} />
          <StatCard
            label="AI Tokens (mo)"
            value={stats.monthlyAiTokens}
            sub={
              stats.aiTokenQuota
                ? `/ ${stats.aiTokenQuota.toLocaleString()}`
                : "Unlimited"
            }
          />
        </div>
      </div>

      {/* ── Section 3: Plan & Status controls ── */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl px-6 py-5">
        <h2 className="text-sm font-semibold text-white mb-4">
          Plan &amp; Status Controls
        </h2>
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500">Plan</label>
            <select
              value={currentPlan}
              onChange={(e) => setSelectedPlan(e.target.value as Plan)}
              className="bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="starter">Starter</option>
              <option value="growth">Growth</option>
              <option value="enterprise">Enterprise</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500">Status</label>
            <select
              value={currentStatus}
              onChange={(e) =>
                setSelectedStatus(e.target.value as "active" | "suspended" | "")
              }
              className="bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>

          <button
            onClick={handleSave}
            disabled={updatePlan.isPending || updateStatus.isPending}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-900 disabled:text-indigo-600 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {updatePlan.isPending || updateStatus.isPending ? "Saving…" : "Save"}
          </button>

          {saveMsg && (
            <span className="text-xs text-green-400">{saveMsg}</span>
          )}
        </div>
      </div>

      {/* ── Section 4: Invite Member ── */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl px-6 py-5">
        <h2 className="text-sm font-semibold text-white mb-1">Invite Member</h2>
        <p className="text-xs text-slate-400 mb-4">
          Generate a secure invite link to share with the user. Email is optional — leave it blank to create a generic link.
        </p>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-400">Email <span className="text-slate-600">(optional)</span></label>
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="client@example.com"
              className="bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 w-64 focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-slate-500"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-400">Role</label>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as typeof inviteRole)}
              className="bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="staff">Staff (limited access)</option>
              <option value="admin">Admin (full access)</option>
              <option value="owner">Owner</option>
              <option value="readonly">Read-only</option>
            </select>
          </div>
          <button
            onClick={() => inviteMember.mutate({
              tenantId,
              ...(inviteEmail ? { email: inviteEmail } : {}),
              role: inviteRole,
            })}
            disabled={inviteMember.isPending}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-900 disabled:text-indigo-400 text-white text-sm rounded-lg transition-colors"
          >
            {inviteMember.isPending ? "Generating…" : "Generate Invite Link"}
          </button>
        </div>

        {inviteMsg && (
          <p className={`mt-3 text-xs ${inviteMsg.type === "success" ? "text-green-400" : "text-red-400"}`}>
            {inviteMsg.text}
          </p>
        )}

        {inviteLink && (
          <div className="mt-3 p-3 bg-slate-800 border border-slate-700 rounded-lg space-y-2">
            <p className="text-xs text-slate-400">Share this link with the user — expires in 7 days:</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs text-indigo-300 break-all">{inviteLink}</code>
              <button
                onClick={() => navigator.clipboard.writeText(inviteLink)}
                className="shrink-0 px-2 py-1 bg-slate-700 hover:bg-slate-600 text-white text-xs rounded transition-colors"
              >
                Copy
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Section 5: Settings keys ── */}

      <div className="bg-slate-900 border border-slate-800 rounded-xl px-6 py-5">
        <h2 className="text-sm font-semibold text-white mb-3">
          Settings Keys
        </h2>
        {settings.length === 0 ? (
          <p className="text-xs text-slate-500">No settings configured.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {settings.map((key) => (
              <span
                key={key}
                className="px-2 py-1 bg-slate-800 border border-slate-700 text-slate-300 text-xs rounded font-mono"
              >
                {key}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── Section 5: Channels ── */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800">
          <h2 className="text-sm font-semibold text-white">Channels</h2>
        </div>
        {loadingChannels ? (
          <div className="space-y-px">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="h-12 bg-slate-800 animate-pulse" />
            ))}
          </div>
        ) : !channelsData || channelsData.length === 0 ? (
          <p className="px-5 py-6 text-xs text-slate-500">
            No channels configured.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-xs text-slate-500 uppercase tracking-wide">
                  <th className="text-left px-5 py-3 font-medium">Display Name</th>
                  <th className="text-left px-4 py-3 font-medium">Type</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-left px-4 py-3 font-medium">Last Webhook</th>
                  <th className="text-left px-4 py-3 font-medium">Last Error</th>
                </tr>
              </thead>
              <tbody>
                {channelsData.map((ch) => (
                  <tr
                    key={ch.id}
                    className="border-b border-slate-800 last:border-0 hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="px-5 py-3 text-white font-medium">
                      {ch.displayName}
                    </td>
                    <td className="px-4 py-3 text-slate-400 capitalize">
                      {ch.type.replace("_", " ")}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${
                          CHANNEL_STATUS_BADGE[ch.status] ??
                          "bg-gray-700 text-gray-400"
                        }`}
                      >
                        {ch.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">
                      {fmtDateTime(ch.lastWebhookAt)}
                    </td>
                    <td className="px-4 py-3 text-xs text-red-400 max-w-xs truncate">
                      {ch.lastErrorMessage ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Section 6: Recent bookings ── */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">
            Recent Bookings
          </h2>
          {bookingsData && (
            <span className="text-xs text-slate-500">
              Showing {bookingsData.data.length} of {bookingsData.total}
            </span>
          )}
        </div>
        {loadingBookings ? (
          <div className="space-y-px">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 bg-slate-800 animate-pulse" />
            ))}
          </div>
        ) : !bookingsData || bookingsData.data.length === 0 ? (
          <p className="px-5 py-6 text-xs text-slate-500">No bookings yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-xs text-slate-500 uppercase tracking-wide">
                  <th className="text-left px-5 py-3 font-medium">Customer</th>
                  <th className="text-left px-4 py-3 font-medium">Service</th>
                  <th className="text-left px-4 py-3 font-medium">Staff</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-left px-4 py-3 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {bookingsData.data.map((b) => (
                  <tr
                    key={b.id}
                    className="border-b border-slate-800 last:border-0 hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="px-5 py-3">
                      <p className="text-white font-medium">{b.customerName}</p>
                      <p className="text-xs text-slate-500">{b.customerEmail}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {(b as any).service?.name ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-400">
                      {(b as any).staff?.displayName ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${
                          BOOKING_STATUS_BADGE[b.status as BookingStatus] ??
                          "bg-gray-700 text-gray-400"
                        }`}
                      >
                        {b.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">
                      {fmtDateTime(b.startsAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: number;
  sub?: string;
}) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3">
      <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold text-white">
        {value.toLocaleString()}
      </p>
      {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
    </div>
  );
}
