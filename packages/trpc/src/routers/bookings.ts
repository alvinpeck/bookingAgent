import { z } from "zod";
import { eq, and, gte, lte, ilike, sql, inArray, count } from "drizzle-orm";
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
  services,
  staff,
} from "@booking-agent/db";
import {
  sendBookingConfirmation,
  sendBookingCancellation,
} from "../lib/email";

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
        input: input as any,
        channel: "back_office",
        holdToken: null,
      });

      await ctx.audit("booking.created", {
        resourceType: "booking",
        resourceId: booking.id,
        after: booking,
      });

      // Write to Google Calendar (best-effort, non-blocking)
      writeBookingToCalendar(ctx.db, booking, ctx.tenant.timezone ?? "UTC").catch(
        (err) => console.error("[gcal] write-back failed:", err)
      );

      // Send confirmation email (best-effort, non-blocking)
      sendBookingConfirmationForBooking(ctx.db, booking, ctx.tenant).catch(
        (err) => console.error("[email] confirmation failed:", err)
      );

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

      // Verify hold params match request — prevents reusing a hold token
      // with different serviceId/staffId/time than what was originally held
      if (
        hold.serviceId !== input.serviceId ||
        hold.staffId   !== input.staffId   ||
        hold.slotStartAt.getTime() !== new Date(input.startsAt).getTime() ||
        hold.slotEndAt.getTime()   !== new Date(input.endsAt).getTime()
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Booking details do not match your reservation. Please start again.",
        });
      }

      // Verify service and staff belong to this tenant
      const [svc, stf] = await Promise.all([
        ctx.db.query.services.findFirst({
          where: and(eq(services.id, input.serviceId), eq(services.tenantId, tenant.id)),
          columns: { id: true },
        }),
        ctx.db.query.staff.findFirst({
          where: and(eq(staff.id, input.staffId), eq(staff.tenantId, tenant.id)),
          columns: { id: true },
        }),
      ]);

      if (!svc) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid service." });
      if (!stf) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid staff member." });

      const booking = await createBookingTransaction({
        db: ctx.db,
        tenantId: tenant.id,
        input: input as any,
        channel: input.channel as any,
        holdToken: input.holdToken as any,
      });

      // Write to Google Calendar (best-effort, non-blocking)
      writeBookingToCalendar(ctx.db, booking, tenant.timezone ?? "UTC").catch(
        (err) => console.error("[gcal] write-back failed:", err)
      );

      // Send confirmation email (best-effort, non-blocking)
      sendBookingConfirmationForBooking(ctx.db, booking, tenant).catch(
        (err) => console.error("[email] confirmation failed:", err)
      );

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
          .set({ status: "cancelled", updatedAt: new Date() } as any)
          .where(eq(bookings.id, input.id));

        await tx.insert(bookingStatusHistory).values({
          tenantId: ctx.tenant.id,
          bookingId: input.id,
          fromStatus: existing.status,
          toStatus: "cancelled",
          changedBy: `user:${ctx.tenantUser.userId}`,
          reason: input.reason ?? null,
        } as any);
      });

      await ctx.audit("booking.cancelled", {
        resourceType: "booking",
        resourceId: input.id,
        before: { status: existing.status },
        after: { status: "cancelled" },
        metadata: { reason: input.reason },
      });

      // Remove Google Calendar event (best-effort)
      deleteBookingFromCalendar(ctx.db, existing).catch(
        (err) => console.error("[gcal] delete event failed:", err)
      );

      // Send cancellation email (best-effort, non-blocking)
      sendBookingCancellationForBooking(ctx.db, existing, ctx.tenant, input.reason).catch(
        (err) => console.error("[email] cancellation failed:", err)
      );

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
          } as any)
          .returning();

        newBooking = created!;

        // Mark original as rescheduled
        await tx
          .update(bookings)
          .set({
            status: "rescheduled",
            rescheduledToId: newBooking.id,
            updatedAt: new Date(),
          } as any)
          .where(eq(bookings.id, input.id));

        // Record status history for both
        await tx.insert(bookingStatusHistory).values([
          {
            tenantId: ctx.tenant.id,
            bookingId: input.id,
            fromStatus: existing.status,
            toStatus: "rescheduled",
            changedBy: `user:${ctx.tenantUser.userId}`,
            reason: input.reason ?? null,
            metadata: { newBookingId: newBooking.id },
          },
          {
            tenantId: ctx.tenant.id,
            bookingId: newBooking.id,
            fromStatus: null,
            toStatus: "confirmed",
            changedBy: `user:${ctx.tenantUser.userId}`,
            reason: "Rescheduled from original booking",
            metadata: { originalBookingId: input.id },
          },
        ] as any);
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
        } as any)
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

  /**
   * Confirm a pending booking.
   */
  confirm: manageBookingsProcedure
    .use(withAudit)
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.bookings.findFirst({
        where: and(eq(bookings.id, input.id), eq(bookings.tenantId, ctx.tenant.id)),
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      if (existing.status !== "pending") {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Booking is already ${existing.status}.` });
      }

      await ctx.db.transaction(async (tx) => {
        await tx.update(bookings).set({ status: "confirmed", updatedAt: new Date() } as any)
          .where(eq(bookings.id, input.id));
        await tx.insert(bookingStatusHistory).values({
          tenantId: ctx.tenant.id, bookingId: input.id,
          fromStatus: "pending", toStatus: "confirmed",
          changedBy: `user:${ctx.tenantUser.userId}`,
        } as any);
      });

      await ctx.audit("booking.confirmed", {
        resourceType: "booking", resourceId: input.id,
        before: { status: "pending" }, after: { status: "confirmed" },
      });

      return { success: true };
    }),

  /**
   * Mark a booking as completed.
   */
  complete: manageBookingsProcedure
    .use(withAudit)
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.bookings.findFirst({
        where: and(eq(bookings.id, input.id), eq(bookings.tenantId, ctx.tenant.id)),
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      if (!["confirmed", "pending"].includes(existing.status)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Cannot complete a booking with status "${existing.status}".` });
      }

      await ctx.db.transaction(async (tx) => {
        await tx.update(bookings).set({ status: "completed", updatedAt: new Date() } as any)
          .where(eq(bookings.id, input.id));
        await tx.insert(bookingStatusHistory).values({
          tenantId: ctx.tenant.id, bookingId: input.id,
          fromStatus: existing.status, toStatus: "completed",
          changedBy: `user:${ctx.tenantUser.userId}`,
        } as any);
      });

      await ctx.audit("booking.completed", {
        resourceType: "booking", resourceId: input.id,
        before: { status: existing.status }, after: { status: "completed" },
      });

      return { success: true };
    }),

  /**
   * Mark a booking as no-show.
   */
  markNoShow: manageBookingsProcedure
    .use(withAudit)
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.bookings.findFirst({
        where: and(eq(bookings.id, input.id), eq(bookings.tenantId, ctx.tenant.id)),
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      if (!["confirmed", "pending"].includes(existing.status)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Cannot mark a booking with status "${existing.status}" as no-show.` });
      }

      await ctx.db.transaction(async (tx) => {
        await tx.update(bookings).set({ status: "no_show", updatedAt: new Date() } as any)
          .where(eq(bookings.id, input.id));
        await tx.insert(bookingStatusHistory).values({
          tenantId: ctx.tenant.id, bookingId: input.id,
          fromStatus: existing.status, toStatus: "no_show",
          changedBy: `user:${ctx.tenantUser.userId}`,
        } as any);
      });

      await ctx.audit("booking.no_show", {
        resourceType: "booking", resourceId: input.id,
        before: { status: existing.status }, after: { status: "no_show" },
      });

      return { success: true };
    }),

  /**
   * Dashboard stats — counts for today, this month, and upcoming bookings.
   */
  getStats: protectedProcedure.query(async ({ ctx }) => {
    const now   = new Date();
    const tz    = ctx.tenant.timezone ?? "UTC";

    // Today's date string in the tenant's timezone (sv-SE locale gives ISO-like YYYY-MM-DD)
    const todayStr    = now.toLocaleDateString("sv-SE", { timeZone: tz });
    // Use UTC midnight boundaries for "today" — good enough for most timezones
    const todayStartUTC = new Date(`${todayStr}T00:00:00.000Z`);
    const todayEndUTC   = new Date(`${todayStr}T23:59:59.999Z`);

    // This-month boundaries
    const [year, month] = todayStr.split("-").map(Number);
    const monthStart = new Date(Date.UTC(year!, month! - 1, 1));
    const monthEnd   = new Date(Date.UTC(year!, month!, 0, 23, 59, 59, 999));

    const [
      todayRows,
      monthRows,
      upcomingRows,
      pendingRows,
    ] = await Promise.all([
      // Bookings today (confirmed + pending)
      ctx.db
        .select({ cnt: count() })
        .from(bookings)
        .where(and(
          eq(bookings.tenantId, ctx.tenant.id),
          gte(bookings.startsAt, todayStartUTC),
          lte(bookings.startsAt, todayEndUTC),
          inArray(bookings.status, ["confirmed", "pending"]),
        )),
      // Bookings this month (all non-cancelled)
      ctx.db
        .select({ cnt: count() })
        .from(bookings)
        .where(and(
          eq(bookings.tenantId, ctx.tenant.id),
          gte(bookings.startsAt, monthStart),
          lte(bookings.startsAt, monthEnd),
          inArray(bookings.status, ["confirmed", "pending", "completed"]),
        )),
      // Upcoming bookings (next 7 days, confirmed)
      ctx.db.query.bookings.findMany({
        where: and(
          eq(bookings.tenantId, ctx.tenant.id),
          gte(bookings.startsAt, now),
          lte(bookings.startsAt, new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)),
          eq(bookings.status, "confirmed"),
        ),
        with: {
          service: { columns: { name: true, colorHex: true } },
          staff:   { columns: { displayName: true } },
        },
        orderBy: (b, { asc }) => asc(b.startsAt),
        limit: 5,
      }),
      // Pending (awaiting confirmation)
      ctx.db
        .select({ cnt: count() })
        .from(bookings)
        .where(and(
          eq(bookings.tenantId, ctx.tenant.id),
          eq(bookings.status, "pending"),
          gte(bookings.startsAt, now),
        )),
    ]);

    return {
      todayCount:    todayRows[0]?.cnt  ?? 0,
      monthCount:    monthRows[0]?.cnt  ?? 0,
      pendingCount:  pendingRows[0]?.cnt ?? 0,
      upcoming:      upcomingRows,
    };
  }),
});

// ─── Email helpers ────────────────────────────────────────────────────────────

async function sendBookingConfirmationForBooking(
  db: import("@booking-agent/db").DB,
  booking: typeof bookings.$inferSelect,
  tenant: { name: string; timezone: string | null }
): Promise<void> {
  const { services, staff } = await import("@booking-agent/db");
  const [service, staffRow] = await Promise.all([
    db.query.services.findFirst({ where: eq(services.id, booking.serviceId), columns: { name: true } }),
    db.query.staff.findFirst({ where: eq(staff.id, booking.staffId), columns: { displayName: true } }),
  ]);
  await sendBookingConfirmation({
    customerName:  booking.customerName,
    customerEmail: booking.customerEmail,
    businessName:  tenant.name,
    serviceName:   service?.name ?? "Service",
    staffName:     staffRow?.displayName ?? "Staff",
    startsAt:      booking.startsAt,
    endsAt:        booking.endsAt,
    timezone:      tenant.timezone ?? "UTC",
    bookingId:     booking.id,
  });
}

async function sendBookingCancellationForBooking(
  db: import("@booking-agent/db").DB,
  booking: typeof bookings.$inferSelect,
  tenant: { name: string; timezone: string | null },
  reason?: string
): Promise<void> {
  const { services, staff } = await import("@booking-agent/db");
  const [service, staffRow] = await Promise.all([
    db.query.services.findFirst({ where: eq(services.id, booking.serviceId), columns: { name: true } }),
    db.query.staff.findFirst({ where: eq(staff.id, booking.staffId), columns: { displayName: true } }),
  ]);
  await sendBookingCancellation({
    customerName:  booking.customerName,
    customerEmail: booking.customerEmail,
    businessName:  tenant.name,
    serviceName:   service?.name ?? "Service",
    staffName:     staffRow?.displayName ?? "Staff",
    startsAt:      booking.startsAt,
    endsAt:        booking.endsAt,
    timezone:      tenant.timezone ?? "UTC",
    bookingId:     booking.id,
    reason,
  });
}

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
            tstzrange(${input.startsAt}::timestamptz, ${input.endsAt}::timestamptz)`
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
      } as any)
      .returning();

    // STEP 4: Record initial status history
    await tx.insert(bookingStatusHistory).values({
      tenantId,
      bookingId: booking!.id,
      fromStatus: null,
      toStatus: "confirmed",
      changedBy: channel === "back_office" ? "back_office" : channel,
    } as any);

    // STEP 5: Consume the hold token
    if (holdToken) {
      await tx
        .delete(slotHolds)
        .where(eq(slotHolds.holdToken, holdToken));
    }

    return booking!;
  });
}

