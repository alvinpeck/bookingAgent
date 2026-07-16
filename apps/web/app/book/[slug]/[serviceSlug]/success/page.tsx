"use client";

import { use } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { trpc } from "@/lib/trpc/client";

function fmtDate(d: string | Date) {
  return new Date(d).toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

function fmtTime(d: string | Date) {
  return new Date(d).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export default function PaymentSuccessPage({
  params,
}: {
  params: Promise<{ slug: string; serviceSlug: string }>;
}) {
  const { slug } = use(params);
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id") ?? "";

  const { data: booking, isLoading, error } =
    trpc.bookings.getPublicByCheckoutSession.useQuery(
      { sessionId },
      { enabled: !!sessionId, retry: 5, retryDelay: 1500 }
    );

  if (!sessionId) {
    return <ErrorState slug={slug} message="No session ID found." />;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-gray-500">Confirming your booking…</p>
        </div>
      </div>
    );
  }

  if (error || !booking) {
    return <ErrorState slug={slug} message="We couldn't find your booking. Your payment was received — check your email for confirmation." />;
  }

  const isPaid = booking.paymentStatus === "paid";

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${isPaid ? "bg-green-100" : "bg-yellow-100"}`}>
          <span className={`text-2xl ${isPaid ? "text-green-600" : "text-yellow-600"}`}>
            {isPaid ? "✓" : "⏳"}
          </span>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-1">
          {isPaid ? "Booking confirmed!" : "Payment received"}
        </h1>
        <p className="text-sm text-gray-500 mb-8">
          {isPaid
            ? `A confirmation has been sent to ${booking.customerEmail}`
            : "Your payment is being processed. You'll receive a confirmation email shortly."}
        </p>

        <div className="bg-white rounded-xl border border-gray-200 px-6 py-5 text-left space-y-3 mb-8">
          <div>
            <p className="text-xs text-gray-400">Customer</p>
            <p className="text-sm font-medium text-gray-900">{booking.customerName}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Date & time</p>
            <p className="text-sm font-medium text-gray-900">
              {fmtDate(booking.startsAt)} · {fmtTime(booking.startsAt)} – {fmtTime(booking.endsAt)}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Payment</p>
            <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${
              isPaid ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
            }`}>
              {isPaid ? "Paid" : "Processing"}
            </span>
          </div>
        </div>

        <Link
          href={`/book/${slug}`}
          className="text-sm text-indigo-600 hover:underline"
        >
          Book another appointment
        </Link>
      </div>

      <p className="text-center text-xs text-gray-300 pb-8">Powered by BookingAgent</p>
    </div>
  );
}

function ErrorState({ slug, message }: { slug: string; message: string }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center max-w-sm mx-auto px-4">
        <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-2xl text-yellow-600">!</span>
        </div>
        <h1 className="text-lg font-semibold text-gray-900 mb-2">Almost there</h1>
        <p className="text-sm text-gray-500 mb-6">{message}</p>
        <Link href={`/book/${slug}`} className="text-sm text-indigo-600 hover:underline">
          Back to booking
        </Link>
      </div>
    </div>
  );
}
