import { eq, and, inArray } from "drizzle-orm";
import { sql } from "drizzle-orm";
import {
  db as _db,
  usageMetering,
  tenants,
  PLAN_QUOTAS,
} from "@booking-agent/db";
import type { UsageMetric } from "@booking-agent/db";

// ─── Period helpers ───────────────────────────────────────────────────────────

/**
 * Returns the current billing period as "YYYY-MM".
 */
export function getCurrentPeriod(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

// ─── Increment usage ──────────────────────────────────────────────────────────

/**
 * Upserts a usage counter for the given tenant + metric in the current period.
 * Returns the new total count for that metric/period.
 */
export async function incrementUsage(
  db: typeof _db,
  tenantId: string,
  metric: UsageMetric,
  amount = 1
): Promise<number> {
  const period = getCurrentPeriod();

  const rows = await db
    .insert(usageMetering)
    .values({
      tenantId,
      metric,
      periodMonth: period,
      count: amount,
    })
    .onConflictDoUpdate({
      target: [
        usageMetering.tenantId,
        usageMetering.periodMonth,
        usageMetering.metric,
      ],
      set: {
        count: sql`${usageMetering.count} + ${amount}`,
        updatedAt: sql`now()`,
      },
    })
    .returning({ count: usageMetering.count });

  return rows[0]?.count ?? amount;
}

// ─── Get usage for period ─────────────────────────────────────────────────────

/**
 * Returns a map of metric → count for the given tenant and period.
 * Defaults to the current period.
 */
export async function getUsageForPeriod(
  db: typeof _db,
  tenantId: string,
  period?: string
): Promise<Record<UsageMetric, number>> {
  const p = period ?? getCurrentPeriod();

  const rows = await db.query.usageMetering.findMany({
    where: and(
      eq(usageMetering.tenantId, tenantId),
      eq(usageMetering.periodMonth, p)
    ),
    columns: { metric: true, count: true },
  });

  const result = {
    bookings: 0,
    ai_tokens: 0,
    whatsapp_messages: 0,
    telegram_messages: 0,
    email_reminders: 0,
    sms_reminders: 0,
    staff_seats: 0,
  } as Record<UsageMetric, number>;

  for (const row of rows) {
    result[row.metric] = row.count;
  }

  return result;
}

// ─── Check quota ──────────────────────────────────────────────────────────────

export type QuotaCheck = {
  allowed: boolean;
  used: number;
  limit: number;
};

/**
 * Checks whether a tenant has remaining quota for the given metric.
 * Looks up the tenant plan, maps to PLAN_QUOTAS, and compares against
 * current month usage in usage_metering.
 */
export async function checkQuota(
  db: typeof _db,
  tenantId: string,
  metric: UsageMetric
): Promise<QuotaCheck> {
  // Load tenant plan
  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
    columns: { plan: true },
  });

  if (!tenant) {
    // No tenant found — deny access
    return { allowed: false, used: 0, limit: 0 };
  }

  const plan = tenant.plan;
  const quotas = PLAN_QUOTAS[plan];

  // Map metric to quota key
  let limit: number;
  switch (metric) {
    case "ai_tokens":
      limit = quotas.aiTokensPerMonth;
      break;
    case "bookings":
      limit = quotas.maxBookingsPerMonth;
      break;
    case "staff_seats":
      limit = quotas.maxStaffSeats;
      break;
    default:
      // No explicit quota for other metrics → always allowed
      limit = Infinity;
  }

  // Infinity means enterprise unlimited
  if (limit === Infinity) {
    return { allowed: true, used: 0, limit: Infinity };
  }

  // Load current usage
  const usage = await getUsageForPeriod(db, tenantId);
  const used = usage[metric];

  return {
    allowed: used < limit,
    used,
    limit,
  };
}
