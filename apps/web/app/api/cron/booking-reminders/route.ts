/**
 * Booking reminder cron job.
 *
 * Sends email reminders for confirmed bookings that:
 *   - Start within the next 24 hours (and haven't had a reminder sent yet)
 *   - OR start within the next 2 hours (second reminder threshold)
 *
 * Schedule: run every 30 minutes (configure in vercel.json or external cron).
 * Security: protected by CRON_SECRET header.
 *
 * Usage in vercel.json:
 *   "crons": [{ "path": "/api/cron/booking-reminders", "schedule": "every-30-min" }]
 * (Replace "every-30-min" with the actual cron expression: star/30 star star star star)
 */

import { NextResponse } from "next/server";
import { db, bookings, tenants, services, staff } from "@booking-agent/db";
import { eq, and, gte, lte, isNull, inArray } from "drizzle-orm";
import { sendBookingReminder } from "@booking-agent/trpc/lib/email";
import { sendSmsReminder } from "@booking-agent/trpc/lib/sms";

export const dynamic = "force-dynamic";

const REMINDER_WINDOW_HOURS_1 = 24; // first reminder: 24 h before
const REMINDER_WINDOW_HOURS_2 = 2;  // second reminder: 2 h before (future)
const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(req: Request) {
  // Validate cron secret (skip check in development)
  if (process.env.NODE_ENV === "production") {
    const authHeader = req.headers.get("authorization");
    if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const now = new Date();
  const windowEnd = new Date(now.getTime() + REMINDER_WINDOW_HOURS_1 * 60 * 60 * 1000);

  try {
    // Find confirmed bookings starting in the next 24 hours with no reminder sent
    const upcoming = await db.query.bookings.findMany({
      where: and(
        inArray(bookings.status, ["confirmed", "pending"]),
        gte(bookings.startsAt, now),
        lte(bookings.startsAt, windowEnd),
        isNull(bookings.reminderSentAt)
      ),
      columns: {
        id: true,
        tenantId: true,
        serviceId: true,
        staffId: true,
        customerName: true,
        customerEmail: true,
        customerPhone: true,
        startsAt: true,
        endsAt: true,
      },
    });

    if (upcoming.length === 0) {
      return NextResponse.json({ sent: 0, message: "No upcoming reminders needed." });
    }

    // Group by tenantId to batch-load tenants
    const tenantIds = [...new Set(upcoming.map((b) => b.tenantId))];
    const tenantRows = await db.query.tenants.findMany({
      where: inArray(tenants.id, tenantIds),
      columns: { id: true, name: true, timezone: true },
    });
    const tenantMap = new Map(tenantRows.map((t) => [t.id, t]));

    // Batch-load services and staff
    const serviceIds = [...new Set(upcoming.map((b) => b.serviceId))];
    const staffIds   = [...new Set(upcoming.map((b) => b.staffId))];

    const [serviceRows, staffRows] = await Promise.all([
      db.query.services.findMany({
        where: inArray(services.id, serviceIds),
        columns: { id: true, name: true },
      }),
      db.query.staff.findMany({
        where: inArray(staff.id, staffIds),
        columns: { id: true, displayName: true },
      }),
    ]);

    const serviceMap = new Map(serviceRows.map((s) => [s.id, s.name]));
    const staffMap   = new Map(staffRows.map((s) => [s.id, s.displayName]));

    // Send reminders
    let sent = 0;
    const errors: string[] = [];

    await Promise.allSettled(
      upcoming.map(async (booking) => {
        const tenant = tenantMap.get(booking.tenantId);
        if (!tenant) return;

        const minutesBefore = Math.round(
          (booking.startsAt.getTime() - now.getTime()) / 60_000
        );

        try {
          const reminderData = {
            customerName:  booking.customerName,
            customerEmail: booking.customerEmail,
            businessName:  tenant.name,
            serviceName:   serviceMap.get(booking.serviceId) ?? "Your service",
            staffName:     staffMap.get(booking.staffId) ?? "Your staff",
            startsAt:      booking.startsAt,
            endsAt:        booking.endsAt,
            timezone:      tenant.timezone ?? "UTC",
            bookingId:     booking.id,
            minutesBefore,
          };

          // Email reminder (always attempted)
          await sendBookingReminder(reminderData);

          // SMS reminder (fire-and-forget, only if customer has a phone)
          if (booking.customerPhone) {
            sendSmsReminder(booking.tenantId, {
              to:           booking.customerPhone,
              customerName: booking.customerName,
              businessName: tenant.name,
              serviceName:  serviceMap.get(booking.serviceId) ?? "Your service",
              startsAt:     booking.startsAt,
              timezone:     tenant.timezone ?? "UTC",
              bookingId:    booking.id,
              minutesBefore,
            }).catch((err) => console.error("[sms] reminder failed:", err));
          }

          // Mark reminder as sent
          await db
            .update(bookings)
            .set({ reminderSentAt: now } as any)
            .where(eq(bookings.id, booking.id));

          sent++;
        } catch (err) {
          errors.push(`booking ${booking.id}: ${err}`);
        }
      })
    );

    return NextResponse.json({
      sent,
      errors: errors.length > 0 ? errors : undefined,
      checked: upcoming.length,
    });
  } catch (err) {
    console.error("[cron/booking-reminders]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
