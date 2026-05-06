import { z } from "zod";
import { eq, and, inArray } from "drizzle-orm";
import { router, protectedProcedure, manageBillingProcedure } from "../trpc";
import { usageMetering, tenants, PLAN_QUOTAS } from "@booking-agent/db";
import type { UsageMetric } from "@booking-agent/db";
import { getCurrentPeriod } from "../lib/usage";

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
   * Update the tenant plan. Restricted to manageBilling permission (owner role).
   * NOTE: In production this would integrate with Stripe. For now it's a direct DB update.
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
        .set({ plan: input.plan, updatedAt: new Date() })
        .where(eq(tenants.id, ctx.tenant.id));

      return { success: true, plan: input.plan };
    }),
});
