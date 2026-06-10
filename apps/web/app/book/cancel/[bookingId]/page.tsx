"use client";

import { use, useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc/client";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDateTime(iso: Date | string, tz: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    weekday: "long",
    month:   "long",
    day:     "numeric",
    year:    "numeric",
    hour:    "numeric",
    minute:  "2-digit",
    timeZone: tz,
  });
}

function fmtTime(iso: Date | string, tz: string) {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit", timeZone: tz,
  });
}

// ─── Status pill ──────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  confirmed:   "bg-green-100 text-green-700",
  pending:     "bg-yellow-100 text-yellow-700",
  cancelled:   "bg-red-100 text-red-600",
  completed:   "bg-blue-100 text-blue-700",
  no_show:     "bg-gray-100 text-gray-600",
  rescheduled: "bg-purple-100 text-purple-700",
};

function StatusPill({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${STATUS_STYLES[status] ?? "bg-gray-100 text-gray-600"}`}>
      {status.replace("_", " ")}
    </span>
  );
}

// ─── Step 1: email form ───────────────────────────────────────────────────────

function EmailVerifyForm({
  bookingId,
  onVerified,
}: {
  bookingId: string;
  onVerified: (email: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  const query = trpc.bookings.getByCustomer.useQuery(
    { bookingId, customerEmail: email },
    {
      enabled:    false,
      retry:      false,
      gcTime:     0,
    }
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const result = await query.refetch();
      if (result.error) {
        setError("No booking found with that email address.");
      } else if (result.data) {
        onVerified(email);
      }
    } catch {
      setError("No booking found with that email address.");
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 max-w-sm w-full">
        <h1 className="text-xl font-bold text-gray-900 mb-1">Cancel appointment</h1>
        <p className="text-sm text-gray-500 mb-6">
          Enter the email address used when booking to verify your identity.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email address</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          <button
            type="submit"
            disabled={query.isRefetching || !email}
            className="w-full py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 rounded-lg transition-colors"
          >
            {query.isRefetching ? "Verifying…" : "Continue"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Step 2: booking details + confirm cancel ─────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BookingInfo = Record<string, any> & {
  id: string;
  status: string;
  customerName: string;
  customerEmail: string;
  startsAt: Date | string;
  endsAt: Date | string;
  timezone: string;
  businessName: string;
  serviceName: string;
  staffName: string;
  serviceColor: string;
};

function CancelConfirmStep({
  booking,
  customerEmail,
  onCancelled,
}: {
  booking: BookingInfo;
  customerEmail: string;
  onCancelled: () => void;
}) {
  const [reason, setReason]   = useState("");
  const [error, setError]     = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  const cancel = trpc.bookings.cancelByCustomer.useMutation({
    onSuccess: onCancelled,
    onError:   (err) => setError(err.message),
  });

  const canCancel = ["confirmed", "pending"].includes(booking.status);
  const isPast    = new Date() >= new Date(booking.startsAt);

  function handleCancel() {
    setError(null);
    cancel.mutate({ bookingId: booking.id, customerEmail, reason: reason.trim() || undefined });
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 max-w-md w-full space-y-6">
        {/* Header */}
        <div>
          <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide mb-1">
            {booking.businessName}
          </p>
          <h1 className="text-xl font-bold text-gray-900">Cancel appointment</h1>
        </div>

        {/* Booking card */}
        <div className="bg-gray-50 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ background: booking.serviceColor }}
              />
              <span className="text-sm font-semibold text-gray-900">{booking.serviceName}</span>
            </div>
            <StatusPill status={booking.status} />
          </div>

          <div className="space-y-1 text-sm text-gray-600">
            <p>
              <span className="font-medium text-gray-800">{fmtDateTime(booking.startsAt, booking.timezone)}</span>
              {" – "}
              {fmtTime(booking.endsAt, booking.timezone)}
            </p>
            <p>With {booking.staffName}</p>
          </div>

          <p className="text-xs text-gray-400">
            Ref: {booking.id.slice(0, 8).toUpperCase()}
          </p>
        </div>

        {/* Already cancelled or past */}
        {!canCancel && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
            {booking.status === "cancelled"
              ? "This booking has already been cancelled."
              : booking.status === "completed"
              ? "This appointment has already been completed."
              : `This booking has status "${booking.status}" and cannot be cancelled online.`}
          </div>
        )}

        {canCancel && isPast && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
            This appointment has already started or passed. Please contact us directly to make changes.
          </div>
        )}

        {/* Cancel form */}
        {canCancel && !isPast && !confirm && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reason for cancellation <span className="text-gray-400">(optional)</span>
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                maxLength={500}
                placeholder="e.g. Schedule conflict"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              onClick={() => setConfirm(true)}
              className="w-full py-2.5 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
            >
              Cancel appointment
            </button>
          </div>
        )}

        {/* Confirm step */}
        {canCancel && !isPast && confirm && (
          <div className="space-y-4">
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-800">
              Are you sure you want to cancel this appointment? This cannot be undone.
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex gap-3">
              <button
                onClick={() => setConfirm(false)}
                disabled={cancel.isPending}
                className="flex-1 py-2.5 text-sm font-semibold text-gray-700 border border-gray-300 hover:bg-gray-50 disabled:opacity-50 rounded-lg transition-colors"
              >
                Go back
              </button>
              <button
                onClick={handleCancel}
                disabled={cancel.isPending}
                className="flex-1 py-2.5 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:bg-red-300 rounded-lg transition-colors"
              >
                {cancel.isPending ? "Cancelling…" : "Confirm cancel"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Step 3: success ──────────────────────────────────────────────────────────

function CancelledSuccessView() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 max-w-sm w-full text-center space-y-4">
        <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto">
          <svg className="w-7 h-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Appointment cancelled</h1>
          <p className="text-sm text-gray-500 mt-1">
            Your appointment has been cancelled. You should receive a confirmation email shortly.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

type Step = "email" | "confirm" | "done";

export default function CancelBookingPage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId } = use(params);

  const [step, setStep]           = useState<Step>("email");
  const [verifiedEmail, setEmail] = useState("");

  const fetchBooking = trpc.bookings.getByCustomer.useQuery(
    { bookingId, customerEmail: verifiedEmail },
    { enabled: !!verifiedEmail && step !== "done", retry: false }
  );

  function handleVerified(email: string) {
    setEmail(email);
    // Data is already cached from the refetch in EmailVerifyForm
  }

  if (step === "done") return <CancelledSuccessView />;

  if (step === "email" && !verifiedEmail) {
    return (
      <EmailVerifyForm
        bookingId={bookingId}
        onVerified={(email) => {
          setEmail(email);
          setStep("confirm");
        }}
      />
    );
  }

  if (step === "confirm" && verifiedEmail) {
    if (fetchBooking.isLoading) {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="w-8 h-8 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin" />
        </div>
      );
    }

    if (!fetchBooking.data) {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 max-w-sm w-full text-center">
            <p className="text-sm text-gray-500">Booking not found. Please check the link in your confirmation email.</p>
          </div>
        </div>
      );
    }

    return (
      <CancelConfirmStep
        booking={fetchBooking.data as BookingInfo}
        customerEmail={verifiedEmail}
        onCancelled={() => setStep("done")}
      />
    );
  }

  return null;
}
