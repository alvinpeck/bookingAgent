import { z } from "zod";
import { router, protectedProcedure, manageChannelsProcedure, withAudit } from "../trpc";
import {
  db,
  tenantSettings,
  conversations,
  bookings,
  auditLogs,
} from "@booking-agent/db";
import { eq, and, inArray, sql } from "drizzle-orm";
import { getRedis } from "../lib/redis";

// ─── Retention defaults ───────────────────────────────────────────────────────

const RETENTION_DEFAULTS = {
  conversations: 90,
  webhookEvents: 30,
  bookings: 365,
} as const;

// ─── Helper: read a single tenant_settings value as number ───────────────────

async function readRetentionSetting(
  tenantId: string,
  key: string,
  defaultValue: number
): Promise<number> {
  const rows = await db
    .select({ value: tenantSettings.value })
    .from(tenantSettings)
    .where(and(eq(tenantSettings.tenantId, tenantId), eq(tenantSettings.key, key)))
    .limit(1);

  if (rows.length === 0 || rows[0]!.value === null) return defaultValue;
  const v = rows[0]!.value;
  const parsed = typeof v === "number" ? v : Number(v);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

// ─── Helper: upsert a tenant_settings key ────────────────────────────────────

async function upsertRetentionSetting(
  tenantId: string,
  key: string,
  value: number
): Promise<void> {
  await db
    .insert(tenantSettings)
    .values({ tenantId, key, value: value as unknown as Record<string, unknown> } as any)
    .onConflictDoUpdate({
      target: [tenantSettings.tenantId, tenantSettings.key],
      set: {
        value: value as unknown as Record<string, unknown>,
        updatedAt: sql`now()`,
      } as any,
    });
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const complianceRouter = router({
  /**
   * Returns the effective retention settings for the caller's tenant.
   * Falls back to platform defaults when not explicitly configured.
   */
  getRetentionSettings: protectedProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.tenant.id;

    const [convDays, webhookDays, bookingDays] = await Promise.all([
      readRetentionSetting(tenantId, "retention:conversations", RETENTION_DEFAULTS.conversations),
      readRetentionSetting(tenantId, "retention:webhook_events", RETENTION_DEFAULTS.webhookEvents),
      readRetentionSetting(tenantId, "retention:bookings", RETENTION_DEFAULTS.bookings),
    ]);

    return {
      conversations: convDays,
      webhookEvents: webhookDays,
      bookings: bookingDays,
    };
  }),

  /**
   * Updates one or more retention period settings.
   * Admin-only (manageChannels permission used for tenant-admin-level ops).
   * Audits the change via tenant.settings_updated.
   */
  updateRetentionSettings: manageChannelsProcedure
    .use(withAudit)
    .input(
      z.object({
        conversations: z.number().int().min(7).max(730).optional(),
        webhookEvents: z.number().int().min(7).max(90).optional(),
        bookings: z.number().int().min(90).max(2555).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenant.id;

      const ops: Promise<void>[] = [];

      if (input.conversations !== undefined) {
        ops.push(upsertRetentionSetting(tenantId, "retention:conversations", input.conversations));
      }
      if (input.webhookEvents !== undefined) {
        ops.push(upsertRetentionSetting(tenantId, "retention:webhook_events", input.webhookEvents));
      }
      if (input.bookings !== undefined) {
        ops.push(upsertRetentionSetting(tenantId, "retention:bookings", input.bookings));
      }

      await Promise.all(ops);

      await ctx.audit("tenant.settings_updated", {
        resourceType: "tenant_settings",
        resourceId: tenantId,
        after: {
          retentionSettings: input,
        },
        metadata: { section: "data_retention" },
      });

      return { success: true };
    }),

  /**
   * GDPR right-to-erasure: deletes all conversation records for the given
   * external user across every channel for this tenant.
   * Also clears any live Redis conversation history for the user.
   * Writes an audit record with metadata.
   */
  requestErasure: protectedProcedure
    .input(
      z.object({
        externalUserId: z.string().min(1),
        reason: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenant.id;

      // Delete DB conversation records for this external user within this tenant
      await db
        .delete(conversations)
        .where(
          and(
            eq(conversations.tenantId, tenantId),
            eq(conversations.externalUserId, input.externalUserId)
          )
        );

      // Clear Redis conversation history for all channels for this user
      // Pattern: conv:{tenantId}:*:{externalUserId}
      try {
        const redis = getRedis();
        const pattern = `conv:${tenantId}:*:${input.externalUserId}`;
        const keys = await redis.keys(pattern);
        if (keys.length > 0) {
          await redis.del(...keys);
        }
      } catch (redisErr) {
        // Redis cleanup failure must not block or abort the erasure
        console.error("[erasure] Redis cleanup failed:", redisErr);
      }

      // Record the erasure as an audit log entry using the closest matching action
      // (audit_action enum does not have erasure.requested; we use tenant.settings_updated
      // and capture the erasure context in metadata)
      try {
        // audit_action enum doesn't include "erasure.requested"; use the nearest
        // available value and store the real event type in metadata.
        await db.insert(auditLogs).values({
          tenantId,
          action: "tenant.settings_updated" as const, // closest available enum value
          actorId: `user:${ctx.tenantUser.userId}`,
          actorEmail: ctx.tenantUser.email,
          actorRole: ctx.tenantUser.role,
          resourceType: "external_user",
          resourceId: input.externalUserId,
          metadata: {
            event: "erasure.requested",
            externalUserId: input.externalUserId,
            reason: input.reason ?? null,
          },
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
          requestId: ctx.requestId,
        } as any);
      } catch (auditErr) {
        // Audit log failure must not abort the erasure
        console.error("[erasure] Audit log write failed:", auditErr);
      }

      return { success: true, externalUserId: input.externalUserId };
    }),

  /**
   * GDPR data export: returns all stored data for an external user.
   * Conversations from DB; bookings are tenant-scoped (no externalUserId on bookings).
   */
  exportData: protectedProcedure
    .input(
      z.object({
        externalUserId: z.string().min(1),
      })
    )
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenant.id;

      // Fetch all conversation records for this user
      const userConversations = await db
        .select()
        .from(conversations)
        .where(
          and(
            eq(conversations.tenantId, tenantId),
            eq(conversations.externalUserId, input.externalUserId)
          )
        );

      // Bookings don't store externalUserId directly (see bookings.ts schema).
      // We can surface tenant-scoped bookings as a best-effort export,
      // and filter by customerEmail if the caller supplies it — but since
      // externalUserId is a channel-specific token (e.g. WhatsApp number),
      // we return all tenant bookings and let the caller handle correlation.
      // For now: return bookings linked via conversations (by bookingId).
      const linkedBookingIds = userConversations
        .filter((c) => c.bookingId != null)
        .map((c) => c.bookingId!);

      let userBookings: (typeof bookings.$inferSelect)[] = [];
      if (linkedBookingIds.length > 0) {
        userBookings = await db
          .select()
          .from(bookings)
          .where(
            and(
              eq(bookings.tenantId, tenantId),
              inArray(bookings.id, linkedBookingIds)
            )
          );
      }

      return {
        externalUserId: input.externalUserId,
        conversations: userConversations,
        bookings: userBookings,
      };
    }),
});