// ─── Google Calendar write-back helpers ───────────────────────────────────────

async function writeBookingToCalendar(
  db: import("@booking-agent/db").DB,
  booking: typeof bookings.$inferSelect,
  tenantTimezone: string
): Promise<void> {
  const { integrations: integrationsTable, services, staff } =
    await import("@booking-agent/db");
  const { eq, and } = await import("drizzle-orm");

  const integration = await db.query.integrations.findFirst({
    where: and(
      eq(integrationsTable.staffId, booking.staffId),
      eq(integrationsTable.type, "google_calendar"),
      eq(integrationsTable.status, "active")
    ),
    columns: {
      id: true,
      googleCalendarId: true,
      writeBackEnabled: true,
    },
  });
  if (!integration?.writeBackEnabled) return;

  const [service, staffRecord] = await Promise.all([
    db.query.services.findFirst({
      where: eq(services.id, booking.serviceId),
      columns: { name: true },
    }),
    db.query.staff.findFirst({
      where: eq(staff.id, booking.staffId),
      columns: { displayName: true },
    }),
  ]);

  const { getAccessToken, createCalendarEvent, buildBookingEvent } =
    await import("../lib/google-calendar");

  const accessToken = await getAccessToken(integration.id, db);
  const eventId = await createCalendarEvent(
    accessToken,
    integration.googleCalendarId ?? "primary",
    buildBookingEvent({
      serviceName: service?.name ?? "Appointment",
      staffDisplayName: staffRecord?.displayName ?? "Staff",
      customerName: booking.customerName,
      customerEmail: booking.customerEmail,
      startsAt: booking.startsAt,
      endsAt: booking.endsAt,
      timezone: tenantTimezone,
      bookingId: booking.id,
      notes: booking.customerNotes,
    })
  );

  // Persist the event ID so we can delete it on cancellation
  await db
    .update(bookings)
    .set({ googleCalendarEventId: eventId, updatedAt: new Date() } as any)
    .where(eq(bookings.id, booking.id));
}

export async function deleteBookingFromCalendar(
  db: import("@booking-agent/db").DB,
  booking: typeof bookings.$inferSelect
): Promise<void> {
  if (!booking.googleCalendarEventId) return;

  const { integrations: integrationsTable } = await import("@booking-agent/db");
  const { eq, and } = await import("drizzle-orm");

  const integration = await db.query.integrations.findFirst({
    where: and(
      eq(integrationsTable.staffId, booking.staffId),
      eq(integrationsTable.type, "google_calendar"),
      eq(integrationsTable.status, "active")
    ),
    columns: { id: true, googleCalendarId: true },
  });
  if (!integration) return;

  const { getAccessToken, deleteCalendarEvent } = await import("../lib/google-calendar");
  const accessToken = await getAccessToken(integration.id, db);
  await deleteCalendarEvent(
    accessToken,
    integration.googleCalendarId ?? "primary",
    booking.googleCalendarEventId
  );
}
