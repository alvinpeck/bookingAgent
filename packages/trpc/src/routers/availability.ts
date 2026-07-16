import { z } from "zod";
import { eq, and, gte, lte, lt, gt, sql } from "drizzle-orm";
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
  bookings,
  services,
  staff as staffTable,
  tenants,
  dayOfWeekEnum,
  HOLD_DURATION_SECONDS,
} from "@booking-agent/db";

// ─── Slot Engine Helpers ──────────────────────────────────────────────────────

const DAY_NAMES = [
  "sunday", "monday", "tuesday", "wednesday",
  "thursday", "friday", "saturday",
] as const;

/**
 * Convert a naive local date+time string to a UTC Date, respecting the
 * given IANA timezone. Works by measuring the UTC offset at that instant
 * using Intl.DateTimeFormat (no external dependencies required).
 */
function localToUTC(dateStr: string, timeStr: string, tz: string): Date {
  // Treat the target date+time as if it were UTC first
  const asUTC = new Date(`${dateStr}T${timeStr}:00Z`);
  // Format that UTC instant in the target timezone (sv-SE gives ISO-like output)
  const formatted = new Intl.DateTimeFormat("sv-SE", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).format(asUTC);
  // Parse the formatted local time back as if it were UTC to get the local instant
  const asLocal = new Date(formatted.replace(" ", "T") + "Z");
  // The offset tells us how far asUTC is from the true local time
  const offsetMs = asUTC.getTime() - asLocal.getTime();
  return new Date(asUTC.getTime() + offsetMs);
}

/** Get the tenant's timezone-local date string (YYYY-MM-DD) for a given UTC instant. */
function utcToLocalDate(utc: Date, tz: string): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(utc).slice(0, 10);
}

