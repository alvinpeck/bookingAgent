"use client";

import { trpc } from "@/lib/trpc/client";

// ─── Types ────────────────────────────────────────────────────────────────────

type MetricInfo = {
  used: number;
  limit: number | null;
  pct: number | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const METRIC_LABELS: Record<string, string> = {
  ai_tokens: "AI Tokens",
  bookings: "Bookings",
  whatsapp_messages: "WhatsApp Messages",
  telegram_messages: "Telegram Messages",
  email_reminders: "Email Reminders",
  sms_reminders: "SMS Reminders",
  staff_seats: "Staff Seats",
};

const PLAN_COLORS: Record<string, string> = {
  starter: "bg-gray-100 text-gray-700",
  growth: "bg-indigo-100 text-indigo-700",
  enterprise: "bg-amber-100 text-amber-700",
};

function fmtNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function fmtPeriod(p: string): string {
  const [year, month] = p.split("-");
  const d = new Date(Number(year), Number(month) - 1, 1);
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ pct }: { pct: number }) {
  const clamped = Math.min(pct, 100);
  const color =
    pct >= 100
      ? "bg-red-500"
      : pct >= 80
      ? "bg-yellow-400"
      : "bg-indigo-500";

  return (
    <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${color}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

// ─── Metric card ──────────────────────────────────────────────────────────────

function MetricCard({
  metric,
  info,
}: {
  metric: string;
  info: MetricInfo;
}) {
  const label = METRIC_LABELS[metric] ?? metric;
  const hasLimit = info.limit !== null;
  const isOver = (info.pct ?? 0) >= 100;
  const isWarning = !isOver && (info.pct ?? 0) >= 80;

  return (
    <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        {isOver && (
          <span className="text-xs font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
            Over limit
          </span>
        )}
        {isWarning && (
          <span className="text-xs font-semibold text-yellow-700 bg-yellow-50 px-2 py-0.5 rounded-full">
            Near limit
          </span>
        )}
      </div>

      <div className="flex items-baseline gap-1 mb-2">
        <span className="text-2xl font-semibold text-gray-900">
          {fmtNumber(info.used)}
        </span>
        {hasLimit && info.limit !== null && (
          <span className="text-sm text-gray-400">
            / {fmtNumber(info.limit)}
          </span>
        )}
        {!hasLimit && (
          <span className="text-sm text-gray-400">used</span>
        )}
      </div>

      {hasLimit && info.pct !== null ? (
        <>
          <ProgressBar pct={info.pct} />
          <p className="mt-1 text-xs text-gray-400">{info.pct.toFixed(1)}% used</p>
        </>
      ) : (
        <div className="h-2 w-full rounded-full bg-gray-50 border border-dashed border-gray-200" />
      )}
    </div>
  );
}

// ─── History table ────────────────────────────────────────────────────────────

type HistoryRow = {
  period: string;
  usage: Partial<Record<string, number>>;
};

const HISTORY_METRICS = [
  "ai_tokens",
  "bookings",
  "whatsapp_messages",
  "telegram_messages",
];

function HistoryTable({ rows }: { rows: HistoryRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-gray-400 py-4 text-center">No history yet.</p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="text-left py-2 pr-4 font-medium text-gray-500 whitespace-nowrap">
              Period
            </th>
            {HISTORY_METRICS.map((m) => (
              <th
                key={m}
                className="text-right py-2 px-3 font-medium text-gray-500 whitespace-nowrap"
              >
                {METRIC_LABELS[m] ?? m}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.period}
              className="border-b border-gray-50 hover:bg-gray-50 transition-colors"
            >
              <td className="py-2 pr-4 text-gray-700 font-medium whitespace-nowrap">
                {fmtPeriod(row.period)}
              </td>
              {HISTORY_METRICS.map((m) => (
                <td key={m} className="py-2 px-3 text-right text-gray-600">
                  {fmtNumber(row.usage[m] ?? 0)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function UsagePage() {
  const { data: usage, isLoading: usageLoading } =
    trpc.billing.getUsage.useQuery();

  const { data: history, isLoading: historyLoading } =
    trpc.billing.getHistory.useQuery({ months: 3 });

  const METRIC_ORDER: Array<keyof typeof METRIC_LABELS> = [
    "ai_tokens",
    "bookings",
    "staff_seats",
    "whatsapp_messages",
    "telegram_messages",
    "email_reminders",
    "sms_reminders",
  ];

  return (
    <div>
      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Usage</h1>
          <p className="mt-1 text-sm text-gray-500">
            {usage ? `Period: ${fmtPeriod(usage.period)}` : "Current billing period"}
          </p>
        </div>

        {usage && (
          <span
            className={`inline-block px-3 py-1 rounded-full text-sm font-semibold capitalize ${
              PLAN_COLORS[usage.plan] ?? "bg-gray-100 text-gray-700"
            }`}
          >
            {usage.plan} plan
          </span>
        )}
      </div>

      {/* Metric cards */}
      {usageLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-8">
          {Array.from({ length: 7 }).map((_, i) => (
            <div
              key={i}
              className="bg-white rounded-xl border border-gray-200 px-5 py-4 animate-pulse"
            >
              <div className="h-4 bg-gray-100 rounded w-1/2 mb-3" />
              <div className="h-7 bg-gray-100 rounded w-1/3 mb-3" />
              <div className="h-2 bg-gray-100 rounded w-full" />
            </div>
          ))}
        </div>
      ) : usage ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-8">
          {METRIC_ORDER.map((metric) => {
            const info = usage.metrics[metric as keyof typeof usage.metrics];
            if (!info) return null;
            return (
              <MetricCard
                key={metric}
                metric={metric}
                info={info as MetricInfo}
              />
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-gray-400 mb-8">Failed to load usage data.</p>
      )}

      {/* Quota legend */}
      {usage && (
        <div className="flex items-center gap-4 mb-8 text-xs text-gray-500">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-2 rounded-full bg-indigo-500" />
            Normal
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-2 rounded-full bg-yellow-400" />
            Near limit (80%+)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-2 rounded-full bg-red-500" />
            Over limit
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-2 rounded-full bg-gray-100 border border-dashed border-gray-300" />
            No limit
          </span>
        </div>
      )}

      {/* History table */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">
          Usage history — last 3 months
        </h2>

        {historyLoading ? (
          <div className="space-y-2 animate-pulse">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-8 bg-gray-100 rounded" />
            ))}
          </div>
        ) : history ? (
          <HistoryTable rows={history} />
        ) : (
          <p className="text-sm text-gray-400">Failed to load history.</p>
        )}
      </div>
    </div>
  );
}
