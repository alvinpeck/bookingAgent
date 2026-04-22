import {
  pgTable,
  pgEnum,
  text,
  timestamp,
  boolean,
  integer,
  numeric,
  uuid,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { tenants } from "./tenants";
import { tenantUsers } from "./users";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const serviceStatusEnum = pgEnum("service_status", [
  "active",
  "draft",
  "archived",
]);

// ─── Services ─────────────────────────────────────────────────────────────────

/**
 * A bookable service offered by a tenant.
 * e.g. "30-min Haircut", "1hr Consultation", "Personal Training Session"
 */
export const services = pgTable(
  "services",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    name: text("name").notNull(),
    description: text("description"),
    slug: text("slug").notNull(), // for public booking URLs

    status: serviceStatusEnum("status").notNull().default("draft"),

    // Duration in minutes
    durationMinutes: integer("duration_minutes").notNull().default(60),

    // Buffer time added after the booking (e.g. cleanup time)
    bufferAfterMinutes: integer("buffer_after_minutes").notNull().default(0),

    // Price (stored as string to avoid floating point issues; use integer cents in practice)
    price: numeric("price", { precision: 10, scale: 2 }),
    currency: text("currency").notNull().default("USD"),

    // Whether this service is shown on the public booking site
    isPublic: boolean("is_public").notNull().default(true),

    // Max concurrent bookings for this service at the same time
    maxConcurrentBookings: integer("max_concurrent_bookings")
      .notNull()
      .default(1),

    // Display order on booking pages
    sortOrder: integer("sort_order").notNull().default(0),

    // Color used in back-office calendar views
    colorHex: text("color_hex").notNull().default("#6366f1"),

    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    index("services_tenant_idx").on(t.tenantId),
    uniqueIndex("services_tenant_slug_idx").on(t.tenantId, t.slug),
    index("services_status_idx").on(t.status),
  ]
);

// ─── Staff ────────────────────────────────────────────────────────────────────

/**
 * A staff member who can be assigned to services and has their own availability.
 * References tenant_users — only active back-office users can be staff.
 */
export const staff = pgTable(
  "staff",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    tenantUserId: uuid("tenant_user_id")
      .notNull()
      .references(() => tenantUsers.id, { onDelete: "cascade" }),

    displayName: text("display_name").notNull(),
    bio: text("bio"),
    avatarUrl: text("avatar_url"),

    // Whether this staff member appears in public booking flows
    isPublic: boolean("is_public").notNull().default(true),
    isActive: boolean("is_active").notNull().default(true),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    index("staff_tenant_idx").on(t.tenantId),
    uniqueIndex("staff_tenant_user_idx").on(t.tenantId, t.tenantUserId),
  ]
);

// ─── Service-Staff Assignment ─────────────────────────────────────────────────

export const serviceStaff = pgTable(
  "service_staff",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    uniqueIndex("service_staff_unique_idx").on(t.tenantId, t.serviceId, t.staffId),
  ]
);
