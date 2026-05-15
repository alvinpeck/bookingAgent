"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc/client";

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const { data: tenants, isLoading } = trpc.admin.listTenants.useQuery();

  const totalTenants   = tenants?.length ?? 0;
  const activeTenants  = tenants?.filter((t) => t.status === "active").length ?? 0;
  const suspendedTenants = tenants?.filter((t) => t.status === "suspended").length ?? 0;
  const totalBookings  = tenants?.reduce((sum, t) => sum + (t.bookingCount ?? 0), 0) ?? 0;
  const totalStaff     = tenants?.reduce((sum, t) => sum + (t.staffCount ?? 0), 0) ?? 0;
  const totalChannels  = tenants?.reduce((sum, t) => sum + (t.channelCount ?? 0), 0) ?? 0;

  // Most recent 5 tenants
  const recentTenants = tenants?.slice(0, 5) ?? [];

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-white">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-400">
          Platform-wide overview across all client workspaces.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-10">
        <SummaryCard label="Total Workspaces" value={totalTenants}    loading={isLoading} color="text-white" />
        <SummaryCard label="Active"           value={activeTenants}   loading={isLoading} color="text-green-400" />
        <SummaryCard label="Suspended"        value={suspendedTenants} loading={isLoading} color="text-red-400" />
        <SummaryCard label="Total Bookings"   value={totalBookings}   loading={isLoading} color="text-blue-400" />
        <SummaryCard label="Total Staff"      value={totalStaff}      loading={isLoading} color="text-purple-400" />
        <SummaryCard label="Total Channels"   value={totalChannels}   loading={isLoading} color="text-yellow-400" />
      </div>

      {/* Recently added */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Recently Added Workspaces</h2>
          <Link
            href="/admin/tenants"
            className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            View all →
          </Link>
        </div>

        {isLoading ? (
          <div className="space-y-px">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-14 bg-slate-800 animate-pulse" />
            ))}
          </div>
        ) : recentTenants.length === 0 ? (
          <div className="px-6 py-12 text-center text-slate-500 text-sm">
            No workspaces yet.{" "}
            <Link href="/admin/tenants" className="text-indigo-400 hover:underline">
              Create one
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-slate-800">
            {recentTenants.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between px-5 py-3 hover:bg-slate-800/50 transition-colors"
              >
                <div>
                  <p className="text-sm font-medium text-white">{t.name}</p>
                  <p className="text-xs text-slate-500">{t.slug}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${
                    t.status === "active"    ? "bg-green-800 text-green-300" :
                    t.status === "suspended" ? "bg-red-800 text-red-300" :
                    "bg-gray-700 text-gray-400"
                  }`}>
                    {t.status}
                  </span>
                  <Link
                    href={`/admin/tenants/${t.id}`}
                    className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-white text-xs rounded-lg transition-colors"
                  >
                    View
                  </Link>
                </div>
              </li>
            ))}
          </ul>
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
  color = "text-white",
}: {
  label: string;
  value: number;
  loading: boolean;
  color?: string;
}) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-4">
      <p className="text-[11px] text-slate-500 uppercase tracking-wide font-medium leading-tight">{label}</p>
      {loading ? (
        <div className="mt-2 h-8 w-12 bg-slate-800 rounded animate-pulse" />
      ) : (
        <p className={`mt-1 text-3xl font-bold ${color}`}>{value.toLocaleString()}</p>
      )}
    </div>
  );
}
