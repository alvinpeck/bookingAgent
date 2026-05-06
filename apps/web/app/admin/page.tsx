"use client";

import Link from "next/link";
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
  const { data: tenants, isLoading } = trpc.admin.listTenants.useQuery();

  const totalTenants  = tenants?.length ?? 0;
  const activeTenants = tenants?.filter((t) => t.status === "active").length ?? 0;
  const totalBookings = tenants?.reduce((sum, t) => sum + (t.bookingCount ?? 0), 0) ?? 0;

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-white">Super Admin Dashboard</h1>
        <p className="mt-1 text-sm text-slate-400">
          Platform-wide overview across all tenants.
        </p>
      </div>

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
