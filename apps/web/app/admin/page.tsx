"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";

// ─── Badge helpers ────────────────────────────────────────────────────────────

type Plan = "starter" | "growth" | "enterprise";
type Status = "active" | "suspended" | "delinquent" | "cancelled";

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

function fmtDate(d: Date | string) {
  return new Date(d).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const router = useRouter();
  const utils  = trpc.useUtils();
  const { data: tenants, isLoading } = trpc.admin.listTenants.useQuery();

  const totalTenants  = tenants?.length ?? 0;
  const activeTenants = tenants?.filter((t) => t.status === "active").length ?? 0;
  const totalBookings = tenants?.reduce((sum, t) => sum + (t.bookingCount ?? 0), 0) ?? 0;

  // Create Workspace modal state
  const [showModal, setShowModal]       = useState(false);
  const [bizName, setBizName]           = useState("");
  const [slug, setSlug]                 = useState("");
  const [plan, setPlan]                 = useState<"starter" | "growth" | "enterprise">("starter");
  const [inviteEmail, setInviteEmail]   = useState("");
  const [modalError, setModalError]     = useState<string | null>(null);

  function handleNameChange(name: string) {
    setBizName(name);
    setSlug(
      name.toLowerCase().trim()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .slice(0, 48)
    );
  }

  const createWorkspace = trpc.admin.createWorkspace.useMutation({
    onSuccess: (data) => {
      utils.admin.listTenants.invalidate();
      setShowModal(false);
      setBizName(""); setSlug(""); setInviteEmail(""); setModalError(null);
      router.push(`/admin/tenants/${data.tenantId}`);
    },
    onError: (err) => setModalError(err.message),
  });

  return (
    <div>
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Super Admin Dashboard</h1>
          <p className="mt-1 text-sm text-slate-400">
            Platform-wide overview across all tenants.
          </p>
        </div>
        <button
          onClick={() => { setShowModal(true); setModalError(null); }}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          + Create Workspace
        </button>
      </div>

      {/* Create Workspace Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md mx-4 p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-white mb-1">Create Client Workspace</h2>
            <p className="text-sm text-slate-400 mb-5">
              Creates a new workspace and optionally sends an invite email to the client.
            </p>

            <div className="space-y-4">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Business Name</label>
                <input
                  type="text"
                  value={bizName}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="e.g. Sunshine Clinic"
                  className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-slate-500"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Slug (URL identifier)</label>
                <input
                  type="text"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                  placeholder="sunshine-clinic"
                  className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-slate-500"
                />
                <p className="text-xs text-slate-500 mt-1">Used in booking URL: /book/{slug || "..."}</p>
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Plan</label>
                <select
                  value={plan}
                  onChange={(e) => setPlan(e.target.value as typeof plan)}
                  className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="starter">Starter</option>
                  <option value="growth">Growth</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  Client Email <span className="text-slate-600">(optional — sends invite)</span>
                </label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="client@example.com"
                  className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-slate-500"
                />
              </div>

              {modalError && (
                <p className="text-xs text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">
                  {modalError}
                </p>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  createWorkspace.mutate({
                    businessName: bizName,
                    slug,
                    plan,
                    ...(inviteEmail ? { inviteEmail } : {}),
                  });
                }}
                disabled={createWorkspace.isPending || !bizName || !slug}
                className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-900 disabled:text-indigo-400 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {createWorkspace.isPending ? "Creating…" : inviteEmail ? "Create & Send Invite" : "Create Workspace"}
              </button>
              <button
                onClick={() => { setShowModal(false); setModalError(null); }}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <SummaryCard label="Total Tenants"   value={totalTenants}  loading={isLoading} />
        <SummaryCard label="Active Tenants"  value={activeTenants} loading={isLoading} />
        <SummaryCard label="Total Bookings"  value={totalBookings}  loading={isLoading} />
      </div>

      {/* Tenant table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800">
          <h2 className="text-sm font-semibold text-white">All Tenants</h2>
        </div>

        {isLoading ? (
          <div className="space-y-px">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-14 bg-slate-800 animate-pulse" />
            ))}
          </div>
        ) : !tenants || tenants.length === 0 ? (
          <div className="px-6 py-16 text-center text-slate-500 text-sm">
            No tenants found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-xs text-slate-500 uppercase tracking-wide">
                  <th className="text-left px-5 py-3 font-medium">Tenant</th>
                  <th className="text-left px-4 py-3 font-medium">Plan</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-right px-4 py-3 font-medium">Bookings</th>
                  <th className="text-right px-4 py-3 font-medium">Staff</th>
                  <th className="text-right px-4 py-3 font-medium">Channels</th>
                  <th className="text-left px-4 py-3 font-medium">Created</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {tenants.map((t) => (
                  <tr
                    key={t.id}
                    className="border-b border-slate-800 last:border-0 hover:bg-slate-800/50 transition-colors"
                  >
                    <td className="px-5 py-3">
                      <p className="font-medium text-white">{t.name}</p>
                      <p className="text-xs text-slate-500">{t.slug}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${
                          PLAN_BADGE[t.plan as Plan] ?? "bg-gray-700 text-gray-200"
                        }`}
                      >
                        {t.plan}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${
                          STATUS_BADGE[t.status as Status] ?? "bg-gray-700 text-gray-400"
                        }`}
                      >
                        {t.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-300">
                      {t.bookingCount ?? 0}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-300">
                      {t.staffCount ?? 0}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-300">
                      {t.channelCount ?? 0}
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">
                      {fmtDate(t.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/tenants/${t.id}`}
                        className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-xs rounded-lg transition-colors"
                      >
                        View
                      </Link>
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

// ─── Summary card ─────────────────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  loading,
}: {
  label: string;
  value: number;
  loading: boolean;
}) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl px-5 py-4">
      <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">{label}</p>
      {loading ? (
        <div className="mt-2 h-8 w-16 bg-slate-800 rounded animate-pulse" />
      ) : (
        <p className="mt-1 text-3xl font-bold text-white">{value.toLocaleString()}</p>
      )}
    </div>
  );
}
