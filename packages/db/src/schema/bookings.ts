import {
  pgTable,
  pgEnum,
  text,
  timestamp,
  boolean,
  integer,
  numeric,
  jsonb,
  uuid,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { tenants } from "./tenants";
import { services, staff } from "./services";
import { tenantUsers } from "./users";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const bookingStatusEnum = pgEnum("booking_status", [
  "pending",    // awaiting confirmation (if manual confirm is on)
  "confirmed",  // confirmed, calendar hold active
  "completed",  // post-appointment; set by job or staff
  "cancelled",  // customer or staff cancelled
  "no_show",    // customer did not appear
  "rescheduled", // replaced by a new booking (linked via rescheduledToId)
]);

export const bookingPaymentStatusEnum = pgEnum("booking_payment_status", [
  "unpaid",    // payment required but not yet collected
  "paid",      // payment collected via Stripe Checkout
  "refunded",  // payment was refunded
  "waived",    // payment requirement waived by staff
]);

export const bookingChannelEnum = pgEnum("booking_channel", [
  "web",        // public booking site
  "whatsapp",
  "telegram",
  "back_office", // created directly by staff
  "api",        // programmatic (future)
]);

// ─── Bookings ─────────────────────────────────────────────────────────────────

/**
 * Core booking record. One row per appointment.
 *
 * Double-booking prevention strategy:
 *   1. Application layer: slot engine checks existing bookings + holds before offering slots.
 *   2. DB layer: `SELECT FOR UPDATE` on the staff row within the creation transaction
 *      serialises concurrent writes for the same staff member.
 *   3. A partial unique index on (staff_id, slot_start_at) where status NOT IN
 *      ('cancelled', 'rescheduled') provides a final safety net.
 */
export const bookings = pgTable(
  "bookings",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id),

    // Customer details (not a registered user; captured at booking time)
    customerName: text("customer_name").notNull(),
    customerEmail: text("customer_email").notNull(),
    customerPhone: text("customer_phone"),
    customerNotes: text("customer_notes"),

    // Timing (always stored in UTC)
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),

    status: bookingStatusEnum("status").notNull().default("confirmed"),
    channel: bookingChannelEnum("channel").notNull().default("web"),

    // Internal note added by staff
    internalNote: text("internal_note"),

    // Pricing snapshot at time of booking (prices can change)
    priceSnapshot: numeric("price_snapshot", { precision: 10, scale: 2 }),
    currency: text("currency").notNull().default("USD"),

    // Google Calendar event ID (if written back after confirmation)
    googleCalendarEventId: text("google_calendar_event_id"),

    // Reschedule chain: if this booking was rescheduled, points to the new one
    rescheduledToId: uuid("rescheduled_to_id"),
    rescheduledFromId: uuid("rescheduled_from_id"),

    // Which staff member last modified this booking
    lastModifiedByUserId: uuid("last_modified_by_user_id"),

    // Hold token that was consumed to create this booking
    holdToken: text("hold_token"),

    // Payment (Stripe Connect)
    paymentStatus: bookingPaymentStatusEnum("payment_status"),
    stripeCheckoutSessionId: text("stripe_checkout_session_id"),

    // Reminders
    reminderSentAt: timestamp("reminder_sent_at", { withTimezone: true }),
    reminderScheduledFor: timestamp("reminder_scheduled_for", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    index("bookings_tenant_idx").on(t.tenantId),
    index("bookings_staff_idx").on(t.staffId),
    index("bookings_status_idx").on(t.status),
    index("bookings_starts_at_idx").on(t.startsAt),
    index("bookings_customer_email_idx").on(t.tenantId, t.customerEmail),
    // Composite for back-office calendar queries
    index("bookings_tenant_staff_time_idx").on(t.tenantId, t.staffId, t.startsAt),
  ]
);

// Note: The partial unique index preventing double-booking is created in the migration:
//   CREATE UNIQUE INDEX bookings_no_double_booking_idx
//   ON bookings (staff_id, starts_at)
//   WHERE status NOT IN ('cancelled', 'rescheduled');

// ─── Booking Status History ───────────────────────────────────────────────────

/**
 * Immutable audit trail of every status change on a booking.
 * Never update or delete rows in this table.
 */
export const bookingStatusHistory = pgTable(
  "booking_status_history",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),

    fromStatus: bookingStatusEnum("from_status"),
    toStatus: bookingStatusEnum("to_status").notNull(),

    // Who made the change: user ID, "system", "ai_agent", or channel identifier
    changedBy: text("changed_by").notNull(),
    reason: text("reason"),

    // Snapshot of any metadata at the time of change (e.g. reschedule target time)
    metadata: jsonb("metadata"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    index("booking_status_history_booking_idx").on(t.bookingId),
    index("booking_status_history_tenant_idx").on(t.tenantId),
  ]
);

export type BookingStatus = typeof bookingStatusEnum.enumValues[number];
export type BookingChannel = typeof bookingChannelEnum.enumValues[number];
export type BookingPaymentStatus = typeof bookingPaymentStatusEnum.enumValues[number];
