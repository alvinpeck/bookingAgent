import { z } from "zod";
import { eq, and, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  router,
  publicProcedure,
  protectedProcedure,
  manageServicesProcedure,
  withAudit,
} from "../trpc";
import { services, serviceStaff, serviceStatusEnum } from "@booking-agent/db";

const serviceInputSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(1000).optional(),
  slug: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens only"),
  durationMinutes: z.number().int().min(5).max(480),
  bufferAfterMinutes: z.number().int().min(0).max(120).default(0),
  price: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
  currency: z.string().length(3).default("USD"),
  isPublic: z.boolean().default(true),
  maxConcurrentBookings: z.number().int().min(1).max(100).default(1),
  colorHex: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#6366f1"),
  sortOrder: z.number().int().default(0),
});

export const servicesRouter = router({
  /**
   * List services for the current tenant.
   * Back-office: returns all non-deleted services.
   */
  list: protectedProcedure
    .input(
      z.object({
        status: z.enum(serviceStatusEnum.enumValues).optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      return ctx.db.query.services.findMany({
        where: and(
          eq(services.tenantId, ctx.tenant.id),
          isNull(services.deletedAt),
          input?.status ? eq(services.status, input.status) : undefined
        ),
        orderBy: (s, { asc }) => [asc(s.sortOrder), asc(s.name)],
      });
    }),

  /**
   * Public: list active, public services for a tenant by slug.
   * Used by the booking site — no auth required.
   */
  listPublic: publicProcedure
    .input(z.object({ tenantSlug: z.string() }))
    .query(async ({ ctx, input }) => {
      const { tenants } = await import("@booking-agent/db");
      const tenant = await ctx.db.query.tenants.findFirst({
        where: eq(tenants.slug, input.tenantSlug),
      });

      if (!tenant) throw new TRPCError({ code: "NOT_FOUND" });

      return ctx.db.query.services.findMany({
        where: and(
          eq(services.tenantId, tenant.id),
          eq(services.status, "active"),
          eq(services.isPublic, true),
          isNull(services.deletedAt)
        ),
        columns: {
          id: true,
          name: true,
          description: true,
          slug: true,
          durationMinutes: true,
          price: true,
          currency: true,
          colorHex: true,
          sortOrder: true,
        },
        orderBy: (s, { asc }) => [asc(s.sortOrder), asc(s.name)],
      });
    }),

  /**
   * Public: get a single active service by tenant slug + service slug.
   * Used by the booking site — no auth required.
   */
  getPublicBySlug: publicProcedure
    .input(z.object({ tenantSlug: z.string(), serviceSlug: z.string() }))
    .query(async ({ ctx, input }) => {
      const { tenants } = await import("@booking-agent/db");
      const tenant = await ctx.db.query.tenants.findFirst({
        where: eq(tenants.slug, input.tenantSlug),
      });
      if (!tenant) throw new TRPCError({ code: "NOT_FOUND" });

      const service = await ctx.db.query.services.findFirst({
        where: and(
          eq(services.tenantId, tenant.id),
          eq(services.slug, input.serviceSlug),
          eq(services.status, "active"),
          eq(services.isPublic, true),
          isNull(services.deletedAt)
        ),
        columns: {
          id: true,
          name: true,
          description: true,
          slug: true,
          durationMinutes: true,
          bufferAfterMinutes: true,
          price: true,
          currency: true,
          colorHex: true,
        },
      });

      if (!service) throw new TRPCError({ code: "NOT_FOUND" });
      return { service, tenantSlug: tenant.slug, tenantName: tenant.name, tenantTimezone: tenant.timezone };
    }),

  /**
   * Get a single service by ID (must belong to current tenant).
   */
  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const service = await ctx.db.query.services.findFirst({
        where: and(
          eq(services.id, input.id),
          eq(services.tenantId, ctx.tenant.id),
          isNull(services.deletedAt)
        ),
        with: {
          serviceStaff: {
            with: { staff: true },
          },
        },
      });

      if (!service) throw new TRPCError({ code: "NOT_FOUND" });
      return service;
    }),

  /**
   * Create a new service.
   */
  create: manageServicesProcedure
    .use(withAudit)
    .input(serviceInputSchema)
    .mutation(async ({ ctx, input }) => {
      // Enforce plan quota
      const { PLAN_QUOTAS } = await import("@booking-agent/db");
      const count = await ctx.db.$count(
        services,
        and(eq(services.tenantId, ctx.tenant.id), isNull(services.deletedAt))
      );

      const quota = PLAN_QUOTAS[ctx.tenant.plan].maxServices;
      if (count >= quota) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Your plan allows a maximum of ${quota} services. Please upgrade to add more.`,
        });
      }

      const [created] = await ctx.db
        .insert(services)
        .values({
          tenantId: ctx.tenant.id,
          ...input,
          status: "draft",
        })
        .returning();

      await ctx.audit("service.created", {
        resourceType: "service",
        resourceId: created!.id,
        after: created,
      });

      return created;
    }),

  /**
   * Update an existing service.
   */
  update: manageServicesProcedure
    .use(withAudit)
    .input(
      z.object({
        id: z.string().uuid(),
        data: serviceInputSchema.partial(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.services.findFirst({
        where: and(
          eq(services.id, input.id),
          eq(services.tenantId, ctx.tenant.id),
          isNull(services.deletedAt)
        ),
      });

      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      const [updated] = await ctx.db
        .update(services)
        .set({ ...input.data, updatedAt: new Date() })
        .where(
          and(
            eq(services.id, input.id),
            eq(services.tenantId, ctx.tenant.id)
          )
        )
        .returning();

      await ctx.audit("service.updated", {
        resourceType: "service",
        resourceId: input.id,
        before: existing,
        after: updated,
      });

      return updated;
    }),

  /**
   * Publish or unpublish a service (toggle active/draft).
   */
  setStatus: manageServicesProcedure
    .use(withAudit)
    .input(
      z.object({
        id: z.string().uuid(),
        status: z.enum(["active", "draft", "archived"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(services)
        .set({ status: input.status, updatedAt: new Date() })
        .where(
          and(
            eq(services.id, input.id),
            eq(services.tenantId, ctx.tenant.id),
            isNull(services.deletedAt)
          )
        )
        .returning();

      if (!updated) throw new TRPCError({ code: "NOT_FOUND" });

      await ctx.audit(
        input.status === "archived" ? "service.archived" : "service.updated",
        {
          resourceType: "service",
          resourceId: input.id,
          after: { status: input.status },
        }
      );

      return updated;
    }),

  /**
   * Soft-delete a service.
   */
  delete: manageServicesProcedure
    .use(withAudit)
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [deleted] = await ctx.db
        .update(services)
        .set({ deletedAt: new Date(), status: "archived", updatedAt: new Date() })
        .where(
          and(
            eq(services.id, input.id),
            eq(services.tenantId, ctx.tenant.id)
          )
        )
        .returning();

      if (!deleted) throw new TRPCError({ code: "NOT_FOUND" });

      await ctx.audit("service.archived", {
        resourceType: "service",
        resourceId: input.id,
      });

      return { success: true };
    }),

  /**
   * Get staff assigned to a service.
   */
  getStaff: protectedProcedure
    .input(z.object({ serviceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.query.serviceStaff.findMany({
        where: and(
          eq(serviceStaff.tenantId, ctx.tenant.id),
          eq(serviceStaff.serviceId, input.serviceId)
        ),
        with: {
          staff: { columns: { id: true, displayName: true, isActive: true } },
        },
      });
      return rows.map((r) => r.staff).filter((s) => s.isActive);
    }),

  /**
   * Set the staff assigned to a service (replaces existing assignments).
   */
  setStaff: manageServicesProcedure
    .input(z.object({ serviceId: z.string().uuid(), staffIds: z.array(z.string().uuid()) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.transaction(async (tx) => {
        await tx
          .delete(serviceStaff)
          .where(
            and(
              eq(serviceStaff.tenantId, ctx.tenant.id),
              eq(serviceStaff.serviceId, input.serviceId)
            )
          );
        if (input.staffIds.length > 0) {
          await tx.insert(serviceStaff).values(
            input.staffIds.map((staffId) => ({
              tenantId: ctx.tenant.id,
              serviceId: input.serviceId,
              staffId,
            }))
          );
        }
      });
      return { success: true };
    }),
});
