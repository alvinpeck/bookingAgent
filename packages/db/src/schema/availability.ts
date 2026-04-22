import {
  pgTable,
  pgEnum,
  text,
  timestamp,
  boolean,
  integer,
  time,
  date,
  uuid,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { tenants } from "./tenants";
import { staff } from "./services";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const dayOfWeekEnum = pgEnum("day_of_week", [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
]);

// ─── Availability Rules ───────────────────────────────────────────────────────

/**
 * Weekly recurring availability windows for a staff member.
 * Multiple rows per day are allowed (e.g. 9–12 and 14–17).
 *
 * All times are stored in the tenant's configured timezone.
 * The slot engine converts to UTC before exposing slots.
 */
export const availabilityRules = pgTable(
  "availability_rules",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),

    dayOfWeek: dayOfWeekEnum("day_of_week").notNull(),

    // e.g. "09:00" and "17:00" — stored as TIME without timezone
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),

    isActive: boolean("is_active").notNull().default(true),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    index("availability_rules_tenant_idx").on(t.tenantId),
    index("availability_rules_staff_idx").on(t.staffId),
    index("availability_rules_day_idx").on(t.dayOfWeek),
  ]
);

// ─── Availability Overrides ───────────────────────────────────────────────────

/**
 * One-off date overrides.
 * Set isBlocked=true to mark a date as fully unavailable (holiday, vacation).
 * Set isBlocked=false with custom times for a shortened/extended day.
 */
export const availabilityOverrides = pgTable(
  "availability_overrides",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),

    overrideDate: date("override_date").notNull(),

    // If true, staff is completely unavailable this date regardless of rules
    isBlocked: boolean("is_blocked").notNull().default(false),

    // Only used when isBlocked=false (partial-day override)
    startTime: time("start_time"),
    endTime: time("end_time"),

    reason: text("reason"), // Internal note (e.g. "Doctor appointment")

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    index("availability_overrides_tenant_idx").on(t.tenantId),
    index("availability_overrides_staff_date_idx").on(t.staffId, t.overrideDate),
    // One override record per staff per date
    uniqueIndex("availability_overrides_staff_date_unique").on(t.staffId, t.overrideDate),
  ]
);

// ─── Slot Holds ───────────────────────────────────────────────────────────────

/**
 * Short-lived slot reservation created when a customer picks a time but
 * hasn't completed the booking form yet.
 * 
 * The slot engine must check for active holds before advertising a slot as free.
 * Holds expire after HOLD_DURATION_SECONDS (default: 300 = 5 minutes).
 * 
 * A background job (BullMQ / cron) sweeps expired holds.
 * The booking creation transaction also checks and clears stale holds.
 */
export const slotHolds = pgTable(
  "slot_holds",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
    serviceId: uuid("service_id").notNull(), // FK defined in bookings schema

    // The exact UTC slot being held
    slotStartAt: timestamp("slot_start_at", { withTimezone: true }).notNull(),
    slotEndAt: timestamp("slot_end_at", { withTimezone: true }).notNull(),

    // Who holds this slot (anonymous session token or customer identifier)
    holdToken: text("hold_token").notNull(),

    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    index("slot_holds_tenant_idx").on(t.tenantId),
    index("slot_holds_staff_slot_idx").on(t.staffId, t.slotStartAt),
    index("slot_holds_expires_idx").on(t.expiresAt), // for sweep queries
    uniqueIndex("slot_holds_token_idx").on(t.holdToken),
  ]
);

export const HOLD_DURATION_SECONDS = 300; // 5 minutes
