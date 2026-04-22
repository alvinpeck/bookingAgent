import { z } from "zod";
import { eq, and, gte, lte, gt } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  router,
  publicProcedure,
  protectedProcedure,
  withAudit,
} from "../trpc";
import {
  availabilityRules,
  availabilityOverrides,
  slotHolds,
  dayOfWeekEnum,
  HOLD_DURATION_SECONDS,
} from "@booking-agent/db";

export const availabilityRouter = router({
  /**
   * Get all availability rules for a staff member.
   */
  getRules: protectedProcedure
    .input(z.object({ staffId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.availabilityRules.findMany({
        where: and(
          eq(availabilityRules.tenantId, ctx.tenant.id),
          eq(availabilityRules.staffId, input.staffId),
          eq(availabilityRules.isActive, true)
        ),
        orderBy: (r, { asc }) => asc(r.dayOfWeek),
      });
    }),

  /**
   * Replace all availability rules for a staff member.
   * This is an atomic replace — delete all existing, insert new set.
   */
  setRules: protectedProcedure
    .use(withAudit)
    .input(
      z.object({
        staffId: z.string().uuid(),
        rules: z.array(
          z.object({
            dayOfWeek: z.enum(dayOfWeekEnum.enumValues),
            startTime: z
              .string()
              .regex(/^\d{2}:\d{2}$/, "Time must be in HH:MM format"),
            endTime: z
              .string()
              .regex(/^\d{2}:\d{2}$/, "Time must be in HH:MM format"),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Validate times (endTime must be after startTime)
      for (const rule of input.rules) {
        if (rule.endTime <= rule.startTime) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `End time must be after start time on ${rule.dayOfWeek}`,
          });
        }
      }

      await ctx.db.transaction(async (tx) => {
        // Delete existing rules for this staff member
        await tx
          .delete(availabilityRules)
          .where(
            and(
              eq(availabilityRules.tenantId, ctx.tenant.id),
              eq(availabilityRules.staffId, input.staffId)
            )
          );

        // Insert new rules
        if (input.rules.length > 0) {
          await tx.insert(availabilityRules).values(
            input.rules.map((rule) => ({
              tenantId: ctx.tenant.id,
              staffId: input.staffId,
              ...rule,
              isActive: true,
            }))
          );
        }
      });

      await ctx.audit("availability.updated", {
        resourceType: "availability_rules",
        resourceId: input.staffId,
        after: { rulesCount: input.rules.length },
      });

      return { success: true };
    }),

  /**
   * Get availability overrides for a staff member in a date range.
   */
  getOverrides: protectedProcedure
    .input(
      z.object({
        staffId: z.string().uuid(),
        from: z.string().date(),
        to: z.string().date(),
      })
    )
    .query(async ({ ctx, input }) => {
      return ctx.db.query.availabilityOverrides.findMany({
        where: and(
          eq(availabilityOverrides.tenantId, ctx.tenant.id),
          eq(availabilityOverrides.staffId, input.staffId),
          gte(availabilityOverrides.overrideDate, input.from),
          lte(availabilityOverrides.overrideDate, input.to)
        ),
      });
    }),

  /**
   * Create or update a date override for a staff member.
   */
  upsertOverride: protectedProcedure
    .use(withAudit)
    .input(
      z.object({
        staffId: z.string().uuid(),
        overrideDate: z.string().date(),
        isBlocked: z.boolean(),
        startTime: z
          .string()
          .regex(/^\d{2}:\d{2}$/)
          .optional(),
        endTime: z
          .string()
          .regex(/^\d{2}:\d{2}$/)
          .optional(),
        reason: z.string().max(200).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!input.isBlocked && (!input.startTime || !input.endTime)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "startTime and endTime are required when isBlocked is false.",
        });
      }

      const [upserted] = await ctx.db
        .insert(availabilityOverrides)
        .values({
          tenantId: ctx.tenant.id,
          staffId: input.staffId,
          overrideDate: input.overrideDate,
          isBlocked: input.isBlocked,
          startTime: input.startTime ?? null,
          endTime: input.endTime ?? null,
          reason: input.reason ?? null,
        })
        .onConflictDoUpdate({
          target: [availabilityOverrides.staffId, availabilityOverrides.overrideDate],
          set: {
            isBlocked: input.isBlocked,
            startTime: input.startTime ?? null,
            endTime: input.endTime ?? null,
            reason: input.reason ?? null,
          },
        })
        .returning();

      await ctx.audit("override.created", {
        resourceType: "availability_override",
        resourceId: upserted!.id,
        after: upserted,
      });

      return upserted;
    }),

  /**
   * Delete a date override.
   */
  deleteOverride: protectedProcedure
    .use(withAudit)
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [deleted] = await ctx.db
        .delete(availabilityOverrides)
        .where(
          and(
            eq(availabilityOverrides.id, input.id),
            eq(availabilityOverrides.tenantId, ctx.tenant.id)
          )
        )
        .returning();

      if (!deleted) throw new TRPCError({ code: "NOT_FOUND" });

      await ctx.audit("override.deleted", {
        resourceType: "availability_override",
        resourceId: input.id,
      });

      return { success: true };
    }),

  /**
   * Acquire a short-lived slot hold.
   * Called when a customer picks a time on the booking site but hasn't
   * completed the form yet. Prevents the slot from being double-booked
   * in the next 5 minutes.
   */
  holdSlot: publicProcedure
    .input(
      z.object({
        tenantSlug: z.string(),
        staffId: z.string().uuid(),
        serviceId: z.string().uuid(),
        slotStartAt: z.string().datetime(),
        slotEndAt: z.string().datetime(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { tenants } = await import("@booking-agent/db");
      const tenant = await ctx.db.query.tenants.findFirst({
        where: eq(tenants.slug, input.tenantSlug),
      });

      if (!tenant) throw new TRPCError({ code: "NOT_FOUND" });

      // Check for existing hold on this slot
      const existing = await ctx.db.query.slotHolds.findFirst({
        where: and(
          eq(slotHolds.tenantId, tenant.id),
          eq(slotHolds.staffId, input.staffId),
          eq(slotHolds.slotStartAt, new Date(input.slotStartAt)),
          gt(slotHolds.expiresAt, new Date())
        ),
      });

      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "This slot has just been taken. Please choose another time.",
        });
      }

      const holdToken = crypto.randomUUID();
      const expiresAt = new Date(
        Date.now() + HOLD_DURATION_SECONDS * 1000
      );

      await ctx.db.insert(slotHolds).values({
        tenantId: tenant.id,
        staffId: input.staffId,
        serviceId: input.serviceId,
        slotStartAt: new Date(input.slotStartAt),
        slotEndAt: new Date(input.slotEndAt),
        holdToken,
        expiresAt,
      });

      return {
        holdToken,
        expiresAt: expiresAt.toISOString(),
        holdDurationSeconds: HOLD_DURATION_SECONDS,
      };
    }),
});
