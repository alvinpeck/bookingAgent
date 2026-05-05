"use client";

import { useState } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc/client";

const PAGE_SIZE = 25;

const ACTIONS = [
  "user.signed_in",
  "user.signed_out",
  "user.invited",
  "user.role_changed",
  "user.removed",
  "booking.created",
  "booking.confirmed",
  "booking.cancelled",
  "booking.rescheduled",
  "booking.completed",
  "booking.no_show",
  "booking.note_added",
  "integration.connected",
  "integration.disconnected",
  "channel.created",
  "channel.updated",
  "channel.deleted",
  "service.created",
  "service.updated",
  "service.archived",
  "availability.updated",
  "override.created",
  "override.deleted",
  "tenant.settings_updated",
  "tenant.plan_changed",
  "tenant.suspended",
] as const;

type Action = (typeof ACTIONS)[number];

function actionBadge(action: string) {
  const base = "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium";
  if (action.startsWith("booking.")) return `${base} bg-blue-100 text-blue-700`;
  if (action.startsWith("service.")) return `${base} bg-indigo-100 text-indigo-700`;
  if (action.startsWith("staff.")) return `${base} bg-orange-100 text-orange-700`;
  if (action.startsWith("availability.")) return `${base} bg-teal-100 text-teal-700`;
  return `${base} bg-gray-100 text-gray-600`;
}

function fmt(dateStr: string | Date) {
  const d = new Date(dateStr);
  return (
    d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) +
    " · " +
    d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
  );
}

function shortId(id: string) {
  return id.length > 8 ? id.slice(0, 8) + "…" : id;
}

interface Filters {
  action: Action | "";
  from: string;
  to: string;
}

export default function AuditPage() {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<Filters>({ action: "", from: "", to: "" });
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const query = trpc.audit.list.useQuery(
    {
      page,
      pageSize: PAGE_SIZE,
      ...(filters.action ? { action: filters.action } : {}),
      ...(filters.from ? { from: new Date(filters.from).toISOString() } : {}),
      ...(filters.to ? { to: new Date(filters.to + "T23:59:59").toISOString() } : {}),
    },
    { placeholderData: keepPreviousData }
  );

  const logs = query.data?.data ?? [];
  const total = query.data?.total ?? 0;
  const from = (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);
  const totalPages = Math.ceil(total / PAGE_SIZE);

  function applyFilter(patch: Partial<Filters>) {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  }

  function clearFilters() {
    setFilters({ action: "", from: "", to: "" });
    setPage(1);
  }

  const hasFilters = filters.action || filters.from || filters.to;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Audit Log</h1>

      {/* Filter bar */}
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 font-medium">Action</label>
          <select
            value={filters.action}
            onChange={(e) => applyFilter({ action: e.target.value as Action | "" })}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">All actions</option>
            {ACTIONS.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 font-medium">From</label>
          <input
            type="date"
            value={filters.from}
            onChange={(e) => applyFilter({ from: e.target.value })}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 font-medium">To</label>
          <input
            type="date"
            value={filters.to}
            onChange={(e) => applyFilter({ to: e.target.value })}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {hasFilters && (
          <button
            onClick={clearFilters}
            className="mb-0.5 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-500 hover:text-gray-700 hover:border-gray-300 bg-white shadow-sm transition"
          >
            Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
        {query.isLoading ? (
          <div className="px-6 py-12 text-center text-sm text-gray-400">Loading…</div>
        ) : logs.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-gray-400 text-sm">No audit logs found.</p>
            {hasFilters && (
              <button onClick={clearFilters} className="mt-2 text-indigo-600 text-sm hover:underline">
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 w-44">Timestamp</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400">Action</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400">Resource</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400">Actor</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {logs.map((log) => (
                <>
                  <tr
                    key={log.id}
                    onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                    className="cursor-pointer hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-gray-400 whitespace-nowrap w-44">
                      {fmt(log.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={actionBadge(log.action)}>{log.action}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">
                      <span className="font-medium">{log.resourceType}</span>
                      {log.resourceId && (
                        <span className="text-gray-400"> / {shortId(log.resourceId)}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">
                      {log.actorEmail ?? shortId(log.actorId)}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">{log.ipAddress ?? "—"}</td>
                  </tr>

                  {expandedId === log.id && (
                    <tr key={`${log.id}-detail`} className="bg-gray-50">
                      <td colSpan={5} className="px-4 pb-4 pt-2">
                        <pre className="bg-white border border-gray-200 rounded-lg p-4 text-xs text-gray-700 overflow-x-auto whitespace-pre-wrap">
                          {JSON.stringify(
                            { before: log.before, after: log.after, metadata: log.metadata },
                            null,
                            2
                          )}
                        </pre>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {total > 0 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-xs text-gray-400">
            Showing {from}–{to} of {total}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              Prev
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
