import { generateText, tool, stepCountIs, jsonSchema } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import { eq, and, notInArray } from "drizzle-orm";
import {
  db as _db,
  services,
  bookings,
  staff,
  serviceStaff,
  availabilityRules,
  tenantSettings,
} from "@booking-agent/db";
import { decrypt } from "./crypto";
import {
  getConversationHistory,
  appendConversationHistory,
} from "./redis";
import { checkQuota, incrementUsage } from "./usage";
import { logger } from "./logger";

export interface AgentOpts {
  tenantId: string;
  channelId: string;
  externalUserId: string;
  platform: "telegram" | "whatsapp";
  messageText: string;
  db: typeof _db;
}

// ─── Day-of-week helpers ──────────────────────────────────────────────────────

const DOW_NAMES = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

type DayOfWeekName = (typeof DOW_NAMES)[number];

function dateToDayOfWeek(dateStr: string): DayOfWeekName {
  const [year, month, day] = dateStr.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const d = new Date(year, month - 1, day);
  return DOW_NAMES[d.getDay()] as DayOfWeekName;
}

function timeToMinutes(t: string): number {
  const parts = t.split(":").map(Number);
  return (parts[0] ?? 0) * 60 + (parts[1] ?? 0);
}

function minutesToAmPm(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const period = h < 12 ? "AM" : "PM";
  const displayH = h % 12 === 0 ? 12 : h % 12;
  const displayM = m.toString().padStart(2, "0");
  return `${displayH}:${displayM} ${period}`;
}

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a helpful booking assistant. You ONLY help with booking appointments — nothing else.
If asked about anything unrelated, politely redirect to booking.

FLOW:
- Greet new users and show menu options
- Collect: service, preferred date, preferred time, name, phone, email
- Show a full summary and ask for confirmation BEFORE calling createBooking
- After booking: show a confirmation with all details

RULES:
- Keep messages short — this is a chat app
- Use plain text only (no markdown)
- Offer numbered choices when listing options
- Show the main menu when user says "hi", "hello", "menu", "start"
- If user seems lost, show the menu

