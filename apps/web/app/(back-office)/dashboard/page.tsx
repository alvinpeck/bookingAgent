"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc/client";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTime(iso: string, tz?: string) {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour:     "numeric",
    minute:   "2-digit",
    timeZone: tz,
  });
}

function fmtDateShort(iso: string, tz?: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "short",
    month:   "short",
    day:     "numeric",
    timeZone: tz,
  });
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  valueColor = "text-gray-900",
}: {
  label:       string;
  value:       number | string;
  sub?:        string;
  valueColor?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">{label}</p>
      <p className={`text-3xl font-bold ${valueColor}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

// ─── Plan badge ───────────────────────────────────────────────────────────────

function PlanBadge({ plan }: { plan: string }) {
  const map: Record<string, string> = {
    starter:    "bg-gray-100 text-gray-600",
    growth:     "bg-indigo-100 text-indigo-700",
    enterprise: "bg-amber-100 text-amber-700",
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${map[plan] ?? map["starter"]!}`}>
      {plan}
    </span>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function CardSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 animate-pulse">
      <div className="h-3 w-20 bg-gray-200 rounded mb-3" />
      <div className="h-8 w-12 bg-gray-100 rounded" />
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { data: stats,  isLoading: statsLoading  } = trpc.bookings.getStats.useQuery();
  const { data: usage,  isLoading: usageLoading  } = trpc.billing.getUsage.useQuery();
  const { data: tenant }                            = trpc.tenant.getCurrent.useQuery();

  const tz = (tenant as any)?.timezone ?? "UTC";

  const plan         = usage?.plan ?? "starter";
  const bookingPct   = usage?.metrics?.bookings?.pct   ?? null;
  const bookingUsed  = usage?.metrics?.bookings?.used  ?? 0;
  const bookingLimit = usage?.metrics?.bookings?.limit ?? null;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {new Date().toLocaleDateString("en-US", {
              weekday: "long", year: "numeric", month: "long", day: "numeric",
              timeZone: tz,
            })}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <PlanBadge plan={plan} />
          {tenant?.slug && (
            <a
              href={`/book/${tenant.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 text-sm font-medium text-indigo-600 border border-indigo-300 rounded-lg hover:bg-indigo-50 transition-colors flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              Booking page
            </a>
          )}
          <Link
            href="/bookings"
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            + New booking
          </Link>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {statsLoading ? (
          <><CardSkeleton /><CardSkeleton /><CardSkeleton /></>
        ) : (
          <>
            <StatCard
              label="Today's bookings"
              value={stats?.todayCount ?? 0}
              sub="confirmed & pending"
              valueColor="text-indigo-600"
            />
            <StatCard
              label="This month"
              value={stats?.monthCount ?? 0}
              sub={bookingLimit ? `of ${bookingLimit} quota` : "no monthly cap"}
              valueColor="text-green-600"
            />
            <StatCard
              label="Awaiting confirmation"
              value={stats?.pendingCount ?? 0}
              sub={stats?.pendingCount ? "requires action" : "all clear"}
              valueColor={(stats?.pendingCount ?? 0) > 0 ? "text-amber-600" : "text-gray-400"}
            />
          </>
        )}
      </div>

      {/* Quota progress bar */}
      {!usageLoading && bookingLimit !== null && (
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Monthly booking quota
            </p>
            <span className={`text-xs font-semibold ${
              bookingPct !== null && bookingPct >= 90 ? "text-red-600" : "text-gray-500"
            }`}>
              {bookingUsed} / {bookingLimit}
              {bookingPct !== null && ` (${bookingPct}%)`}
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                bookingPct !== null && bookingPct >= 100 ? "bg-red-500" :
                bookingPct !== null && bookingPct >= 80  ? "bg-amber-400" :
                "bg-indigo-500"
              }`}
              style={{ width: `${Math.min(bookingPct ?? 0, 100)}%` }}
            />
          </div>
          {bookingPct !== null && bookingPct >= 80 && (
            <p className="text-xs text-amber-700 mt-2">
              You&apos;re approaching your plan limit.{" "}
              <Link href="/billing" className="underline hover:text-amber-900">
                Upgrade your plan
              </Link>{" "}
              for more capacity.
            </p>
          )}
        </div>
      )}

      {/* Upcoming bookings */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-900">Upcoming (next 7 days)</h2>
          <Link href="/bookings" className="text-xs text-indigo-600 hover:underline">
            View all →
          </Link>
        </div>

        {statsLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-white rounded-xl border border-gray-200 animate-pulse" />
            ))}
          </div>
        ) : !stats?.upcoming?.length ? (
          <div className="bg-white rounded-xl border border-dashed border-gray-300 px-6 py-10 text-center">
            <p className="text-sm text-gray-400">No confirmed bookings in the next 7 days.</p>
            <Link href="/bookings" className="mt-2 inline-block text-sm text-indigo-600 hover:underline">
              View all bookings
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {stats.upcoming.map((b) => (
              <Link
                key={b.id}
                href={`/bookings/${b.id}`}
                className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center gap-4 hover:border-indigo-300 hover:shadow-sm transition-all"
              >
                {/* Service colour dot */}
                <div
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: (b as any).service?.colorHex ?? "#6366f1" }}
                />
                {/* Date & time */}
                <div className="w-28 shrink-0">
                  <p className="text-xs font-semibold text-gray-900">
                    {fmtTime(String(b.startsAt), tz)}
                  </p>
                  <p className="text-xs text-gray-400">
                    {fmtDateShort(String(b.startsAt), tz)}
                  </p>
                </div>
                {/* Service + staff */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {(b as any).service?.name ?? "—"}
                  </p>
                  <p className="text-xs text-gray-400 truncate">
                    {(b as any).staff?.displayName ?? "—"}
                  </p>
                </div>
                {/* Customer */}
                <div className="text-right shrink-0">
                  <p className="text-sm text-gray-700 truncate max-w-[140px]">{b.customerName}</p>
                  <p className="text-xs text-gray-400 truncate max-w-[140px]">{b.customerEmail}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Quick nav */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { href: "/services",     label: "Services",     desc: "Manage your offerings" },
          { href: "/staff",        label: "Staff",        desc: "Team & schedules" },
          { href: "/availability", label: "Availability", desc: "Set working hours" },
          { href: "/channels",     label: "Channels",     desc: "WhatsApp & Telegram" },
        ].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="bg-white rounded-xl border border-gray-200 px-4 py-3 hover:border-indigo-300 hover:shadow-sm transition-all"
          >
            <p className="text-sm font-medium text-gray-900">{item.label}</p>
            <p className="text-xs text-gray-400 mt-0.5">{item.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
