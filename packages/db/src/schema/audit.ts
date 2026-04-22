import {
  pgTable,
  pgEnum,
  text,
  timestamp,
  integer,
  jsonb,
  uuid,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { tenants } from "./tenants";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const auditActionEnum = pgEnum("audit_action", [
  // Auth events
  "user.signed_in",
  "user.signed_out",
  "user.mfa_enabled",
  "user.mfa_disabled",
  "user.invited",
  "user.role_changed",
  "user.removed",

  // Booking events
  "booking.created",
  "booking.confirmed",
  "booking.cancelled",
  "booking.rescheduled",
  "booking.completed",
  "booking.no_show",
  "booking.note_added",

  // Integration events
  "integration.connected",
  "integration.disconnected",
  "integration.token_refreshed",
  "integration.sync_error",

  // Channel events
  "channel.created",
  "channel.updated",
  "channel.deleted",
  "channel.webhook_verified",
  "channel.webhook_failed",

  // Service / availability events
  "service.created",
  "service.updated",
  "service.archived",
  "availability.updated",
  "override.created",
  "override.deleted",

  // Admin events
  "tenant.settings_updated",
  "tenant.plan_changed",
  "tenant.suspended",
]);

// ─── Audit Logs ───────────────────────────────────────────────────────────────

/**
 * Immutable audit trail. NEVER UPDATE OR DELETE ROWS.
 * Append-only — enforced by application layer.
 * Consider row-level security policy: USING (false) WITH CHECK (true).
 */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    action: auditActionEnum("action").notNull(),

    // Who performed the action
    // Format: "user:<clerkUserId>", "system", "ai_agent", "webhook:<source>"
    actorId: text("actor_id").notNull(),
    actorEmail: text("actor_email"),
    actorRole: text("actor_role"),

    // What was affected
    resourceType: text("resource_type"), // e.g. "booking", "integration", "channel"
    resourceId: text("resource_id"),

    // Before/after snapshot for change events
    before: jsonb("before"),
    after: jsonb("after"),

    // Additional context
    metadata: jsonb("metadata"),

    // Request tracing
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    requestId: text("request_id"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    index("audit_logs_tenant_idx").on(t.tenantId),
    index("audit_logs_action_idx").on(t.action),
    index("audit_logs_actor_idx").on(t.actorId),
    index("audit_logs_resource_idx").on(t.resourceType, t.resourceId),
    index("audit_logs_created_at_idx").on(t.createdAt),
  ]
);

// ─── Usage Metering ───────────────────────────────────────────────────────────

export const usageMeteringEnum = pgEnum("usage_metric", [
  "bookings",
  "ai_tokens",
  "whatsapp_messages",
  "telegram_messages",
  "email_reminders",
  "sms_reminders",
  "staff_seats",
]);

/**
 * Monthly usage counters per tenant per metric.
 * Incremented via atomic UPDATE ... SET count = count + N.
 * Used for quota enforcement (Phase 11).
 */
export const usageMetering = pgTable(
  "usage_metering",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    metric: usageMeteringEnum("metric").notNull(),

    // Billing period (YYYY-MM format, e.g. "2025-03")
    periodMonth: text("period_month").notNull(),

    count: integer("count").notNull().default(0),

    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    index("usage_metering_tenant_idx").on(t.tenantId),
    // One row per tenant per metric per month
    // Upserted via INSERT ... ON CONFLICT DO UPDATE
  ]
);
