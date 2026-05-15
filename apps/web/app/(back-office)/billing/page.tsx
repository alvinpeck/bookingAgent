"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";

// ─── Plan definitions ─────────────────────────────────────────────────────────

const PLANS = [
  {
    id:    "starter" as const,
    name:  "Starter",
    price: "Free",
    desc:  "For small businesses getting started",
    features: [
      "200 bookings / month",
      "3 staff seats",
      "10 services",
      "1 channel",
      "Email reminders",
    ],
    color: "border-gray-200",
    badge: "bg-gray-100 text-gray-600",
  },
  {
    id:    "growth" as const,
    name:  "Growth",
    price: "$49 / mo",
    desc:  "For growing teams with higher volume",
    features: [
      "2,000 bookings / month",
      "15 staff seats",
      "50 services",
      "3 channels",
      "AI booking assistant",
      "Priority support",
    ],
    color: "border-indigo-400",
    badge: "bg-indigo-100 text-indigo-700",
    highlight: true,
  },
  {
    id:    "enterprise" as const,
    name:  "Enterprise",
    price: "$199 / mo",
    desc:  "Unlimited scale, dedicated infrastructure",
    features: [
      "Unlimited bookings",
      "Unlimited staff",
      "Unlimited services",
      "Unlimited channels",
      "AI booking assistant",
      "Dedicated support",
      "Custom integrations",
    ],
    color: "border-amber-400",
    badge: "bg-amber-100 text-amber-700",
  },
];

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active:     "bg-green-100 text-green-700",
    delinquent: "bg-red-100 text-red-700",
    suspended:  "bg-yellow-100 text-yellow-700",
    cancelled:  "bg-gray-100 text-gray-500",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${map[status] ?? map["active"]}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

// ─── Check icon ───────────────────────────────────────────────────────────────

function CheckIcon() {
  return (
    <svg className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const router                = useRouter();
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const { data: sub, isLoading } = trpc.billing.getSubscription.useQuery();

  const createCheckout = trpc.billing.createCheckoutSession.useMutation({
    onSuccess: ({ url }) => {
      window.location.href = url;
    },
    onError: (err) => {
      setError(err.message);
      setLoadingPlan(null);
    },
  });

  const createPortal = trpc.billing.createPortalSession.useMutation({
    onSuccess: ({ url }) => {
      window.location.href = url;
    },
    onError: (err) => {
      setError(err.message);
      setPortalLoading(false);
    },
  });

  function handleUpgrade(planId: "growth" | "enterprise") {
    setError(null);
    setLoadingPlan(planId);
    const base = window.location.origin;
    createCheckout.mutate({
      plan:       planId,
      successUrl: `${base}/billing?success=1`,
      cancelUrl:  `${base}/billing`,
    });
  }

  function handlePortal() {
    setError(null);
    setPortalLoading(true);
    createPortal.mutate({ returnUrl: `${window.location.origin}/billing` });
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="w-8 h-8 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin" />
      </div>
    );
  }

  const currentPlan = sub?.plan ?? "starter";
  const isActive    = sub?.status === "active";

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Billing & Plans</h1>
        <p className="mt-1 text-sm text-gray-500">Manage your subscription and usage limits.</p>
      </div>

      {/* Success banner */}
      {typeof window !== "undefined" && new URLSearchParams(window.location.search).get("success") === "1" && (
        <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-800">
          Your subscription has been updated successfully!
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Current plan summary */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">Current plan</p>
            <div className="flex items-center gap-3">
              <span className="text-2xl font-bold text-gray-900 capitalize">{currentPlan}</span>
              <StatusBadge status={sub?.status ?? "active"} />
            </div>
            {sub?.currentPeriodEnd && (
              <p className="text-xs text-gray-400 mt-1">
                Renews {new Date(sub.currentPeriodEnd).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
              </p>
            )}
            {sub?.subscription?.cancelAtPeriodEnd && (
              <p className="text-xs text-red-500 mt-1">
                Cancels at end of billing period
              </p>
            )}
          </div>

          <div className="flex gap-2">
            {/* Portal button — only show if they have a subscription */}
            {sub?.stripeSubscriptionId && (
              <button
                onClick={handlePortal}
                disabled={portalLoading}
                className="px-4 py-2 text-sm font-medium text-indigo-600 border border-indigo-300 rounded-lg hover:bg-indigo-50 transition-colors disabled:opacity-50"
              >
                {portalLoading ? "Loading…" : "Manage Subscription"}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Plan cards */}
      <div>
        <h2 className="text-base font-semibold text-gray-900 mb-4">Available plans</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PLANS.map((plan) => {
            const isCurrent = plan.id === currentPlan;
            const isUpgrade = plan.id !== "starter" && plan.id !== currentPlan;

            return (
              <div
                key={plan.id}
                className={`relative bg-white rounded-xl border-2 shadow-sm p-6 flex flex-col ${plan.color} ${plan.highlight ? "ring-2 ring-indigo-400 ring-offset-2" : ""}`}
              >
                {plan.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-indigo-600 text-white text-xs font-semibold px-3 py-1 rounded-full">
                      Most Popular
                    </span>
                  </div>
                )}

                <div className="mb-4">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-base font-bold text-gray-900">{plan.name}</h3>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${plan.badge}`}>
                      {isCurrent ? "Current" : plan.price}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">{plan.desc}</p>
                </div>

                <ul className="space-y-2 flex-1 mb-6">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-gray-700">
                      <CheckIcon />
                      {f}
                    </li>
                  ))}
                </ul>

                {isCurrent ? (
                  <div className="w-full py-2 text-center text-sm font-medium text-gray-400 border border-gray-200 rounded-lg bg-gray-50 cursor-default">
                    Current Plan
                  </div>
                ) : isUpgrade ? (
                  <button
                    onClick={() => handleUpgrade(plan.id as "growth" | "enterprise")}
                    disabled={!!loadingPlan || !isActive}
                    className="w-full py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 rounded-lg transition-colors"
                  >
                    {loadingPlan === plan.id ? "Redirecting…" : `Upgrade to ${plan.name}`}
                  </button>
                ) : (
                  /* Downgrade to starter — handled via portal */
                  <button
                    onClick={handlePortal}
                    disabled={portalLoading || !sub?.stripeSubscriptionId}
                    className="w-full py-2 text-sm font-medium text-gray-600 border border-gray-300 hover:bg-gray-50 disabled:opacity-50 rounded-lg transition-colors"
                  >
                    Downgrade
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Billing portal shortcut */}
      {sub?.stripeCustomerId && (
        <div className="bg-gray-50 rounded-xl border border-gray-200 px-6 py-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-gray-800">Payment details & invoices</p>
            <p className="text-xs text-gray-500 mt-0.5">Update your card, download invoices, or cancel your subscription via the Stripe portal.</p>
          </div>
          <button
            onClick={handlePortal}
            disabled={portalLoading}
            className="shrink-0 px-4 py-2 text-sm font-medium text-indigo-600 border border-indigo-300 rounded-lg hover:bg-indigo-50 transition-colors disabled:opacity-50"
          >
            {portalLoading ? "Loading…" : "Open Billing Portal"}
          </button>
        </div>
      )}
    </div>
  );
}
