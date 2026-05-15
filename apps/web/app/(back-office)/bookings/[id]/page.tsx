"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/lib/trpc/client";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDateTime(iso: string | Date) {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short", month: "short", day: "numeric",
    year: "numeric", hour: "numeric", minute: "2-digit",
  });
}

function fmtDate(iso: string | Date) {
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
}

function fmtTime(iso: string | Date) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  confirmed:   "bg-green-100 text-green-700",
  pending:     "bg-yellow-100 text-yellow-700",
  completed:   "bg-blue-100 text-blue-700",
  cancelled:   "bg-red-100 text-red-700",
  no_show:     "bg-gray-100 text-gray-600",
  rescheduled: "bg-purple-100 text-purple-700",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${STATUS_STYLES[status] ?? STATUS_STYLES["pending"]!}`}>
      {status.replace("_", " ")}
    </span>
  );
}

// ─── Channel badge ────────────────────────────────────────────────────────────

const CHANNEL_LABEL: Record<string, string> = {
  web:         "Web",
  back_office: "Back office",
  whatsapp:    "WhatsApp",
  telegram:    "Telegram",
};

// ─── Info row ─────────────────────────────────────────────────────────────────

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4 py-2.5 border-b border-gray-100 last:border-0">
      <span className="text-xs font-medium text-gray-400 uppercase tracking-wide w-28 shrink-0 pt-0.5">{label}</span>
      <span className="text-sm text-gray-900 flex-1">{children}</span>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function BookingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id }   = use(params);
  const router   = useRouter();
  const utils    = trpc.useUtils();

  const { data: booking, isLoading, error } = trpc.bookings.getById.useQuery({ id });

  const [cancelReason, setCancelReason] = useState("");
  const [note,         setNote]         = useState("");
  const [showCancel,   setShowCancel]   = useState(false);
  const [showNote,     setShowNote]     = useState(false);
  const [statusMsg,    setStatusMsg]    = useState("");

  const cancelMutation = trpc.bookings.cancel.useMutation({
    onSuccess: () => {
      utils.bookings.getById.invalidate({ id });
      utils.bookings.getStats.invalidate();
      setShowCancel(false);
      setCancelReason("");
    },
    onError: (err) => setStatusMsg(err.message),
  });

  const noteMutation = trpc.bookings.addNote.useMutation({
    onSuccess: () => {
      utils.bookings.getById.invalidate({ id });
      setShowNote(false);
      setNote("");
    },
    onError: (err) => setStatusMsg(err.message),
  });

  const confirmMutation = trpc.bookings.confirm.useMutation({
    onSuccess: () => utils.bookings.getById.invalidate({ id }),
    onError:   (err) => setStatusMsg(err.message),
  });

  const completeMutation = trpc.bookings.complete.useMutation({
    onSuccess: () => utils.bookings.getById.invalidate({ id }),
    onError:   (err) => setStatusMsg(err.message),
  });

  const noShowMutation = trpc.bookings.markNoShow.useMutation({
    onSuccess: () => utils.bookings.getById.invalidate({ id }),
    onError:   (err) => setStatusMsg(err.message),
  });

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-48 bg-gray-200 rounded" />
        <div className="h-48 bg-white rounded-xl border border-gray-200" />
      </div>
    );
  }

  if (error || !booking) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-400 text-sm mb-4">Booking not found.</p>
        <Link href="/bookings" className="text-indigo-600 text-sm hover:underline">← Back to bookings</Link>
      </div>
    );
  }

  const b = booking;
  const isPast      = new Date(b.startsAt) < new Date();
  const isActive    = b.status === "confirmed" || b.status === "pending";
  const isCancelled = b.status === "cancelled";
  const ref         = b.id.slice(0, 8).toUpperCase();

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Breadcrumb + header */}
      <div>
        <Link href="/bookings" className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 mb-3">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          All bookings
        </Link>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-bold text-gray-900">
            Booking <span className="text-gray-400 font-mono text-lg">#{ref}</span>
          </h1>
          <StatusBadge status={b.status} />
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
            {CHANNEL_LABEL[b.channel] ?? b.channel}
          </span>
        </div>
      </div>

      {/* Error message */}
      {statusMsg && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-700">
          {statusMsg}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-5">
        {/* Appointment details */}
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Appointment</h2>
          <InfoRow label="Service">
            <span className="flex items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: (b.service as any)?.colorHex ?? "#6366f1" }}
              />
              {(b.service as any)?.name ?? "—"}
            </span>
          </InfoRow>
          <InfoRow label="Staff">{(b.staff as any)?.displayName ?? "—"}</InfoRow>
          <InfoRow label="Date">{fmtDate(b.startsAt)}</InfoRow>
          <InfoRow label="Time">
            {fmtTime(b.startsAt)} – {fmtTime(b.endsAt)}
          </InfoRow>
          <InfoRow label="Created">{fmtDateTime(b.createdAt)}</InfoRow>
        </div>

        {/* Customer details */}
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Customer</h2>
          <InfoRow label="Name">{b.customerName}</InfoRow>
          <InfoRow label="Email">
            <a href={`mailto:${b.customerEmail}`} className="text-indigo-600 hover:underline">
              {b.customerEmail}
            </a>
          </InfoRow>
          {b.customerPhone && (
            <InfoRow label="Phone">
              <a href={`tel:${b.customerPhone}`} className="text-indigo-600 hover:underline">
                {b.customerPhone}
              </a>
            </InfoRow>
          )}
          {b.customerNotes && (
            <InfoRow label="Notes">
              <span className="text-gray-600 italic">{b.customerNotes}</span>
            </InfoRow>
          )}
        </div>
      </div>

      {/* Internal note */}
      {b.internalNote && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-5 py-3">
          <p className="text-xs font-semibold text-yellow-700 mb-1">Internal note</p>
          <p className="text-sm text-yellow-900">{b.internalNote}</p>
        </div>
      )}

      {/* Actions */}
      {!isCancelled && (
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Actions</h2>
          <div className="flex flex-wrap gap-2">
            {b.status === "pending" && (
              <button
                onClick={() => confirmMutation.mutate({ id })}
                disabled={confirmMutation.isPending}
                className="px-3 py-1.5 text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded-lg transition-colors"
              >
                {confirmMutation.isPending ? "Confirming…" : "Confirm booking"}
              </button>
            )}
            {b.status === "confirmed" && isPast && (
              <>
                <button
                  onClick={() => completeMutation.mutate({ id })}
                  disabled={completeMutation.isPending}
                  className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors"
                >
                  {completeMutation.isPending ? "Saving…" : "Mark completed"}
                </button>
                <button
                  onClick={() => noShowMutation.mutate({ id })}
                  disabled={noShowMutation.isPending}
                  className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 rounded-lg transition-colors"
                >
                  {noShowMutation.isPending ? "Saving…" : "Mark no-show"}
                </button>
              </>
            )}
            <button
              onClick={() => { setShowNote((v) => !v); setStatusMsg(""); }}
              className="px-3 py-1.5 text-sm font-medium text-indigo-600 border border-indigo-300 hover:bg-indigo-50 rounded-lg transition-colors"
            >
              {showNote ? "Cancel" : "Add note"}
            </button>
            {isActive && (
              <button
                onClick={() => { setShowCancel((v) => !v); setStatusMsg(""); }}
                className="px-3 py-1.5 text-sm font-medium text-red-600 border border-red-300 hover:bg-red-50 rounded-lg transition-colors"
              >
                {showCancel ? "Cancel" : "Cancel booking"}
              </button>
            )}
          </div>

          {/* Add note panel */}
          {showNote && (
            <div className="mt-4 space-y-2">
              <textarea
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Add an internal note visible only to staff…"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              />
              <button
                onClick={() => noteMutation.mutate({ id, note })}
                disabled={!note.trim() || noteMutation.isPending}
                className="px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 rounded-lg transition-colors"
              >
                {noteMutation.isPending ? "Saving…" : "Save note"}
              </button>
            </div>
          )}

          {/* Cancel panel */}
          {showCancel && (
            <div className="mt-4 space-y-2">
              <p className="text-sm text-gray-600">
                This will cancel the booking and send a cancellation email to the customer.
              </p>
              <input
                type="text"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Reason (optional)"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
              />
              <button
                onClick={() => cancelMutation.mutate({ id, reason: cancelReason || undefined })}
                disabled={cancelMutation.isPending}
                className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg transition-colors"
              >
                {cancelMutation.isPending ? "Cancelling…" : "Confirm cancellation"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Status history timeline */}
      {(b.statusHistory as any[])?.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">History</h2>
          <div className="space-y-3">
            {(b.statusHistory as any[]).map((h, i) => (
              <div key={h.id} className="flex items-start gap-3">
                <div className="relative flex flex-col items-center">
                  <div className={`w-2.5 h-2.5 rounded-full mt-0.5 shrink-0 ${STATUS_STYLES[h.toStatus]?.split(" ")[0] ?? "bg-gray-200"}`} />
                  {i < (b.statusHistory as any[]).length - 1 && (
                    <div className="w-px flex-1 bg-gray-200 mt-1 min-h-[16px]" />
                  )}
                </div>
                <div className="flex-1 pb-2">
                  <p className="text-sm text-gray-800 capitalize">
                    {h.fromStatus ? (
                      <><span className="text-gray-400">{h.fromStatus.replace("_"," ")}</span> → <strong>{h.toStatus.replace("_"," ")}</strong></>
                    ) : (
                      <strong>Created as {h.toStatus.replace("_"," ")}</strong>
                    )}
                  </p>
                  {h.reason && <p className="text-xs text-gray-500 mt-0.5 italic">{h.reason}</p>}
                  <p className="text-xs text-gray-400 mt-0.5">{fmtDateTime(h.createdAt)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
