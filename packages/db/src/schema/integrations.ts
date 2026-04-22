import {
  pgTable,
  pgEnum,
  text,
  timestamp,
  boolean,
  jsonb,
  uuid,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { tenants } from "./tenants";
import { staff } from "./services";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const integrationTypeEnum = pgEnum("integration_type", [
  "google_calendar",
  // future: "outlook_calendar", "zoom", "stripe"
]);

export const integrationStatusEnum = pgEnum("integration_status", [
  "active",
  "revoked",   // user disconnected
  "expired",   // refresh token invalid; needs re-auth
  "error",
]);

// ─── OAuth Integrations ───────────────────────────────────────────────────────

/**
 * Stores OAuth tokens for third-party integrations per staff member.
 *
 * Security requirements:
 *   - accessToken and refreshToken MUST be stored AES-256-GCM encrypted.
 *   - The encryption key is ENCRYPTION_KEY from env, managed by KMS in production.
 *   - Never log or expose these fields.
 *   - Rotate refresh tokens on every use (Google issues new ones on each refresh).
 *
 * The application layer (OAuthService) handles encryption/decryption transparently.
 */
export const integrations = pgTable(
  "integrations",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),

    type: integrationTypeEnum("type").notNull(),
    status: integrationStatusEnum("status").notNull().default("active"),

    // Google Calendar specific
    googleEmail: text("google_email"),          // connected Google account email
    googleCalendarId: text("google_calendar_id"), // which calendar to sync (default: primary)

    // Encrypted token storage
    // Format: base64(iv) + "." + base64(ciphertext) + "." + base64(authTag)
    encryptedAccessToken: text("encrypted_access_token"),
    encryptedRefreshToken: text("encrypted_refresh_token"),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),

    // OAuth scopes granted
    scopes: text("scopes").array(),

    // Last free/busy sync result metadata
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    lastSyncError: text("last_sync_error"),

    // Whether to write new bookings back to this calendar
    writeBackEnabled: boolean("write_back_enabled").notNull().default(true),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    index("integrations_tenant_idx").on(t.tenantId),
    index("integrations_staff_idx").on(t.staffId),
    // One integration of each type per staff member
    uniqueIndex("integrations_staff_type_idx").on(t.staffId, t.type),
  ]
);

// ─── Webhook Events ───────────────────────────────────────────────────────────

/**
 * Idempotent log of inbound webhook events (WhatsApp, Telegram, Clerk).
 * Processing is done via queue; this table prevents duplicate processing.
 */
export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),

    // e.g. "whatsapp", "telegram", "clerk"
    source: text("source").notNull(),

    // Provider-supplied event ID for deduplication
    externalEventId: text("external_event_id"),

    // Raw payload — stored for replay and audit
    payload: jsonb("payload").notNull(),

    // HMAC verified before insert
    signatureVerified: boolean("signature_verified").notNull().default(false),

    // Processing state
    processedAt: timestamp("processed_at", { withTimezone: true }),
    processingError: text("processing_error"),
    retryCount: text("retry_count").notNull().default("0"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    index("webhook_events_source_idx").on(t.source),
    index("webhook_events_processed_idx").on(t.processedAt),
    // Deduplication: prevent re-processing the same event
    uniqueIndex("webhook_events_external_id_idx").on(t.source, t.externalEventId),
  ]
);
