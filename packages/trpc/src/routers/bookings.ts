import { z } from "zod";
import { eq, and, gte, lte, ilike, sql, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  router,
  publicProcedure,
  protectedProcedure,
  manageBookingsProcedure,
  withAudit,
} from "../trpc";
import {
  bookings,
  bookingStatusHistory,
  slotHolds,
  bookingStatusEnum,
  bookingChannelEnum,
} from "@booking-agent/db";

// ─── Shared validators ────────────────────────────────────────────────────────

const customerSchema = z.object({
  customerName: z.string().min(1).max(100),
  customerEmail: z.string().email(),
  customerPhone: z.string().max(30).optional(),
  customerNotes: z.string().max(500).optional(),
});

export const bookingsRouter = router({
  /**
   * List bookings for the current tenant.
   * Supports pagination, date range, status, and search filters.
   */
  list: protectedProcedure
    .input(
      z.object({
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(25),
        status: z.enum(bookingStatusEnum.enumValues).optional(),
        staffId: z.string().uuid().optional(),
        serviceId: z.string().uuid().optional(),
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
        search: z.string().max(100).optional(), // searches customer name/email
      })
    )
    .query(async ({ ctx, input }) => {
      const conditions = [eq(bookings.tenantId, ctx.tenant.id)];

      if (input.status) conditions.push(eq(bookings.status, input.status));
      if (input.staffId) conditions.push(eq(bookings.staffId, input.staffId));
      if (input.serviceId) conditions.push(eq(bookings.serviceId, input.serviceId));
      if (input.from) conditions.push(gte(bookings.startsAt, new Date(input.from)));
      if (input.to) conditions.push(lte(bookings.startsAt, new Date(input.to)));
      if (input.search) {
        conditions.push(
          sql`(${bookings.customerName} ilike ${`%${input.search}%`} OR ${bookings.customerEmail} ilike ${`%${input.search}%`})`
        );
      }

      const offset = (input.page - 1) * input.pageSize;

      const [rows, countResult] = await Promise.all([
        ctx.db.query.bookings.findMany({
          where: and(...conditions),
          with: {
            service: { columns: { name: true, colorHex: true } },
            staff: { columns: { displayName: true } },
          },
          orderBy: (b, { desc }) => desc(b.startsAt),
          limit: input.pageSize,
          offset,
        }),
        ctx.db
          .select({ count: sql<number>`count(*)` })
          .from(bookings)
          .where(and(...conditions)),
      ]);

      return {
        data: rows,
        total: Number(countResult[0]?.count ?? 0),
        page: input.page,
        pageSize: input.pageSize,
      };
    }),

  /**
   * Get a single booking (must belong to current tenant).
   */
  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const booking = await ctx.db.query.bookings.findFirst({
        where: and(
          eq(bookings.id, input.id),
          eq(bookings.tenantId, ctx.tenant.id)
        ),
        with: {
          service: true,
          staff: true,
          statusHistory: {
            orderBy: (h, { asc }) => asc(h.createdAt),
          },
        },
      });

      if (!booking) throw new TRPCError({ code: "NOT_FOUND" });
      return booking;
    }),

  /**
   * Create a new booking from the back office.
   * Includes double-booking protection via transaction + locking.
   */
  create: manageBookingsProcedure
    .use(withAudit)
    .input(
      customerSchema.extend({
        serviceId: z.string().uuid(),
        staffId: z.string().uuid(),
        startsAt: z.string().datetime(),
        endsAt: z.string().datetime(),
        internalNote: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const booking = await createBookingTransaction({
        db: ctx.db,
        tenantId: ctx.tenant.id,
        input,
        channel: "back_office",
        holdToken: null,
      });

      await ctx.audit("booking.created", {
        resourceType: "booking",
        resourceId: booking.id,
        after: booking,
      });

      return booking;
    }),

  /**
   * Create a booking from the public booking site.
   * Requires a valid hold token.
   */
  createPublic: publicProcedure
    .input(
      customerSchema.extend({
        tenantSlug: z.string(),
        serviceId: z.string().uuid(),
        staffId: z.string().uuid(),
        startsAt: z.string().datetime(),
        endsAt: z.string().datetime(),
        holdToken: z.string().uuid(),
        channel: z.enum(["web", "whatsapp", "telegram"]).default("web"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { tenants } = await import("@booking-agent/db");
      const tenant = await ctx.db.query.tenants.findFirst({
        where: eq(tenants.slug, input.tenantSlug),
      });

      if (!tenant) throw new TRPCError({ code: "NOT_FOUND" });

      // Validate hold token
      const hold = await ctx.db.query.slotHolds.findFirst({
        where: and(
          eq(slotHolds.holdToken, input.holdToken),
          eq(slotHolds.tenantId, tenant.id)
        ),
      });

      if (!hold) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid or expired hold token. Please select the time again.",
        });
      }

      if (hold.expiresAt < new Date()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Your slot reservation has expired. Please select the time again.",
        });
      }

      const booking = await createBookingTransaction({
        db: ctx.db,
        tenantId: tenant.id,
        input,
        channel: input.channel,
        holdToken: input.holdToken,
      });

      return booking;
    }),

  /**
   * Cancel a booking.
   */
  cancel: manageBookingsProcedure
    .use(withAudit)
    .input(
      z.object({
        id: z.string().uuid(),
        reason: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.bookings.findFirst({
        where: and(
          eq(bookings.id, input.id),
          eq(bookings.tenantId, ctx.tenant.id)
        ),
      });

      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      if (
        existing.status === "cancelled" ||
        existing.status === "rescheduled"
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Booking is already ${existing.status}.`,
        });
      }

      await ctx.db.transaction(async (tx) => {
        await tx
          .update(bookings)
          .set({ status: "cancelled", updatedAt: new Date() })
          .where(eq(bookings.id, input.id));

        await tx.insert(bookingStatusHistory).values({
          tenantId: ctx.tenant.id,
          bookingId: input.id,
          fromStatus: existing.status,
          toStatus: "cancelled",
          changedBy: `user:${ctx.tenantUser.clerkUserId}`,
          reason: input.reason ?? null,
        });
      });

      await ctx.audit("booking.cancelled", {
        resourceType: "booking",
        resourceId: input.id,
        before: { status: existing.status },
        after: { status: "cancelled" },
        metadata: { reason: input.reason },
      });

      return { success: true };
    }),

  /**
   * Reschedule a booking (cancel original, create new).
   */
  reschedule: manageBookingsProcedure
    .use(withAudit)
    .input(
      z.object({
        id: z.string().uuid(),
        startsAt: z.string().datetime(),
        endsAt: z.string().datetime(),
        reason: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.bookings.findFirst({
        where: and(
          eq(bookings.id, input.id),
          eq(bookings.tenantId, ctx.tenant.id)
        ),
      });

      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      if (
        existing.status === "cancelled" ||
        existing.status === "rescheduled"
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot reschedule a cancelled or already rescheduled booking.",
        });
      }

      let newBooking: typeof bookings.$inferSelect;

      await ctx.db.transaction(async (tx) => {
        // Create the new booking
        const [created] = await tx
          .insert(bookings)
          .values({
            tenantId: ctx.tenant.id,
            serviceId: existing.serviceId,
            staffId: existing.staffId,
            customerName: existing.customerName,
            customerEmail: existing.customerEmail,
            customerPhone: existing.customerPhone,
            customerNotes: existing.customerNotes,
            startsAt: new Date(input.startsAt),
            endsAt: new Date(input.endsAt),
            status: "confirmed",
            channel: existing.channel,
            priceSnapshot: existing.priceSnapshot,
            currency: existing.currency,
            rescheduledFromId: existing.id,
            lastModifiedByUserId: ctx.tenantUser.id,
          })
          .returning();

        newBooking = created!;

        // Mark original as rescheduled
        await tx
          .update(bookings)
          .set({
            status: "rescheduled",
            rescheduledToId: newBooking.id,
            updatedAt: new Date(),
          })
          .where(eq(bookings.id, input.id));

        // Record status history for both
        await tx.insert(bookingStatusHistory).values([
          {
            tenantId: ctx.tenant.id,
            bookingId: input.id,
            fromStatus: existing.status,
            toStatus: "rescheduled",
            changedBy: `user:${ctx.tenantUser.clerkUserId}`,
            reason: input.reason ?? null,
            metadata: { newBookingId: newBooking.id },
          },
          {
            tenantId: ctx.tenant.id,
            bookingId: newBooking.id,
            fromStatus: null,
            toStatus: "confirmed",
            changedBy: `user:${ctx.tenantUser.clerkUserId}`,
            reason: "Rescheduled from original booking",
            metadata: { originalBookingId: input.id },
          },
        ]);
      });

      await ctx.audit("booking.rescheduled", {
        resourceType: "booking",
        resourceId: input.id,
        before: { startsAt: existing.startsAt },
        after: {
          startsAt: input.startsAt,
          newBookingId: newBooking!.id,
        },
      });

      return { success: true, newBookingId: newBooking!.id };
    }),

  /**
   * Add an internal note to a booking.
   */
  addNote: manageBookingsProcedure
    .use(withAudit)
    .input(
      z.object({
        id: z.string().uuid(),
        note: z.string().min(1).max(1000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(bookings)
        .set({
          internalNote: input.note,
          lastModifiedByUserId: ctx.tenantUser.id,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(bookings.id, input.id),
            eq(bookings.tenantId, ctx.tenant.id)
          )
        )
        .returning();

      if (!updated) throw new TRPCError({ code: "NOT_FOUND" });

      await ctx.audit("booking.note_added", {
        resourceType: "booking",
        resourceId: input.id,
        after: { note: input.note },
      });

      return updated;
    }),
});

// ─── Shared transaction helper ────────────────────────────────────────────────

async function createBookingTransaction({
  db,
  tenantId,
  input,
  channel,
  holdToken,
}: {
  db: import("@booking-agent/db").DB;
  tenantId: string;
  input: {
    serviceId: string;
    staffId: string;
    startsAt: string;
    endsAt: string;
    customerName: string;
    customerEmail: string;
    customerPhone?: string;
    customerNotes?: string;
    internalNote?: string;
  };
  channel: typeof bookingChannelEnum.enumValues[number];
  holdToken: string | null;
}) {
  return db.transaction(async (tx) => {
    // STEP 1: Lock the staff row to serialise concurrent booking writes
    // This prevents two simultaneous requests from both passing the conflict check
    await tx.execute(
      sql`SELECT id FROM staff WHERE id = ${input.staffId} FOR UPDATE`
    );

    // STEP 2: Check for overlapping confirmed/pending bookings
    const conflict = await tx.query.bookings.findFirst({
      where: and(
        eq(bookings.tenantId, tenantId),
        eq(bookings.staffId, input.staffId),
        inArray(bookings.status, ["confirmed", "pending"]),
        sql`tstzrange(${bookings.startsAt}, ${bookings.endsAt}) &&
            tstzrange(${new Date(input.startsAt)}, ${new Date(input.endsAt)})`
      ),
    });

    if (conflict) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "This time slot is no longer available. Please choose another.",
      });
    }

    // STEP 3: Insert the booking
    const [booking] = await tx
      .insert(bookings)
      .values({
        tenantId,
        serviceId: input.serviceId,
        staffId: input.staffId,
        customerName: input.customerName,
        customerEmail: input.customerEmail,
        customerPhone: input.customerPhone ?? null,
        customerNotes: input.customerNotes ?? null,
        internalNote: input.internalNote ?? null,
        startsAt: new Date(input.startsAt),
        endsAt: new Date(input.endsAt),
        status: "confirmed",
        channel,
        holdToken,
      })
      .returning();

    // STEP 4: Record initial status history
    await tx.insert(bookingStatusHistory).values({
      tenantId,
      bookingId: booking!.id,
      fromStatus: null,
      toStatus: "confirmed",
      changedBy: channel === "back_office" ? "back_office" : channel,
    });

    // STEP 5: Consume the hold token
    if (holdToken) {
      await tx
        .delete(slotHolds)
        .where(eq(slotHolds.holdToken, holdToken));
    }

    return booking!;
  });
}
