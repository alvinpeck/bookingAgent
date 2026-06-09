import { NextRequest, NextResponse } from "next/server";
import { db, tenants, tenantSettings, conversations, webhookEvents } from "@booking-agent/db";
import { eq, lt, and, sql } from "drizzle-orm";
import { logger } from "@booking-agent/trpc/lib/logger";

export const dynamic = "force-dynamic";

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULTS = {
  conversations: 90,
  webhookEvents: 30,
  bookings: 365,
} as const;

// ─── Auth helper ──────────────────────────────────────────────────────────────

function isAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    logger.error("[retention] CRON_SECRET is not set — refusing all requests");
    return false;
  }
  const authHeader = req.headers.get("authorization") ?? "";
  return authHeader === `Bearer ${cronSecret}`;
}

// ─── Setting reader ───────────────────────────────────────────────────────────

async function getRetentionDays(
  tenantId: string,
  key: "retention:conversations" | "retention:webhook_events" | "retention:bookings",
  defaultDays: number
): Promise<number> {
  const rows = await db
    .select({ value: tenantSettings.value })
    .from(tenantSettings)
    .where(and(eq(tenantSettings.tenantId, tenantId), eq(tenantSettings.key, key)))
    .limit(1);

  if (rows.length === 0 || rows[0]!.value === null) return defaultDays;
  const v = rows[0]!.value;
  const parsed = typeof v === "number" ? v : Number(v);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultDays;
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  logger.info("[retention] Cron job started");

  let tenantsProcessed = 0;
  let conversationsDeleted = 0;
  let webhookEventsDeleted = 0;

  try {
    // Fetch all active tenants
    const allTenants = await db
      .select({ id: tenants.id, name: tenants.name })
      .from(tenants)
      .where(eq(tenants.status, "active"));

    for (const tenant of allTenants) {
      try {
        // Read per-tenant retention settings (with fallback to defaults)
        const [convDays, webhookDays] = await Promise.all([
          getRetentionDays(tenant.id, "retention:conversations", DEFAULTS.conversations),
          getRetentionDays(tenant.id, "retention:webhook_events", DEFAULTS.webhookEvents),
        ]);

        // Delete expired conversations (based on last_message_at)
        // Use sql.raw for the day count to avoid parameterised interval issues in Postgres
        const deletedConvResult = await db
          .delete(conversations)
          .where(
            and(
              eq(conversations.tenantId, tenant.id),
              lt(
                conversations.lastMessageAt,
                sql`now() - interval '${sql.raw(String(convDays))} days'`
              )
            )
          );

        const deletedConvCount =
          (deletedConvResult as unknown as { rowCount: number | null }).rowCount ?? 0;

        // Delete expired webhook events (based on created_at)
        const deletedWebhookResult = await db
          .delete(webhookEvents)
          .where(
            and(
              eq(webhookEvents.tenantId, tenant.id),
              lt(
                webhookEvents.createdAt,
                sql`now() - interval '${sql.raw(String(webhookDays))} days'`
              )
            )
          );

        const deletedWebhookCount =
          (deletedWebhookResult as unknown as { rowCount: number | null }).rowCount ?? 0;

        conversationsDeleted += deletedConvCount;
        webhookEventsDeleted += deletedWebhookCount;
        tenantsProcessed++;

        logger.info("[retention] Tenant processed", {
          tenantId: tenant.id,
          convDays,
          webhookDays,
          deletedConvCount,
          deletedWebhookCount,
        });
      } catch (tenantErr) {
        logger.error("[retention] Failed to process tenant", {
          tenantId: tenant.id,
          error: String(tenantErr),
        });
        // Continue with other tenants — don't abort the whole run
      }
    }

    const summary = { tenantsProcessed, conversationsDeleted, webhookEventsDeleted };
    logger.info("[retention] Cron job complete", summary);
    return NextResponse.json(summary);
  } catch (err) {
    logger.error("[retention] Fatal error in cron job", { error: String(err) });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
