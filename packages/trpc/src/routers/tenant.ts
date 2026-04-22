import { z } from "zod";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  router,
  protectedProcedure,
  manageBillingProcedure,
  withAudit,
} from "../trpc";
import { tenants, tenantSettings, PLAN_QUOTAS } from "@booking-agent/db";

export const tenantRouter = router({
  /**
   * Get the current tenant's profile and plan details.
   */
  getCurrent: protectedProcedure.query(async ({ ctx }) => {
    const tenant = await ctx.db.query.tenants.findFirst({
      where: eq(tenants.id, ctx.tenant.id),
    });

    if (!tenant) throw new TRPCError({ code: "NOT_FOUND" });

    return {
      ...tenant,
      quotas: PLAN_QUOTAS[tenant.plan],
    };
  }),

  /**
   * Update basic business profile fields.
   * Requires admin or owner.
   */
  updateProfile: protectedProcedure
    .use(withAudit)
    .input(
      z.object({
        name: z.string().min(1).max(100).optional(),
        businessEmail: z.string().email().optional(),
        businessPhone: z.string().max(30).optional(),
        timezone: z.string().max(60).optional(),
        locale: z.string().max(10).optional(),
        logoUrl: z.string().url().optional(),
        websiteUrl: z.string().url().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const before = await ctx.db.query.tenants.findFirst({
        where: eq(tenants.id, ctx.tenant.id),
      });

      const [updated] = await ctx.db
        .update(tenants)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(tenants.id, ctx.tenant.id))
        .returning();

      await ctx.audit("tenant.settings_updated", {
        resourceType: "tenant",
        resourceId: ctx.tenant.id,
        before,
        after: updated,
      });

      return updated;
    }),

  /**
   * Get all settings for the current tenant.
   */
  getSettings: protectedProcedure.query(async ({ ctx }) => {
    const settings = await ctx.db.query.tenantSettings.findMany({
      where: eq(tenantSettings.tenantId, ctx.tenant.id),
    });

    // Return as a key-value map for easy consumption
    return Object.fromEntries(settings.map((s) => [s.key, s.value]));
  }),

  /**
   * Upsert a single setting key.
   */
  setSetting: protectedProcedure
    .use(withAudit)
    .input(
      z.object({
        key: z.string().min(1).max(100),
        value: z.unknown(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .insert(tenantSettings)
        .values({
          tenantId: ctx.tenant.id,
          key: input.key,
          value: input.value as Record<string, unknown>,
        })
        .onConflictDoUpdate({
          target: [tenantSettings.tenantId, tenantSettings.key],
          set: {
            value: input.value as Record<string, unknown>,
            updatedAt: new Date(),
          },
        });

      await ctx.audit("tenant.settings_updated", {
        resourceType: "tenant_setting",
        resourceId: input.key,
        after: { key: input.key, value: input.value },
      });

      return { success: true };
    }),
});
