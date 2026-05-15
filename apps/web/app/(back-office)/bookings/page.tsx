"use client";

import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc/client";

type Status = "pending" | "confirmed" | "completed" | "cancelled" | "no_show" | "rescheduled";
type Channel = "web" | "back_office" | "whatsapp" | "telegram";

const STATUS_BADGE: Record<Status, string> = {
  confirmed:   "bg-green-100 text-green-700",
  pending:     "bg-yellow-100 text-yellow-700",
  completed:   "bg-blue-100 text-blue-700",
  cancelled:   "bg-red-100 text-red-700",
  no_show:     "bg-gray-100 text-gray-600",
  rescheduled: "bg-purple-100 text-purple-700",
};

const CHANNEL_LABEL: Record<Channel, string> = {
  web:         "Web",
  back_office: "Back office",
  whatsapp:    "WhatsApp",
  telegram:    "Telegram",
};

const ALL_STATUSES: Status[] = ["pending", "confirmed", "completed", "cancelled", "no_show", "rescheduled"];
const PAGE_SIZE = 20;

function fmtRange(start: string, end: string) {
  const s = new Date(start);
  const e = new Date(end);
  const day = s.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  const t1 = s.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const t2 = e.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${day} · ${t1} – ${t2}`;
}

type ActionPanel = "note" | "cancel" | "reschedule" | null;

export default function BookingsPage() {
  const utils = trpc.useUtils();

  // Filters
  const [search, setSearch]           = useState("");
  const [debouncedSearch, setDebounced] = useState("");
  const [status, setStatus]           = useState<Status | "">("");
  const [from, setFrom]               = useState("");
  const [to, setTo]                   = useState("");
  const [page, setPage]               = useState(1);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setDebounced(search); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [status, from, to]);

  const { data, isLoading } = trpc.bookings.list.useQuery({
    page,
    pageSize: PAGE_SIZE,
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
    ...(status          ? { status }                  : {}),
    ...(from            ? { from }                    : {}),
    ...(to              ? { to }                      : {}),
  });

  type BookingRow = {
    id: string;
    status: Status;
    channel: Channel;
    startsAt: string;
    endsAt: string;
    customerName: string;
    customerEmail: string;
    customerPhone: string | null;
    notes: string | null;
    internalNote: string | null;
    service: { id: string; name: string; colorHex: string; durationMinutes: number };
    staff: { id: string; displayName: string } | null;
  };
  const bookings = (data?.data ?? []) as BookingRow[];
  const total    = data?.total ?? 0;
  const from_n   = (page - 1) * PAGE_SIZE + 1;
  const to_n     = Math.min(page * PAGE_SIZE, total);

  // Action panel state
  const [openRow,    setOpenRow]    = useState<string | null>(null);
  const [panelType,  setPanelType]  = useState<ActionPanel>(null);
  const [note,       setNote]       = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [newStart,   setNewStart]   = useState("");
  const [newEnd,     setNewEnd]     = useState("");
  const [rescheduleReason, setRescheduleReason] = useState("");

  function openPanel(id: string, type: ActionPanel, currentNote?: string) {
    if (openRow === id && panelType === type) { setOpenRow(null); setPanelType(null); return; }
    setOpenRow(id); setPanelType(type);
    setNote(currentNote ?? ""); setCancelReason(""); setNewStart(""); setNewEnd(""); setRescheduleReason("");
  }

  const noteMutation = trpc.bookings.addNote.useMutation({
    onSuccess: () => { utils.bookings.list.invalidate(); setOpenRow(null); },
  });
  const cancelMutation = trpc.bookings.cancel.useMutation({
    onSuccess: () => { utils.bookings.list.invalidate(); setOpenRow(null); },
  });
  const rescheduleMutation = trpc.bookings.reschedule.useMutation({
    onSuccess: () => { utils.bookings.list.invalidate(); setOpenRow(null); },
  });

  const inputCls = "border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Bookings</h1>
        <p className="mt-1 text-sm text-gray-500">View and manage all customer bookings.</p>
      </div>

      {/* Filter bar */}
      <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 mb-4 flex flex-wrap gap-3 items-center">
        <input
          type="search"
          placeholder="Search name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={`${inputCls} w-56`}
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as Status | "")}
          className={`${inputCls} capitalize`}
        >
          <option value="">All statuses</option>
          {ALL_STATUSES.map((s) => (
            <option key={s} value={s} className="capitalize">{s.replace("_", " ")}</option>
          ))}
        </select>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} />
        <span className="text-gray-400 text-sm">to</span>
        <input type="date" value={to}   onChange={(e) => setTo(e.target.value)}   className={inputCls} />
        {(search || status || from || to) && (
          <button
            onClick={() => { setSearch(""); setStatus(""); setFrom(""); setTo(""); }}
            className="text-xs text-gray-500 hover:text-red-500 px-2 py-1 rounded-md hover:bg-red-50 transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 h-16 animate-pulse" />
          ))}
        </div>
      ) : bookings.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-xl px-6 py-16 text-center">
          <div className="text-4xl mb-3">📭</div>
          <p className="text-gray-500 font-medium text-sm">No bookings found</p>
          <p className="text-gray-400 text-xs mt-1">Try adjusting your filters or search term.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {bookings.map((b) => {
            const isOpen = openRow === b.id;
            const mutable = b.status === "pending" || b.status === "confirmed";
            return (
              <div key={b.id} className="bg-white rounded-xl border border-gray-200">
                {/* Row */}
                <div className="flex items-center gap-3 px-5 py-3 flex-wrap">
                  {/* Service dot + name */}
                  <div className="flex items-center gap-2 w-44 shrink-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: b.service.colorHex }}
                    />
                    <span className="text-sm font-medium text-gray-800 truncate">{b.service.name}</span>
                  </div>

                  {/* Customer */}
                  <div className="flex-1 min-w-[140px]">
                    <p className="text-sm font-medium text-gray-900">{b.customerName}</p>
                    <p className="text-xs text-gray-400">{b.customerEmail}</p>
                  </div>

                  {/* Date/time */}
                  <div className="text-sm text-gray-600 min-w-[200px]">{fmtRange(b.startsAt, b.endsAt)}</div>

                  {/* Staff */}
                  <div className="text-sm text-gray-500 w-28 truncate">{b.staff.displayName}</div>

                  {/* Status badge */}
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_BADGE[b.status as Status] ?? "bg-gray-100 text-gray-500"}`}>
                    {b.status.replace("_", " ")}
                  </span>

                  {/* Channel badge */}
                  <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-400">
                    {CHANNEL_LABEL[b.channel as Channel] ?? b.channel}
                  </span>

                  {/* Actions toggle */}
                  <button
                    onClick={() => openPanel(b.id, isOpen ? null : "note", b.internalNote ?? "")}
                    className="ml-auto text-xs text-gray-500 hover:text-indigo-600 px-2 py-1 rounded-md hover:bg-indigo-50 transition-colors shrink-0"
                  >
                    {isOpen ? "Close" : "Actions"}
                  </button>
                </div>

                {/* Inline action panel */}
                {isOpen && (
                  <div className="border-t border-gray-100 px-5 py-4 bg-gray-50 rounded-b-xl">
                    {/* Tab buttons */}
                    <div className="flex gap-2 mb-4">
                      {(["note", ...(mutable ? ["cancel", "reschedule"] : [])] as ActionPanel[]).map((t) => (
                        <button
                          key={t}
                          onClick={() => setPanelType(t)}
                          className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                            panelType === t
                              ? "bg-indigo-600 text-white"
                              : "border border-gray-300 text-gray-600 hover:bg-gray-100"
                          }`}
                        >
                          {t === "note" ? "Add / Edit note" : t === "cancel" ? "Cancel" : "Reschedule"}
                        </button>
                      ))}
                    </div>

                    {/* Note panel */}
                    {panelType === "note" && (
                      <div className="flex flex-col gap-2 max-w-lg">
                        <textarea
                          rows={3}
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          placeholder="Internal note (not visible to customer)…"
                          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                        />
                        <button
                          onClick={() => noteMutation.mutate({ id: b.id, note })}
                          disabled={noteMutation.isPending}
                          className="self-start px-4 py-1.5 bg-indigo-600 text-white text-xs rounded-lg hover:bg-indigo-700 disabled:bg-indigo-300"
                        >
                          {noteMutation.isPending ? "Saving…" : "Save note"}
                        </button>
                      </div>
                    )}

                    {/* Cancel panel */}
                    {panelType === "cancel" && mutable && (
                      <div className="flex flex-col gap-2 max-w-lg">
                        <input
                          type="text"
                          value={cancelReason}
                          onChange={(e) => setCancelReason(e.target.value)}
                          placeholder="Reason (optional)"
                          className={`${inputCls} w-full`}
                        />
                        <button
                          onClick={() => cancelMutation.mutate({ id: b.id, ...(cancelReason ? { reason: cancelReason } : {}) })}
                          disabled={cancelMutation.isPending}
                          className="self-start px-4 py-1.5 bg-red-600 text-white text-xs rounded-lg hover:bg-red-700 disabled:bg-red-300"
                        >
                          {cancelMutation.isPending ? "Cancelling…" : "Confirm cancellation"}
                        </button>
                      </div>
                    )}

                    {/* Reschedule panel */}
                    {panelType === "reschedule" && mutable && (
                      <div className="flex flex-col gap-2 max-w-lg">
                        <div className="flex gap-3 flex-wrap">
                          <div className="flex flex-col gap-1">
                            <label className="text-xs text-gray-500">New start</label>
                            <input
                              type="datetime-local"
                              value={newStart}
                              onChange={(e) => setNewStart(e.target.value)}
                              className={inputCls}
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="text-xs text-gray-500">New end</label>
                            <input
                              type="datetime-local"
                              value={newEnd}
                              onChange={(e) => setNewEnd(e.target.value)}
                              className={inputCls}
                            />
                          </div>
                        </div>
                        <input
                          type="text"
                          value={rescheduleReason}
                          onChange={(e) => setRescheduleReason(e.target.value)}
                          placeholder="Reason (optional)"
                          className={`${inputCls} w-full`}
                        />
                        <button
                          onClick={() =>
                            rescheduleMutation.mutate({
                              id: b.id,
                              startsAt: new Date(newStart).toISOString(),
                              endsAt:   new Date(newEnd).toISOString(),
                              ...(rescheduleReason ? { reason: rescheduleReason } : {}),
                            })
                          }
                          disabled={rescheduleMutation.isPending || !newStart || !newEnd}
                          className="self-start px-4 py-1.5 bg-indigo-600 text-white text-xs rounded-lg hover:bg-indigo-700 disabled:bg-indigo-300"
                        >
                          {rescheduleMutation.isPending ? "Saving…" : "Save reschedule"}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {total > 0 && (
        <div className="mt-5 flex items-center justify-between text-sm text-gray-500">
          <span>Showing {from_n}–{to_n} of {total}</span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => p - 1)}
              disabled={page === 1}
              className="px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed text-xs"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={to_n >= total}
              className="px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed text-xs"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