MAIN MENU:
1. Book appointment
2. Check available times
3. View my bookings
4. Cancel a booking`;

// ─── Core agent runner ────────────────────────────────────────────────────────

export async function runBookingAgent(opts: AgentOpts): Promise<string> {
  const { tenantId, channelId, externalUserId, platform, messageText, db } =
    opts;

  // 1. Load API key from tenantSettings (fetch all settings for tenant, then filter)
  const allSettings = await db.query.tenantSettings.findMany({
    where: eq(tenantSettings.tenantId, tenantId),
    columns: { key: true, value: true },
  });

  const anthropicRow = allSettings.find((r) => r.key === "apikey:anthropic");
  const openaiRow = allSettings.find((r) => r.key === "apikey:openai");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let model: any;

  if (anthropicRow?.value) {
    let apiKey: string;
    try {
      apiKey = decrypt(anthropicRow.value as string);
    } catch {
      logger.error("[agent] Failed to decrypt Anthropic API key", { tenantId });
      return "Sorry, there was a configuration error. Please contact support.";
    }
    model = createAnthropic({
      apiKey,
      baseURL: "https://api.anthropic.com/v1",
      // Patch: SDK strips type:"object" from tool input_schema — add it back
      fetch: async (url: RequestInfo | URL, init?: RequestInit) => {
        if (init?.body && typeof init.body === "string") {
          try {
            const body = JSON.parse(init.body);
            if (Array.isArray(body.tools)) {
              body.tools = body.tools.map((t: Record<string, unknown>) => ({
                ...t,
                input_schema: { type: "object", ...(t.input_schema as object ?? {}) },
              }));
              init = { ...init, body: JSON.stringify(body) };
            }
          } catch { /* ignore parse errors */ }
        }
        return globalThis.fetch(url, init);
      },
    })("claude-haiku-4-5-20251001");
  } else if (openaiRow?.value) {
    let apiKey: string;
    try {
      apiKey = decrypt(openaiRow.value as string);
    } catch {
      logger.error("[agent] Failed to decrypt OpenAI API key", { tenantId });
      return "Sorry, there was a configuration error. Please contact support.";
    }
    model = createOpenAI({ apiKey })("gpt-4o-mini");
  } else {
    return "This booking service is not yet configured. Please contact the business directly.";
  }

  // 2. Check AI token quota before doing any work
  const quota = await checkQuota(db, tenantId, "ai_tokens");
  if (!quota.allowed) {
    return "I'm sorry, this service has reached its monthly AI usage limit. Please try again next month or contact the business directly.";
  }

  // 3. Load conversation history
  const history = await getConversationHistory(
    tenantId,
    channelId,
    externalUserId
  );

  // 4. Define tools
  const agentTools = {
    listServices: tool({
      description: "List all active services available for booking.",
      parameters: jsonSchema<Record<string, never>>({ type: "object", properties: {} }),
      execute: async () => {
        const rows = await db.query.services.findMany({
          where: and(
            eq(services.tenantId, tenantId),
            eq(services.status, "active")
          ),
          columns: {
            id: true,
            name: true,
            description: true,
            durationMinutes: true,
            price: true,
            currency: true,
          },
        });
        return rows;
      },
    }),

    checkAvailability: tool({
      description: "Check available time slots for a service on a given date.",
      parameters: jsonSchema<{ serviceId: string; date: string }>({
        type: "object",
        properties: {
          serviceId: { type: "string", description: "The service ID" },
          date: { type: "string", description: "Date in YYYY-MM-DD format" },
        },
        required: ["serviceId", "date"],
      }),
      execute: async ({ serviceId, date }: { serviceId: string; date: string }) => {
        // Get service duration
        const service = await db.query.services.findFirst({
          where: and(
            eq(services.id, serviceId),
            eq(services.tenantId, tenantId)
          ),
          columns: { durationMinutes: true },
        });

        if (!service) {
          return { error: "Service not found" };
        }

        const duration = service.durationMinutes;

        // Get staff for this service
        const staffLinks = await db.query.serviceStaff.findMany({
          where: and(
            eq(serviceStaff.serviceId, serviceId),
            eq(serviceStaff.tenantId, tenantId)
          ),
          columns: { staffId: true },
        });

        if (staffLinks.length === 0) {
          return { slots: [] };
        }

        const dayOfWeek = dateToDayOfWeek(date);

        const allSlots: string[] = [];

        for (const { staffId } of staffLinks) {
          // Get availability rules for this staff on this day
          const rules = await db.query.availabilityRules.findMany({
            where: and(
              eq(availabilityRules.staffId, staffId),
              eq(
                availabilityRules.dayOfWeek,
                dayOfWeek as
                  | "monday"
                  | "tuesday"
                  | "wednesday"
                  | "thursday"
                  | "friday"
                  | "saturday"
                  | "sunday"
              ),
              eq(availabilityRules.isActive, true)
            ),
            columns: { startTime: true, endTime: true },
          });

          // Get existing bookings for this staff (non-cancelled/rescheduled)
          const existingBookings = await db.query.bookings.findMany({
            where: and(
              eq(bookings.staffId, staffId),
              eq(bookings.tenantId, tenantId),
              notInArray(bookings.status, ["cancelled", "rescheduled"])
            ),
            columns: { startsAt: true, endsAt: true },
          });

          const dayStart = new Date(`${date}T00:00:00.000Z`);
          const dayEnd = new Date(`${date}T23:59:59.999Z`);

          // Filter bookings to this date only
          const dayBookings = existingBookings.filter(
            (b) => b.startsAt >= dayStart && b.startsAt <= dayEnd
          );

          for (const rule of rules) {
            const startMin = timeToMinutes(rule.startTime);
            const endMin = timeToMinutes(rule.endTime);

            let cursor = startMin;
            while (cursor + duration <= endMin) {
              const slotEnd = cursor + duration;

              const slotStartDate = new Date(
                `${date}T${String(Math.floor(cursor / 60)).padStart(2, "0")}:${String(cursor % 60).padStart(2, "0")}:00.000Z`
              );
              const slotEndDate = new Date(
                `${date}T${String(Math.floor(slotEnd / 60)).padStart(2, "0")}:${String(slotEnd % 60).padStart(2, "0")}:00.000Z`
              );

              const overlaps = dayBookings.some(
                (b) => b.startsAt < slotEndDate && b.endsAt > slotStartDate
              );

              if (!overlaps) {
                allSlots.push(minutesToAmPm(cursor));
              }

              cursor += duration;
            }
          }
        }

        // Deduplicate and limit to 8 slots
        const unique = [...new Set(allSlots)].slice(0, 8);
        return { slots: unique };
      },
    }),

    createBooking: tool({
      description: "Create a confirmed booking after collecting all details and user confirmation.",
      parameters: jsonSchema<{ serviceId: string; startsAt: string; customerName: string; customerPhone: string; customerEmail: string; notes?: string }>({
        type: "object",
        properties: {
          serviceId: { type: "string" },
          startsAt: { type: "string", description: "ISO 8601 datetime" },
          customerName: { type: "string" },
          customerPhone: { type: "string" },
          customerEmail: { type: "string" },
          notes: { type: "string" },
        },
        required: ["serviceId", "startsAt", "customerName", "customerPhone", "customerEmail"],
      }),
      execute: async ({ serviceId, startsAt, customerName, customerPhone, customerEmail, notes }: { serviceId: string; startsAt: string; customerName: string; customerPhone: string; customerEmail: string; notes?: string }) => {
        // Get service
        const service = await db.query.services.findFirst({
          where: and(
            eq(services.id, serviceId),
            eq(services.tenantId, tenantId)
          ),
          columns: {
            durationMinutes: true,
            name: true,
            price: true,
            currency: true,
          },
        });

        if (!service) {
          return { success: false, error: "Service not found" };
        }

        const startDate = new Date(startsAt);
        const endDate = new Date(
          startDate.getTime() + service.durationMinutes * 60 * 1000
        );

        // Get staff for this service
        const staffLinks = await db.query.serviceStaff.findMany({
          where: and(
            eq(serviceStaff.serviceId, serviceId),
            eq(serviceStaff.tenantId, tenantId)
          ),
          columns: { staffId: true },
        });

        if (staffLinks.length === 0) {
          return {
            success: false,
            error: "No staff available for this service",
          };
        }

        // Find first available staff member (no overlapping booking)
        let assignedStaffId: string | null = null;
        let assignedStaffName: string | null = null;

        for (const { staffId } of staffLinks) {
          const existingForStaff = await db.query.bookings.findMany({
            where: and(
              eq(bookings.staffId, staffId),
              eq(bookings.tenantId, tenantId),
              notInArray(bookings.status, ["cancelled", "rescheduled"])
            ),
            columns: { startsAt: true, endsAt: true },
          });

          const hasConflict = existingForStaff.some(
            (b) => b.startsAt < endDate && b.endsAt > startDate
          );

          if (!hasConflict) {
            assignedStaffId = staffId;

            const staffRow = await db.query.staff.findFirst({
              where: eq(staff.id, staffId),
              columns: { displayName: true },
            });
            assignedStaffName = staffRow?.displayName ?? "Staff";
            break;
          }
        }

        if (!assignedStaffId) {
          return {
            success: false,
            error:
              "No staff available at this time. Please choose a different slot.",
          };
        }

        // Insert booking
        const inserted = await db
          .insert(bookings)
          .values({
            tenantId,
            serviceId,
            staffId: assignedStaffId,
            customerName,
            customerEmail,
            customerPhone,
            customerNotes: notes,
            startsAt: startDate,
            endsAt: endDate,
            status: "confirmed",
            channel: platform,
            priceSnapshot: service.price,
            currency: service.currency,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any)
          .returning({ id: bookings.id });

        const bookingId = inserted[0]?.id;

        return {
          success: true,
          bookingId,
          service: service.name,
          startsAt: startDate.toISOString(),
          endsAt: endDate.toISOString(),
          staffName: assignedStaffName,
          customerName,
        };
      },
    }),

    findBookings: tool({
      description: "Find recent bookings for a customer by phone or email.",
      parameters: jsonSchema<{ phone?: string; email?: string }>({
        type: "object",
        properties: {
          phone: { type: "string", description: "Customer phone number" },
          email: { type: "string", description: "Customer email address" },
        },
      }),
      execute: async ({ phone, email }: { phone?: string; email?: string }) => {
        if (!phone && !email) {
          return {
            bookings: [],
            error: "Please provide a phone number or email address.",
          };
        }

        const rows = await db.query.bookings.findMany({
          where: email
            ? and(
                eq(bookings.tenantId, tenantId),
                eq(bookings.customerEmail, email)
              )
            : and(
                eq(bookings.tenantId, tenantId),
                eq(bookings.customerPhone, phone!)
              ),
          columns: {
            id: true,
            startsAt: true,
            endsAt: true,
            status: true,
            serviceId: true,
          },
          orderBy: (b, { desc }) => [desc(b.startsAt)],
          limit: 5,
        });

        // Enrich with service names
        const enriched = await Promise.all(
          rows.map(async (b) => {
            const svc = await db.query.services.findFirst({
              where: eq(services.id, b.serviceId),
              columns: { name: true },
            });
            return {
              id: b.id,
              serviceName: svc?.name ?? "Unknown",
              startsAt: b.startsAt.toISOString(),
              endsAt: b.endsAt.toISOString(),
              status: b.status,
            };
          })
        );

        return { bookings: enriched };
      },
    }),

    cancelBooking: tool({
      description: "Cancel a booking by ID after verifying the customer phone number.",
      parameters: jsonSchema<{ bookingId: string; customerPhone: string }>({
        type: "object",
        properties: {
          bookingId: { type: "string", description: "The booking ID to cancel" },
          customerPhone: { type: "string", description: "Customer phone number for verification" },
        },
        required: ["bookingId", "customerPhone"],
      }),
      execute: async ({ bookingId, customerPhone }: { bookingId: string; customerPhone: string }) => {
        const booking = await db.query.bookings.findFirst({
          where: and(
            eq(bookings.id, bookingId),
            eq(bookings.tenantId, tenantId)
          ),
          columns: { id: true, customerPhone: true, status: true },
        });

        if (!booking) {
          return { success: false, error: "Booking not found." };
        }

        if (booking.customerPhone !== customerPhone) {
          return {
            success: false,
            error: "Phone number does not match. Cannot cancel this booking.",
          };
        }

        if (booking.status === "cancelled") {
          return {
            success: false,
            error: "This booking is already cancelled.",
          };
        }

        await db
          .update(bookings)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .set({ status: "cancelled", updatedAt: new Date() } as any)
          .where(eq(bookings.id, bookingId));

        return {
          success: true,
          message: "Your booking has been cancelled successfully.",
        };
      },
    }),
  };

  // 5. Call generateText
  let replyText: string;
  try {
    const result = await generateText({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      model: model as any,
      system: SYSTEM_PROMPT,
      messages: [...history, { role: "user", content: messageText }],
      tools: agentTools,
      stopWhen: stepCountIs(5),
    });
    replyText =
      result.text ||
      "I'm sorry, I couldn't generate a response. Please try again.";

    // 6. Track usage — fire-and-forget (don't fail the response on metering errors)
    const totalTokens = result.usage?.totalTokens ?? 1;
    void incrementUsage(db, tenantId, "ai_tokens", totalTokens).catch((err) =>
      logger.error("[agent] Failed to meter ai_tokens", { tenantId, err: String(err) })
    );
    void incrementUsage(
      db,
      tenantId,
      platform === "telegram" ? "telegram_messages" : "whatsapp_messages",
      1
    ).catch((err) =>
      logger.error("[agent] Failed to meter message count", { tenantId, platform, err: String(err) })
    );
  } catch (err) {
    logger.error("[agent] generateText error", { tenantId, channelId, err: String(err) });
    replyText =
      "Sorry, I'm having trouble right now. Please try again in a moment.";
  }

  // 7. Append to history
  await appendConversationHistory(
    tenantId,
    channelId,
    externalUserId,
    messageText,
    replyText
  );

  return replyText;
}
