/**
 * Google Calendar API client.
 *
 * Handles token refresh, free/busy queries, and event CRUD.
 * All token storage uses AES-256-GCM encryption via packages/trpc/src/lib/crypto.ts.
 */

import { eq } from "drizzle-orm";
import { encrypt, decrypt } from "./crypto";
import type { DB } from "@booking-agent/db";
import { integrations } from "@booking-agent/db";

const GCAL_BASE = "https://www.googleapis.com/calendar/v3";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
// Refresh 5 min before actual expiry to avoid races
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GCalEvent {
  summary: string;
  description?: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  attendees?: Array<{ email: string; displayName?: string }>;
  extendedProperties?: {
    private?: Record<string, string>;
  };
}

export interface FreeBusyInterval {
  start: Date;
  end: Date;
}

// ─── Token helpers ────────────────────────────────────────────────────────────

async function refreshAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  expiresAt: Date;
}> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Token refresh failed: ${res.status} ${body}`);
  }

  const json = (await res.json()) as { access_token: string; expires_in: number };
  return {
    accessToken: json.access_token,
    expiresAt: new Date(Date.now() + json.expires_in * 1000),
  };
}

/**
 * Returns a fresh access token for the given integration, refreshing and
 * persisting updated tokens to the DB if needed.
 */
export async function getAccessToken(
  integrationId: string,
  db: DB
): Promise<string> {
  const integration = await db.query.integrations.findFirst({
    where: eq(integrations.id, integrationId),
    columns: {
      id: true,
      encryptedAccessToken: true,
      encryptedRefreshToken: true,
      tokenExpiresAt: true,
      status: true,
    },
  });

  if (!integration || integration.status === "revoked") {
    throw new Error("Integration not found or revoked");
  }
  if (!integration.encryptedAccessToken || !integration.encryptedRefreshToken) {
    throw new Error("Integration tokens missing");
  }

  const needsRefresh =
    !integration.tokenExpiresAt ||
    integration.tokenExpiresAt.getTime() - Date.now() < REFRESH_BUFFER_MS;

  if (!needsRefresh) {
    return decrypt(integration.encryptedAccessToken);
  }

  const refreshToken = decrypt(integration.encryptedRefreshToken);
  const { accessToken, expiresAt } = await refreshAccessToken(refreshToken);

  // Persist refreshed token — Google may or may not issue a new refresh token
  await db
    .update(integrations)
    .set({
      encryptedAccessToken: encrypt(accessToken),
      tokenExpiresAt: expiresAt,
      status: "active",
      updatedAt: new Date(),
    } as any)
    .where(eq(integrations.id, integrationId));

  return accessToken;
}

// ─── Free/Busy ────────────────────────────────────────────────────────────────

/**
 * Returns busy time blocks from Google Calendar for the given window.
 * Safe to call — returns [] on any error to avoid breaking the slot engine.
 */
export async function getFreeBusy(
  accessToken: string,
  calendarId: string,
  timeMin: Date,
  timeMax: Date
): Promise<FreeBusyInterval[]> {
  const res = await fetch(`${GCAL_BASE}/freeBusy`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      items: [{ id: calendarId }],
    }),
  });

  if (!res.ok) return [];

  const json = (await res.json()) as {
    calendars?: Record<string, { busy?: Array<{ start: string; end: string }> }>;
  };

  const busy = json.calendars?.[calendarId]?.busy ?? [];
  return busy.map((b) => ({ start: new Date(b.start), end: new Date(b.end) }));
}

// ─── Events ───────────────────────────────────────────────────────────────────

export async function createCalendarEvent(
  accessToken: string,
  calendarId: string,
  event: GCalEvent
): Promise<string> {
  const res = await fetch(
    `${GCAL_BASE}/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
    }
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Create event failed: ${res.status} ${body}`);
  }

  const json = (await res.json()) as { id: string };
  return json.id;
}

export async function deleteCalendarEvent(
  accessToken: string,
  calendarId: string,
  eventId: string
): Promise<void> {
  const res = await fetch(
    `${GCAL_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  // 404 = already deleted, treat as success
  if (!res.ok && res.status !== 404) {
    const body = await res.text();
    throw new Error(`Delete event failed: ${res.status} ${body}`);
  }
}

export async function listCalendars(
  accessToken: string
): Promise<Array<{ id: string; summary: string; primary?: boolean }>> {
  const res = await fetch(`${GCAL_BASE}/users/me/calendarList`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) return [];

  const json = (await res.json()) as {
    items?: Array<{ id: string; summary: string; primary?: boolean }>;
  };

  return (json.items ?? []).map((c) => ({
    id: c.id,
    summary: c.summary,
    primary: c.primary,
  }));
}

// ─── Booking event builder ────────────────────────────────────────────────────

export function buildBookingEvent(opts: {
  serviceName: string;
  staffDisplayName: string;
  customerName: string;
  customerEmail: string;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  bookingId: string;
  notes?: string | null;
}): GCalEvent {
  return {
    summary: `${opts.serviceName} — ${opts.customerName}`,
    description: [
      `Service: ${opts.serviceName}`,
      `Staff: ${opts.staffDisplayName}`,
      `Customer: ${opts.customerName} <${opts.customerEmail}>`,
      opts.notes ? `Notes: ${opts.notes}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
    start: {
      dateTime: opts.startsAt.toISOString(),
      timeZone: opts.timezone,
    },
    end: {
      dateTime: opts.endsAt.toISOString(),
      timeZone: opts.timezone,
    },
    attendees: [{ email: opts.customerEmail, displayName: opts.customerName }],
    extendedProperties: {
      private: { bookingId: opts.bookingId },
    },
  };
}
