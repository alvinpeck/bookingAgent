import {
  pgTable,
  pgEnum,
  text,
  timestamp,
  boolean,
  uuid,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { tenants } from "./tenants";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const userRoleEnum = pgEnum("user_role", [
  "owner",    // full access + billing; one per tenant
  "admin",    // full access except billing/owner actions
  "staff",    // can view and manage bookings assigned to them
  "readonly", // read-only dashboard access
]);

// ─── Tenant Users ─────────────────────────────────────────────────────────────

/**
 * Maps a Clerk user (clerkUserId) to a tenant with a specific role.
 * A single Clerk user can be a member of multiple tenants (orgs).
 *
 * Populated via Clerk webhook: organizationMembership.created / .deleted
 */
export const tenantUsers = pgTable(
  "tenant_users",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    // Clerk user ID — authoritative identity
    clerkUserId: text("clerk_user_id").notNull(),

    // Denormalised from Clerk for display; re-synced on webhook events
    email: text("email").notNull(),
    firstName: text("first_name"),
    lastName: text("last_name"),
    avatarUrl: text("avatar_url"),

    role: userRoleEnum("role").notNull().default("staff"),

    isActive: boolean("is_active").notNull().default(true),

    // When the user last accessed the back office
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),

    invitedAt: timestamp("invited_at", { withTimezone: true }),
    invitedByUserId: uuid("invited_by_user_id"), // self-referential, no FK to avoid cycles

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    // A Clerk user can only have one role per tenant
    uniqueIndex("tenant_users_tenant_clerk_idx").on(t.tenantId, t.clerkUserId),
    index("tenant_users_clerk_user_idx").on(t.clerkUserId),
    index("tenant_users_tenant_idx").on(t.tenantId),
  ]
);

// ─── Role Permission Matrix ───────────────────────────────────────────────────

export const ROLE_PERMISSIONS = {
  owner: {
    manageBookings: true,
    manageServices: true,
    manageAvailability: true,
    manageStaff: true,
    manageIntegrations: true,
    manageBilling: true,
    viewAuditLogs: true,
    manageChannels: true,
    deleteOrganization: true,
  },
  admin: {
    manageBookings: true,
    manageServices: true,
    manageAvailability: true,
    manageStaff: true,       // cannot change owner
    manageIntegrations: true,
    manageBilling: false,
    viewAuditLogs: true,
    manageChannels: true,
    deleteOrganization: false,
  },
  staff: {
    manageBookings: true,    // own assigned bookings only
    manageServices: false,
    manageAvailability: true, // own schedule only
    manageStaff: false,
    manageIntegrations: false,
    manageBilling: false,
    viewAuditLogs: false,
    manageChannels: false,
    deleteOrganization: false,
  },
  readonly: {
    manageBookings: false,
    manageServices: false,
    manageAvailability: false,
    manageStaff: false,
    manageIntegrations: false,
    manageBilling: false,
    viewAuditLogs: false,
    manageChannels: false,
    deleteOrganization: false,
  },
} as const satisfies Record<
  "owner" | "admin" | "staff" | "readonly",
  Record<string, boolean>
>;

export type UserRole = typeof userRoleEnum.enumValues[number];
export type Permission = keyof typeof ROLE_PERMISSIONS.owner;

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role][permission] === true;
}
