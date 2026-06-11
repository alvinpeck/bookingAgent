/**
 * SMS sending via Twilio.
 *
 * Per-tenant credentials are stored encrypted in tenantSettings:
 *   apikey:twilio_sid  → account SID
 *   apikey:twilio_auth → auth token
 *
 * Falls back to platform-level TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN /
 * TWILIO_FROM_NUMBER env vars if no per-tenant keys are set.
 *
 * All functions are fire-and-forget (never throw) so SMS failures
 * never block booking flows.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TenantTwilioConfig {
  accountSid:  string;
  authToken:   string;
  fromNumber:  string;
}

export interface SmsReminderData {
  to:           string;   // E.164 phone number, e.g. +60123456789
  customerName: string;
  businessName: string;
  serviceName:  string;
  startsAt:     Date;
  timezone:     string;
  bookingId:    string;
  minutesBefore: number;
}

// ─── Twilio REST helper (no SDK — keeps the package lean) ────────────────────

async function sendViaTwilio(
  config: TenantTwilioConfig,
  to: string,
  body: string
): Promise<void> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`;
  const creds = Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64");

  const params = new URLSearchParams({
    To:   to,
    From: config.fromNumber,
    Body: body,
  });

  const res = await fetch(url, {
    method:  "POST",
    headers: {
      Authorization:  `Basic ${creds}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "(no body)");
    throw new Error(`Twilio ${res.status}: ${text}`);
  }
}

// ─── Config resolver ──────────────────────────────────────────────────────────

/**
 * Resolve Twilio credentials for a tenant.
 * Per-tenant keys (encrypted, stored by Settings → API Keys) take priority
 * over platform-level env vars.
 */
export async function resolveTwilioConfig(
  tenantId: string
): Promise<TenantTwilioConfig | null> {
  // Check for platform-level env fallback first (fastest path for single-tenant deployments)
  const platformSid  = process.env.TWILIO_ACCOUNT_SID;
  const platformAuth = process.env.TWILIO_AUTH_TOKEN;
  const platformFrom = process.env.TWILIO_FROM_NUMBER;

  let sid  = platformSid  ?? "";
  let auth = platformAuth ?? "";
  let from = platformFrom ?? "";

  // Attempt to load per-tenant keys (may be empty if not configured)
  try {
    const { db, tenantSettings } = await import("@booking-agent/db");
    const { decrypt }            = await import("./crypto");
    const { eq, and, inArray }   = await import("drizzle-orm");

    const rows = await db
      .select({ key: tenantSettings.key, value: tenantSettings.value })
      .from(tenantSettings)
      .where(
        and(
          eq(tenantSettings.tenantId, tenantId),
          inArray(tenantSettings.key as any, ["apikey:twilio_sid", "apikey:twilio_auth"] as any)
        )
      );

    const map = Object.fromEntries(rows.map((r) => [r.key, r.value as string]));

    if (map["apikey:twilio_sid"])  sid  = decrypt(map["apikey:twilio_sid"]!);
    if (map["apikey:twilio_auth"]) auth = decrypt(map["apikey:twilio_auth"]!);
  } catch {
    // DB unavailable or no keys set — fall through to env vars
  }

  if (!sid || !auth || !from) return null;
  return { accountSid: sid, authToken: auth, fromNumber: from };
}

// ─── SMS templates ────────────────────────────────────────────────────────────

function formatReminderMessage(d: SmsReminderData): string {
  const tz       = d.timezone || "UTC";
  const timeStr  = d.startsAt.toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit", timeZone: tz,
  });
  const dateStr  = d.startsAt.toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric", timeZone: tz,
  });
  const hours    = Math.round(d.minutesBefore / 60);
  const when     = hours >= 24 ? "tomorrow" : hours > 1 ? `in ${hours} hours` : "soon";

  const ref      = d.bookingId.slice(0, 8).toUpperCase();
  return `Reminder: Your ${d.serviceName} at ${d.businessName} is ${when} (${dateStr} at ${timeStr}). Ref: ${ref}`;
}

// ─── Public send functions ────────────────────────────────────────────────────

export async function sendSmsReminder(
  tenantId: string,
  d: SmsReminderData
): Promise<boolean> {
  try {
    const config = await resolveTwilioConfig(tenantId);
    if (!config) return false; // Not configured — skip silently

    const body = formatReminderMessage(d);
    await sendViaTwilio(config, d.to, body);
    return true;
  } catch (err) {
    console.error("[sms] Failed to send reminder:", err);
    return false;
  }
}
