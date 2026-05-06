import {
  pgTable,
  pgEnum,
  text,
  timestamp,
  boolean,
  jsonb,
  uuid,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const tenantPlanEnum = pgEnum("tenant_plan", [
  "starter",   // shared infra, usage-capped
  "growth",    // hybrid infra, higher limits
  "enterprise", // isolated infra, custom limits
]);

export const tenantStatusEnum = pgEnum("tenant_status", [
  "active",
  "suspended",   // manually suspended by platform admin
  "delinquent",  // billing issue
  "cancelled",
]);

// ─── Tenants ──────────────────────────────────────────────────────────────────

/**
 * Each row is a business client (tenant).
 * The `clerk_org_id` is the Clerk Organization ID — this is the authoritative
 * tenant identifier used to derive context from auth tokens.
 * NEVER accept tenant_id from client input; always derive from clerk_org_id.
 */
export const tenants = pgTable(
  "tenants",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),

    // Clerk org ID — source of truth for tenant identity
    clerkOrgId: text("clerk_org_id").notNull(),

    // Human-readable identifiers
    name: text("name").notNull(),
    slug: text("slug").notNull(), // used in public booking URLs: /book/[slug]

    plan: tenantPlanEnum("plan").notNull().default("starter"),
    status: tenantStatusEnum("status").notNull().default("active"),

    // Business details (used in confirmation emails, booking pages)
    businessEmail: text("business_email"),
    businessPhone: text("business_phone"),
    timezone: text("timezone").notNull().default("UTC"),
    locale: text("locale").notNull().default("en"),
    logoUrl: text("logo_url"),
    websiteUrl: text("website_url"),

    // Billing
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),

    // Soft-delete support
    deletedAt: timestamp("deleted_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    uniqueIndex("tenants_clerk_org_id_idx").on(t.clerkOrgId),
    uniqueIndex("tenants_slug_idx").on(t.slug),
    index("tenants_status_idx").on(t.status),
  ]
);

// ─── Tenant Settings ──────────────────────────────────────────────────────────

/**
 * Flexible key-value settings per tenant, avoiding wide columns on the main table.
 * Examples: booking_lead_time_hours, cancellation_policy, reminder_minutes, etc.
 */
export const tenantSettings = pgTable(
  "tenant_settings",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    value: jsonb("value").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    uniqueIndex("tenant_settings_tenant_key_idx").on(t.tenantId, t.key),
  ]
);

// ─── Plan Quota Defaults ──────────────────────────────────────────────────────
// These are applied at the application layer; Phase 11 adds metering enforcement.

export const PLAN_QUOTAS = {
  starter: {
    maxBookingsPerMonth: 200,
    maxStaffSeats: 3,
    maxServices: 10,
    maxChannels: 1,
    aiTokensPerMonth: 50_000,
  },
  growth: {
    maxBookingsPerMonth: 2_000,
    maxStaffSeats: 15,
    maxServices: 50,
    maxChannels: 3,
    aiTokensPerMonth: 500_000,
  },
  enterprise: {
    maxBookingsPerMonth: Infinity,
    maxStaffSeats: Infinity,
    maxServices: Infinity,
    maxChannels: Infinity,
    aiTokensPerMonth: Infinity,
  },
} as const satisfies Record<
  "starter" | "growth" | "enterprise",
  {
    maxBookingsPerMonth: number;
    maxStaffSeats: number;
    maxServices: number;
    maxChannels: number;
    aiTokensPerMonth: number;
  }
>;

export type TenantPlan = typeof tenantPlanEnum.enumValues[number];
export type TenantStatus = typeof tenantStatusEnum.enumValues[number];

// ─── Usage Metering ───────────────────────────────────────────────────────────

export const usageMetricEnum = pgEnum("usage_metric", [
  "bookings",
  "ai_tokens",
  "whatsapp_messages",
  "telegram_messages",
  "email_reminders",
  "sms_reminders",
  "staff_seats",
]);

export type UsageMetric = typeof usageMetricEnum.enumValues[number];

/**
 * Monthly usage counters per tenant, metric, and billing period.
 * The table already exists in the DB — Drizzle schema added in Phase 11.
 * period_month format: "YYYY-MM"
 */
export const usageMetering = pgTable(
  "usage_metering",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    metric: usageMetricEnum("metric").notNull(),
    periodMonth: text("period_month").notNull(), // "YYYY-MM"
    count: integer("count").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    uniqueIndex("usage_metering_tenant_period_metric_idx").on(
      t.tenantId,
      t.periodMonth,
      t.metric
    ),
    index("usage_metering_tenant_idx").on(t.tenantId),
  ]
);