/** Enumerate dates from fromDate to toDate inclusive (YYYY-MM-DD strings). */
function dateRange(from: string, to: string): string[] {
  const dates: string[] = [];
  const cur = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cur <= end) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}

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
      // Validate: endTime must be after startTime
      for (const rule of input.rules) {
        if (rule.endTime <= rule.startTime) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `End time must be after start time on ${rule.dayOfWeek}`,
          });
        }
      }

      // Validate: no overlapping windows on the same day
      const byDay: Record<string, { startTime: string; endTime: string }[]> = {};
      for (const rule of input.rules) {
        (byDay[rule.dayOfWeek] ??= []).push({ startTime: rule.startTime, endTime: rule.endTime });
      }
      for (const [day, dayRules] of Object.entries(byDay)) {
        const sorted = [...dayRules].sort((a, b) => a.startTime.localeCompare(b.startTime));
        for (let i = 0; i < sorted.length - 1; i++) {
          if (sorted[i + 1]!.startTime < sorted[i]!.endTime) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Overlapping time slots detected on ${day}. Please ensure slots don't overlap.`,
            });
          }
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
            })) as any
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
        } as any)
        .onConflictDoUpdate({
          target: [availabilityOverrides.staffId, availabilityOverrides.overrideDate],
          set: {
            isBlocked: input.isBlocked,
            startTime: input.startTime ?? null,
            endTime: input.endTime ?? null,
            reason: input.reason ?? null,
          } as any,
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

      // Verify service and staff belong to this tenant (prevents cross-tenant hold injection)
      const [svc, stf] = await Promise.all([
        ctx.db.query.services.findFirst({
          where: and(eq(services.id, input.serviceId), eq(services.tenantId, tenant.id)),
          columns: { id: true },
        }),
        ctx.db.query.staff.findFirst({
          where: and(eq(staffTable.id, input.staffId), eq(staffTable.tenantId, tenant.id)),
          columns: { id: true },
        }),
      ]);

      if (!svc) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid service." });
      if (!stf) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid staff member." });

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
      } as any);

      return {
        holdToken,
        expiresAt: expiresAt.toISOString(),
        holdDurationSeconds: HOLD_DURATION_SECONDS,
      };
    }),

  /**
   * Phase 5 — Slot Engine.
   *
   * Returns available booking slots for a given staff member + service
   * over a date range (max 60 days). Accounts for:
   *   - Weekly availability rules (stored in tenant's local timezone)
   *   - One-off date overrides (blocked days or custom hours)
   *   - Existing confirmed/pending bookings
   *   - Active slot holds (not yet expired)
   */
  getSlots: publicProcedure
    .input(
      z.object({
        tenantSlug: z.string(),
        staffId: z.string().uuid(),
        serviceId: z.string().uuid(),
        from: z.string().date(),
        to: z.string().date(),
      }).refine(({ from, to }) => {
        const days = (new Date(`${to}T00:00:00Z`).getTime() -
          new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000;
        return days >= 0 && days <= 60;
      }, { message: "Date range must be between 1 and 60 days" })
    )
    .query(async ({ ctx, input }) => {
      // ── 1. Resolve tenant ────────────────────────────────────────────────────
      const tenant = await ctx.db.query.tenants.findFirst({
        where: eq(tenants.slug, input.tenantSlug),
      });
      if (!tenant) throw new TRPCError({ code: "NOT_FOUND", message: "Tenant not found" });

      // ── 2. Resolve service ───────────────────────────────────────────────────
      const service = await ctx.db.query.services.findFirst({
        where: and(eq(services.id, input.serviceId), eq(services.tenantId, tenant.id)),
      });
      if (!service) throw new TRPCError({ code: "NOT_FOUND", message: "Service not found" });

      const slotMinutes = service.durationMinutes + service.bufferAfterMinutes;
      const tz = tenant.timezone ?? "UTC";

      // ── 3. Fetch availability rules for this staff member ────────────────────
      const rules = await ctx.db.query.availabilityRules.findMany({
        where: and(
          eq(availabilityRules.tenantId, tenant.id),
          eq(availabilityRules.staffId, input.staffId),
          eq(availabilityRules.isActive, true)
        ),
        orderBy: (r, { asc }) => asc(r.startTime),
      });
      // Group rules by day — multiple windows per day are supported
      const rulesByDay: Record<string, typeof rules> = {};
      for (const r of rules) {
        (rulesByDay[r.dayOfWeek] ??= []).push(r);
      }

      // ── 4. Fetch overrides in range ──────────────────────────────────────────
      const overrides = await ctx.db.query.availabilityOverrides.findMany({
        where: and(
          eq(availabilityOverrides.tenantId, tenant.id),
          eq(availabilityOverrides.staffId, input.staffId),
          gte(availabilityOverrides.overrideDate, input.from),
          lte(availabilityOverrides.overrideDate, input.to)
        ),
      });
      const overrideByDate = Object.fromEntries(
        overrides.map((o) => [o.overrideDate, o])
      );

      // ── 5. Fetch existing bookings in range ──────────────────────────────────
      const windowStart = localToUTC(input.from, "00:00", tz);
      const windowEnd = localToUTC(input.to, "23:59", tz);
      windowEnd.setMinutes(windowEnd.getMinutes() + 1);

      const existingBookings = await ctx.db.query.bookings.findMany({
        where: and(
          eq(bookings.tenantId, tenant.id),
          eq(bookings.staffId, input.staffId),
          gte(bookings.startsAt, windowStart),
          lt(bookings.startsAt, windowEnd),
        ),
        columns: { startsAt: true, endsAt: true, status: true },
      });
      const activeBookings = existingBookings.filter(
        (b) => b.status !== "cancelled" && b.status !== "rescheduled"
      );

      // ── 6. Fetch active slot holds in range ──────────────────────────────────
      const now = new Date();
      const activeHolds = await ctx.db.query.slotHolds.findMany({
        where: and(
          eq(slotHolds.tenantId, tenant.id),
          eq(slotHolds.staffId, input.staffId),
          gte(slotHolds.slotStartAt, windowStart),
          lt(slotHolds.slotStartAt, windowEnd),
          gt(slotHolds.expiresAt, now)
        ),
        columns: { slotStartAt: true, slotEndAt: true },
      });

      // ── 6b. Fetch Google Calendar free/busy for this staff member ────────────
      let gcalBusy: { start: Date; end: Date }[] = [];
      try {
        const { integrations: integrationsTable } = await import("@booking-agent/db");
        const integration = await ctx.db.query.integrations.findFirst({
          where: and(
            eq(integrationsTable.staffId, input.staffId),
            eq(integrationsTable.type, "google_calendar"),
            eq(integrationsTable.status, "active")
          ),
          columns: { id: true, googleCalendarId: true },
        });
        if (integration) {
          const { getAccessToken, getFreeBusy } = await import("../lib/google-calendar");
          const accessToken = await getAccessToken(integration.id, ctx.db);
          gcalBusy = await getFreeBusy(
            accessToken,
            integration.googleCalendarId ?? "primary",
            windowStart,
            windowEnd
          );
        }
      } catch {
        // Never break slot generation due to calendar errors
      }

      // ── 7. Overlap detection ─────────────────────────────────────────────────
      type Interval = { start: Date; end: Date };
      const blocked: Interval[] = [
        ...activeBookings.map((b) => ({ start: b.startsAt, end: b.endsAt })),
        ...activeHolds.map((h) => ({ start: h.slotStartAt, end: h.slotEndAt })),
        ...gcalBusy,
      ];

      function overlaps(slotStart: Date, slotEnd: Date): boolean {
        return blocked.some((b) => slotStart < b.end && slotEnd > b.start);
      }

      // ── 8. Generate slots per date ───────────────────────────────────────────
      const slots: { startsAt: string; endsAt: string }[] = [];

      for (const dateStr of dateRange(input.from, input.to)) {
        const override = overrideByDate[dateStr];
        if (override?.isBlocked) continue;

        // Build a list of { startTime, endTime } windows for this date.
        // Overrides provide a single custom window; weekly rules can have many.
        let windows: { startTime: string; endTime: string }[];

        if (override && !override.isBlocked && override.startTime && override.endTime) {
          windows = [{
            startTime: (override.startTime as string).slice(0, 5),
            endTime:   (override.endTime as string).slice(0, 5),
          }];
        } else {
          const jsDay = new Date(`${dateStr}T12:00:00Z`).getUTCDay();
          const dayName = DAY_NAMES[jsDay];
          const dayRules = rulesByDay[dayName ?? ""] ?? [];
          if (!dayRules.length) continue;
          windows = dayRules.map((r) => ({
            startTime: (r.startTime as string).slice(0, 5),
            endTime:   (r.endTime as string).slice(0, 5),
          }));
        }

        // Generate slots for each time window (supports multiple per day)
        for (const { startTime, endTime } of windows) {
          const dayStart = localToUTC(dateStr, startTime, tz);
          const dayEnd   = localToUTC(dateStr, endTime, tz);

          let cursor = new Date(dayStart);
          while (cursor.getTime() + slotMinutes * 60_000 <= dayEnd.getTime()) {
            const slotStart      = new Date(cursor);
            const slotEnd        = new Date(cursor.getTime() + slotMinutes * 60_000);
            const appointmentEnd = new Date(cursor.getTime() + service.durationMinutes * 60_000);

            // Skip slots in the past (1 min grace)
            if (slotStart.getTime() < now.getTime() - 60_000) {
              cursor = slotEnd;
              continue;
            }

            if (!overlaps(slotStart, slotEnd)) {
              slots.push({
                startsAt: slotStart.toISOString(),
                endsAt:   appointmentEnd.toISOString(),
              });
            }

            cursor = slotEnd;
          }
        }
      }

      return { slots, timezone: tz };
    }),

  /**
   * Return the list of countries supported by Nager.Date so the UI only shows
   * countries that will actually resolve without a 404.
   */
  listAvailableCountries: protectedProcedure.query(async () => {
    const resp = await fetch("https://date.nager.at/api/v3/AvailableCountries");
    if (!resp.ok) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Could not fetch country list from Nager.Date." });
    }
    const data = await resp.json() as Array<{ countryCode: string; name: string }>;
    return data.map((c) => ({ code: c.countryCode, name: c.name }));
  }),

  /**
   * Preview public holidays for a given country and year without writing to the DB.
   * Fetches from the free Nager.Date API (no auth required, CORS-friendly).
   */
  previewHolidays: protectedProcedure
    .input(
      z.object({
        countryCode: z.string().length(2).toUpperCase(),
        year: z.number().int().min(2020).max(2035),
      })
    )
    .query(async ({ input }) => {
      const resp = await fetch(
        `https://date.nager.at/api/v3/PublicHolidays/${input.year}/${input.countryCode}`
      );

      // Nager.at returns 404 for unsupported countries and sometimes 200 with an
      // empty body for years whose data hasn't been published yet. Handle both.
      const text = await resp.text();
      if (!resp.ok || !text.trim()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: resp.status === 404
            ? `Country code "${input.countryCode}" is not supported by Nager.Date.`
            : `Holiday data for ${input.countryCode} ${input.year} is not yet available.`,
        });
      }

      let data: Array<{ date: string; localName: string; name: string; types: string[] }>;
      try {
        data = JSON.parse(text);
      } catch {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Holiday data for ${input.countryCode} ${input.year} is not yet available.`,
        });
      }

      if (!Array.isArray(data) || data.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `No holidays found for ${input.countryCode} ${input.year}. The year may not be published yet.`,
        });
      }

      // Nager.at can return multiple entries per date (national + regional variants).
      // Deduplicate by date, keeping the first (national-level) entry.
      const seen = new Set<string>();
      return data
        .filter((h) => {
          if (seen.has(h.date)) return false;
          seen.add(h.date);
          return true;
        })
        .map((h) => ({
          date: h.date,
          name: h.localName || h.name,
          englishName: h.name,
        }));
    }),

  /**
   * Import public holidays as blocked overrides for ALL active staff in the tenant.
   * Uses onConflictDoUpdate so existing overrides on the same date are always forced blocked.
   */
  importHolidays: protectedProcedure
    .use(withAudit)
    .input(
      z.object({
        countryCode: z.string().length(2).toUpperCase(),
        year: z.number().int().min(2020).max(2035),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Fetch holidays
      const resp = await fetch(
        `https://date.nager.at/api/v3/PublicHolidays/${input.year}/${input.countryCode}`
      );
      const text = await resp.text();
      if (!resp.ok || !text.trim()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: resp.status === 404
            ? `Country code "${input.countryCode}" is not supported.`
            : `Holiday data for ${input.countryCode} ${input.year} is not yet available.`,
        });
      }
      let raw: Array<{ date: string; localName: string; name: string }>;
      try {
        raw = JSON.parse(text);
      } catch {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Holiday data for ${input.countryCode} ${input.year} is not yet available.`,
        });
      }
      if (!Array.isArray(raw)) raw = [];
      // Deduplicate by date (Nager.at may return national + regional variants for the same date)
      const seen = new Set<string>();
      const holidays = raw.filter((h) => {
        if (seen.has(h.date)) return false;
        seen.add(h.date);
        return true;
      });

      if (!holidays.length) return { imported: 0, staffCount: 0, holidaysCount: 0 };

      // Get all active staff for this tenant
      const allStaff = await ctx.db.query.staff.findMany({
        where: and(
          eq(staffTable.tenantId, ctx.tenant.id),
          eq(staffTable.isActive, true)
        ),
        columns: { id: true },
      });

      if (!allStaff.length) return { imported: 0, staffCount: 0, holidaysCount: holidays.length };

      // Build one override per staff × holiday
      const values = allStaff.flatMap((s) =>
        holidays.map((h) => ({
          tenantId:     ctx.tenant.id,
          staffId:      s.id,
          overrideDate: h.date,
          isBlocked:    true as const,
          startTime:    null as string | null,
          endTime:      null as string | null,
          reason:       `Public Holiday: ${h.localName || h.name}`,
        }))
      );

      // Insert — when a holiday conflicts with an existing override, force it blocked.
      // A custom override on a public holiday should still result in the day being blocked.
      await ctx.db
        .insert(availabilityOverrides)
        .values(values as any)
        .onConflictDoUpdate({
          target: [availabilityOverrides.staffId, availabilityOverrides.overrideDate],
          set: {
            isBlocked:  true,
            startTime:  null,
            endTime:    null,
            reason:     sql`excluded.reason`,
          },
        });

      await ctx.audit("availability.updated", {
        resourceType: "availability_override",
        resourceId:   ctx.tenant.id,
        after: {
          countryCode:   input.countryCode,
          year:          input.year,
          holidaysCount: holidays.length,
          staffCount:    allStaff.length,
        },
      });

      return {
        imported:      values.length,
        staffCount:    allStaff.length,
        holidaysCount: holidays.length,
      };
    }),

  /**
   * Block a manually provided list of dates for ALL active staff in the tenant.
   * Used when a country isn't covered by Nager.Date.
   */
  blockDatesForAllStaff: protectedProcedure
    .use(withAudit)
    .input(
      z.object({
        dates: z
          .array(
            z.object({
              date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
              name: z.string().max(120).optional(),
            })
          )
          .min(1)
          .max(366),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const allStaff = await ctx.db.query.staff.findMany({
        where: and(
          eq(staffTable.tenantId, ctx.tenant!.id),
          eq(staffTable.isActive, true)
        ),
        columns: { id: true },
      });

      if (!allStaff.length) return { imported: 0, staffCount: 0 };

      const values = allStaff.flatMap((s) =>
        input.dates.map((d) => ({
          tenantId:     ctx.tenant!.id,
          staffId:      s.id,
          overrideDate: d.date,
          isBlocked:    true as const,
          startTime:    null as string | null,
          endTime:      null as string | null,
          reason:       d.name ? `Public Holiday: ${d.name}` : "Public Holiday",
        }))
      );

      await ctx.db
        .insert(availabilityOverrides)
        .values(values as any)
        .onConflictDoUpdate({
          target: [availabilityOverrides.staffId, availabilityOverrides.overrideDate],
          set: {
            isBlocked: true,
            startTime: null,
            endTime:   null,
            reason:    sql`excluded.reason`,
          },
        });

      await ctx.audit("availability.updated", {
        resourceType: "availability_override",
        resourceId:   ctx.tenant!.id,
        after: { datesCount: input.dates.length, staffCount: allStaff.length },
      });

      return { imported: values.length, staffCount: allStaff.length };
    }),
});
