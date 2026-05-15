import { relations } from "drizzle-orm";
import { staff, services, serviceStaff } from "./services";
import { tenantUsers } from "./users";
import { bookings, bookingStatusHistory } from "./bookings";
import { channels, conversations } from "./channels";
import { integrations } from "./integrations";
import { users, accounts } from "./auth-schema";
import { tenants } from "./tenants";
import { tenantInvites } from "./invites";

// Auth.js users → accounts (one-to-many)
export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
  tenantUsers: many(tenantUsers),
}));

// accounts → users (many-to-one)
export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, {
    fields: [accounts.userId],
    references: [users.id],
  }),
}));

// staff → tenantUser (the back-office user who is this staff member) + integrations
export const staffRelations = relations(staff, ({ one, many }) => ({
  tenantUser: one(tenantUsers, {
    fields: [staff.tenantUserId],
    references: [tenantUsers.id],
  }),
  integrations: many(integrations),
}));

// tenantUsers → staff records (inverse) + belongs to users
export const tenantUsersRelations = relations(tenantUsers, ({ many, one }) => ({
  staffRecords: many(staff),
  user: one(users, {
    fields: [tenantUsers.userId],
    references: [users.id],
  }),
}));

// tenants → tenantInvites (one-to-many)
export const tenantsRelations = relations(tenants, ({ many }) => ({
  invites: many(tenantInvites),
}));

// tenantInvites → tenants (many-to-one)
export const tenantInvitesRelations = relations(tenantInvites, ({ one }) => ({
  tenant: one(tenants, {
    fields: [tenantInvites.tenantId],
    references: [tenants.id],
  }),
}));

// services → serviceStaff assignments (one-to-many)
export const servicesRelations = relations(services, ({ many }) => ({
  serviceStaff: many(serviceStaff),
}));

// serviceStaff → service and staff (many-to-one each)
export const serviceStaffRelations = relations(serviceStaff, ({ one }) => ({
  service: one(services, {
    fields: [serviceStaff.serviceId],
    references: [services.id],
  }),
  staff: one(staff, {
    fields: [serviceStaff.staffId],
    references: [staff.id],
  }),
}));

// bookings → service, staff, and status history
export const bookingsRelations = relations(bookings, ({ one, many }) => ({
  service: one(services, {
    fields: [bookings.serviceId],
    references: [services.id],
  }),
  staff: one(staff, {
    fields: [bookings.staffId],
    references: [staff.id],
  }),
  statusHistory: many(bookingStatusHistory),
}));

// bookingStatusHistory → booking (inverse)
export const bookingStatusHistoryRelations = relations(
  bookingStatusHistory,
  ({ one }) => ({
    booking: one(bookings, {
      fields: [bookingStatusHistory.bookingId],
      references: [bookings.id],
    }),
  })
);

// integrations → staff (many-to-one)
export const integrationsRelations = relations(integrations, ({ one }) => ({
  staff: one(staff, {
    fields: [integrations.staffId],
    references: [staff.id],
  }),
}));

// channels → conversations (one-to-many)
export const channelsRelations = relations(channels, ({ many }) => ({
  conversations: many(conversations),
}));

// conversations → channel (many-to-one)
export const conversationsRelations = relations(conversations, ({ one }) => ({
  channel: one(channels, {
    fields: [conversations.channelId],
    references: [channels.id],
  }),
}));
