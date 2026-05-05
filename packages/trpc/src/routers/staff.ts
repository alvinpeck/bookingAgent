import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  router,
  publicProcedure,
  protectedProcedure,
  manageStaffProcedure,
  withAudit,
} from "../trpc";
import { tenantUsers, staff, serviceStaff, services, tenants, availabilityRules, userRoleEnum } from "@booking-agent/db";

const DEFAULT_RULES = [
  { dayOfWeek: "monday",    startTime: "09:00", endTime: "17:00" },
  { dayOfWeek: "tuesday",   startTime: "09:00", endTime: "17:00" },
  { dayOfWeek: "wednesday", startTime: "09:00", endTime: "17:00" },
  { dayOfWeek: "thursday",  startTime: "09:00", endTime: "17:00" },
  { dayOfWeek: "friday",    startTime: "09:00", endTime: "17:00" },
] as const;

export const staffRouter = router({
  /**
   * Public: list active staff assigned to a specific service.
   * Used by the booking site — no auth required.
   */
  listPublicForService: publicProcedure
    .input(z.object({ tenantSlug: z.string(), serviceSlug: z.string() }))
    .query(async ({ ctx, input }) => {
      const tenant = await ctx.db.query.tenants.findFirst({
        where: eq(tenants.slug, input.tenantSlug),
      });
      if (!tenant) throw new TRPCError({ code: "NOT_FOUND" });

      const service = await ctx.db.query.services.findFirst({
        where: and(eq(services.tenantId, tenant.id), eq(services.slug, input.serviceSlug)),
      });
      if (!service) throw new TRPCError({ code: "NOT_FOUND" });

      const assignments = await ctx.db.query.serviceStaff.findMany({
        where: and(
          eq(serviceStaff.tenantId, tenant.id),
          eq(serviceStaff.serviceId, service.id)
        ),
        with: {
          staff: {
            columns: { id: true, displayName: true, bio: true, avatarUrl: true, isActive: true },
          },
        },
      });

      return assignments
        .map((a) => a.staff)
        .filter((s) => s.isActive);
    }),

  /**
   * Create a staff record for an existing tenant user.
   */
  create: manageStaffProcedure
    .use(withAudit)
    .input(
      z.object({
        tenantUserId: z.string().uuid(),
        displayName: z.string().min(1).max(100),
        bio: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.query.tenantUsers.findFirst({
        where: and(eq(tenantUsers.id, input.tenantUserId), eq(tenantUsers.tenantId, ctx.tenant.id)),
      });
      if (!user) throw new TRPCError({ code: "NOT_FOUND" });

      const existing = await ctx.db.query.staff.findFirst({
        where: and(eq(staff.tenantUserId, user.id), eq(staff.tenantId, ctx.tenant.id)),
      });
      if (existing) throw new TRPCError({ code: "CONFLICT", message: "This user is already a staff member." });

      const [created] = await ctx.db.transaction(async (tx) => {
        const [s] = await tx
          .insert(staff)
          .values({ tenantId: ctx.tenant.id, tenantUserId: user.id, displayName: input.displayName, bio: input.bio ?? null })
          .returning();
        // Seed default Mon–Fri 9–5 availability rules
        await tx.insert(availabilityRules).values(
          DEFAULT_RULES.map((r) => ({ tenantId: ctx.tenant.id, staffId: s!.id, ...r, isActive: true }))
        );
        return [s];
      });

      await ctx.audit("user.invited", { resourceType: "staff", resourceId: created!.id, after: created });
      return created;
    }),

  /**
   * List all staff members for the current tenant.
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.query.staff.findMany({
      where: and(
        eq(staff.tenantId, ctx.tenant.id),
        eq(staff.isActive, true)
      ),
      with: {
        tenantUser: {
          columns: {
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            lastSeenAt: true,
          },
        },
      },
      orderBy: (s, { asc }) => asc(s.displayName),
    });
  }),

  /**
   * Get a single staff member (must belong to current tenant).
   */
  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const member = await ctx.db.query.staff.findFirst({
        where: and(
          eq(staff.id, input.id),
          eq(staff.tenantId, ctx.tenant.id)
        ),
        with: { tenantUser: true },
      });

      if (!member) throw new TRPCError({ code: "NOT_FOUND" });
      return member;
    }),

  /**
   * Update a staff member's display info.
   * Staff can update their own record; admin/owner can update any.
   */
  update: manageStaffProcedure
    .use(withAudit)
    .input(
      z.object({
        id: z.string().uuid(),
        displayName: z.string().min(1).max(100).optional(),
        bio: z.string().max(500).optional(),
        avatarUrl: z.string().url().optional(),
        isPublic: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...fields } = input;

      const existing = await ctx.db.query.staff.findFirst({
        where: and(
          eq(staff.id, id),
          eq(staff.tenantId, ctx.tenant.id)
        ),
      });

      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      const [updated] = await ctx.db
        .update(staff)
        .set({ ...fields, updatedAt: new Date() })
        .where(and(eq(staff.id, id), eq(staff.tenantId, ctx.tenant.id)))
        .returning();

      await ctx.audit("availability.updated", {
        resourceType: "staff",
        resourceId: id,
        before: existing,
        after: updated,
      });

      return updated;
    }),

  /**
   * Deactivate a staff member (soft delete).
   */
  deactivate: manageStaffProcedure
    .use(withAudit)
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.staff.findFirst({
        where: and(
          eq(staff.id, input.id),
          eq(staff.tenantId, ctx.tenant.id)
        ),
      });

      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      // Prevent deactivating yourself
      if (existing.tenantUserId === ctx.tenantUser.id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You cannot deactivate your own staff record.",
        });
      }

      const [updated] = await ctx.db
        .update(staff)
        .set({ isActive: false, updatedAt: new Date() })
        .where(and(eq(staff.id, input.id), eq(staff.tenantId, ctx.tenant.id)))
        .returning();

      await ctx.audit("user.removed", {
        resourceType: "staff",
        resourceId: input.id,
        before: existing,
        after: updated,
      });

      return { success: true };
    }),

  /**
   * List all back-office users (tenantUsers) with their roles.
   */
  listUsers: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.query.tenantUsers.findMany({
      where: and(
        eq(tenantUsers.tenantId, ctx.tenant.id),
        eq(tenantUsers.isActive, true)
      ),
      columns: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        avatarUrl: true,
        lastSeenAt: true,
        createdAt: true,
      },
      orderBy: (u, { asc }) => asc(u.email),
    });
  }),

  /**
   * Change a user's role within the tenant.
   * Only owner can promote/demote to/from owner.
   */
  changeRole: manageStaffProcedure
    .use(withAudit)
    .input(
      z.object({
        userId: z.string().uuid(),
        role: z.enum(userRoleEnum.enumValues),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const targetUser = await ctx.db.query.tenantUsers.findFirst({
        where: and(
          eq(tenantUsers.id, input.userId),
          eq(tenantUsers.tenantId, ctx.tenant.id)
        ),
      });

      if (!targetUser) throw new TRPCError({ code: "NOT_FOUND" });

      // Only owner can assign owner role
      if (input.role === "owner" && ctx.tenantUser.role !== "owner") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only an owner can assign the owner role.",
        });
      }

      // Cannot change your own role
      if (targetUser.id === ctx.tenantUser.id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You cannot change your own role.",
        });
      }

      const [updated] = await ctx.db
        .update(tenantUsers)
        .set({ role: input.role, updatedAt: new Date() })
        .where(
          and(
            eq(tenantUsers.id, input.userId),
            eq(tenantUsers.tenantId, ctx.tenant.id)
          )
        )
        .returning();

      await ctx.audit("user.role_changed", {
        resourceType: "tenant_user",
        resourceId: input.userId,
        before: { role: targetUser.role },
        after: { role: input.role },
        metadata: { targetEmail: targetUser.email },
      });

      return updated;
    }),
});
