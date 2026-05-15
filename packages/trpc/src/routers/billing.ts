import { z } from "zod";
import { eq, and, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, manageBillingProcedure } from "../trpc";
import { usageMetering, tenants, PLAN_QUOTAS } from "@booking-agent/db";
import type { UsageMetric } from "@booking-agent/db";
import { getCurrentPeriod } from "../lib/usage";
import { stripe, PLAN_PRICE_IDS } from "../lib/stripe";

type MetricInfo = {
  used: number;
  limit: number | null;
  pct: number | null;
};

function buildMetricInfo(
  used: number,
  limit: number | null | undefined
): MetricInfo {
  const resolvedLimit =
    limit === undefined || limit === Infinity ? null : limit;
  const pct =
    resolvedLimit !== null && resolvedLimit > 0
      ? Math.round((used / resolvedLimit) * 1000) / 10
      : null;
  return { used, limit: resolvedLimit, pct };
}

export const billingRouter = router({
  /**
   * Get current month usage for all metrics + quota limits based on tenant plan.
   */
  getUsage: protectedProcedure.query(async ({ ctx }) => {
    const period = getCurrentPeriod();
    const plan = ctx.tenant.plan;
    const quotas = PLAN_QUOTAS[plan];

    const rows = await ctx.db.query.usageMetering.findMany({
      where: and(
        eq(usageMetering.tenantId, ctx.tenant.id),
        eq(usageMetering.periodMonth, period)
      ),
      columns: { metric: true, count: true },
    });

    const usageMap: Record<UsageMetric, number> = {
      bookings: 0,
      ai_tokens: 0,
      whatsapp_messages: 0,
      telegram_messages: 0,
      email_reminders: 0,
      sms_reminders: 0,
      staff_seats: 0,
    };

    for (const row of rows) {
      usageMap[row.metric] = row.count;
    }

    const metrics: Record<UsageMetric, MetricInfo> = {
      ai_tokens: buildMetricInfo(
        usageMap.ai_tokens,
        quotas.aiTokensPerMonth
      ),
      bookings: buildMetricInfo(
        usageMap.bookings,
        quotas.maxBookingsPerMonth
      ),
      whatsapp_messages: buildMetricInfo(usageMap.whatsapp_messages, null),
      telegram_messages: buildMetricInfo(usageMap.telegram_messages, null),
      email_reminders: buildMetricInfo(usageMap.email_reminders, null),
      sms_reminders: buildMetricInfo(usageMap.sms_reminders, null),
      staff_seats: buildMetricInfo(usageMap.staff_seats, quotas.maxStaffSeats),
    };

    return {
      period,
      plan,
      metrics,
    };
  }),

  /**
   * Get usage for the last N months, grouped by month.
   */
  getHistory: protectedProcedure
    .input(z.object({ months: z.number().min(1).max(12).default(3) }))
    .query(async ({ ctx, input }) => {
      // Build the list of YYYY-MM strings for the last N months
      const periods: string[] = [];
      const now = new Date();
      for (let i = 0; i < input.months; i++) {
        const d = new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)
        );
        const year = d.getUTCFullYear();
        const month = String(d.getUTCMonth() + 1).padStart(2, "0");
        periods.push(`${year}-${month}`);
      }

      const rows = await ctx.db.query.usageMetering.findMany({
        where: and(
          eq(usageMetering.tenantId, ctx.tenant.id),
          inArray(usageMetering.periodMonth, periods)
        ),
        columns: { metric: true, count: true, periodMonth: true },
      });

      // Group by period
      const grouped: Record<string, Partial<Record<UsageMetric, number>>> = {};
      for (const period of periods) {
        grouped[period] = {};
      }
      for (const row of rows) {
        if (!grouped[row.periodMonth]) grouped[row.periodMonth] = {};
        grouped[row.periodMonth]![row.metric] = row.count;
      }

      // Return sorted oldest-first
      return periods
        .slice()
        .reverse()
        .map((period) => ({
          period,
          usage: grouped[period] ?? {},
        }));
    }),

  /**
   * Get current subscription info from Stripe (or DB fallback).
   */
  getSubscription: manageBillingProcedure.query(async ({ ctx }) => {
    const tenant = await ctx.db.query.tenants.findFirst({
      where: eq(tenants.id, ctx.tenant.id),
      columns: {
        plan: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
        currentPeriodEnd: true,
        status: true,
      },
    });

    if (!tenant) throw new TRPCError({ code: "NOT_FOUND" });

    let subscription = null;
    if (tenant.stripeSubscriptionId) {
      try {
        const sub = await stripe.subscriptions.retrieve(tenant.stripeSubscriptionId);
        subscription = {
          status: sub.status,
          currentPeriodEnd: new Date((sub as any).current_period_end * 1000),
          cancelAtPeriodEnd: sub.cancel_at_period_end,
        };
      } catch {
        // Stripe unreachable or subscription not found — fall back to DB
      }
    }

    return {
      plan: tenant.plan,
      status: tenant.status,
      stripeCustomerId: tenant.stripeCustomerId,
      stripeSubscriptionId: tenant.stripeSubscriptionId,
      currentPeriodEnd: tenant.currentPeriodEnd,
      subscription,
    };
  }),

  /**
   * Create a Stripe Checkout Session for upgrading to a paid plan.
   * Returns a checkout URL the client redirects to.
   */
  createCheckoutSession: manageBillingProcedure
    .input(
      z.object({
        plan:       z.enum(["growth", "enterprise"]),
        successUrl: z.string().url(),
        cancelUrl:  z.string().url(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const priceId = PLAN_PRICE_IDS[input.plan];
      if (!priceId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `No Stripe price configured for plan "${input.plan}". Set STRIPE_PRICE_${input.plan.toUpperCase()} in your environment.`,
        });
      }

      // Ensure the tenant has a Stripe customer
      const tenant = await ctx.db.query.tenants.findFirst({
        where: eq(tenants.id, ctx.tenant.id),
        columns: { stripeCustomerId: true, name: true },
      });
      if (!tenant) throw new TRPCError({ code: "NOT_FOUND" });

      let customerId = tenant.stripeCustomerId;
      if (!customerId) {
        const customer = await stripe.customers.create({
          name:     tenant.name,
          metadata: { tenantId: ctx.tenant.id },
        });
        customerId = customer.id;
        await ctx.db
          .update(tenants)
          .set({ stripeCustomerId: customerId, updatedAt: new Date() } as any)
          .where(eq(tenants.id, ctx.tenant.id));
      }

      const session = await stripe.checkout.sessions.create({
        mode:               "subscription",
        customer:           customerId,
        line_items:         [{ price: priceId, quantity: 1 }],
        success_url:        input.successUrl,
        cancel_url:         input.cancelUrl,
        subscription_data:  { metadata: { tenantId: ctx.tenant.id, plan: input.plan } },
        allow_promotion_codes: true,
      });

      if (!session.url) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Stripe did not return a checkout URL." });
      }

      return { url: session.url };
    }),

  /**
   * Create a Stripe Customer Portal session for managing billing.
   */
  createPortalSession: manageBillingProcedure
    .input(z.object({ returnUrl: z.string().url() }))
    .mutation(async ({ ctx, input }) => {
      const tenant = await ctx.db.query.tenants.findFirst({
        where: eq(tenants.id, ctx.tenant.id),
        columns: { stripeCustomerId: true },
      });
      if (!tenant) throw new TRPCError({ code: "NOT_FOUND" });

      if (!tenant.stripeCustomerId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No Stripe customer found. Please set up a subscription first.",
        });
      }

      const session = await stripe.billingPortal.sessions.create({
        customer:   tenant.stripeCustomerId,
        return_url: input.returnUrl,
      });

      return { url: session.url };
    }),

  /**
   * Update the tenant plan (direct DB update for starter/downgrade or admin use).
   * In production, plan changes happen via Stripe webhooks for paid tiers.
   */
  setPlan: manageBillingProcedure
    .input(
      z.object({
        plan: z.enum(["starter", "growth", "enterprise"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(tenants)
        .set({ plan: input.plan, updatedAt: new Date() } as any)
        .where(eq(tenants.id, ctx.tenant.id));

      return { success: true, plan: input.plan };
    }),
});
