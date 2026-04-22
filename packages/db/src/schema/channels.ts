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

// ─── Enums ────────────────────────────────────────────────────────────────────

export const channelTypeEnum = pgEnum("channel_type", [
  "web_widget",
  "whatsapp",
  "telegram",
]);

export const channelStatusEnum = pgEnum("channel_status", [
  "active",
  "inactive",
  "error",          // webhook verification failed or API error
  "pending_setup",  // created but not yet verified
]);

// ─── Channels ─────────────────────────────────────────────────────────────────

/**
 * Each row is a configured messaging channel for a tenant.
 * Secrets (bot tokens, app secrets) are stored encrypted — see integrations.ts
 * for the encryption pattern. Here we store a reference key, not the raw secret.
 */
export const channels = pgTable(
  "channels",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    type: channelTypeEnum("type").notNull(),
    status: channelStatusEnum("status").notNull().default("pending_setup"),

    // Human label shown in back office
    displayName: text("display_name").notNull(),

    // ── WhatsApp fields ──
    // Phone number ID from Meta — used in API calls (not the display number)
    whatsappPhoneNumberId: text("whatsapp_phone_number_id"),
    // The verify token set in Meta webhook config
    whatsappVerifyToken: text("whatsapp_verify_token"),
    // Reference key to encrypted WHATSAPP_APP_SECRET in secret store
    whatsappAppSecretRef: text("whatsapp_app_secret_ref"),

    // ── Telegram fields ──
    telegramBotUsername: text("telegram_bot_username"),
    // Reference key to encrypted TELEGRAM_BOT_TOKEN in secret store
    telegramBotTokenRef: text("telegram_bot_token_ref"),
    // Secret used to validate Telegram webhook X-Telegram-Bot-Api-Secret-Token
    telegramWebhookSecretRef: text("telegram_webhook_secret_ref"),

    // ── Web widget fields ──
    // Widget configuration (allowed domains, theme, etc.)
    widgetConfig: jsonb("widget_config"),

    // Last webhook event received — for health monitoring
    lastWebhookAt: timestamp("last_webhook_at", { withTimezone: true }),
    lastErrorAt: timestamp("last_error_at", { withTimezone: true }),
    lastErrorMessage: text("last_error_message"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    index("channels_tenant_idx").on(t.tenantId),
    index("channels_type_idx").on(t.type),
    // Only one active channel of each type per tenant
    uniqueIndex("channels_tenant_type_idx").on(t.tenantId, t.type),
  ]
);

// ─── Conversations ────────────────────────────────────────────────────────────

/**
 * A conversation thread between a customer and the AI booking agent,
 * scoped to a channel. Used for multi-turn context (short-lived, TTL via Redis;
 * persisted here for audit/replay purposes).
 */
export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    channelId: uuid("channel_id")
      .notNull()
      .references(() => channels.id, { onDelete: "cascade" }),

    // Channel-specific identifier for the customer
    // e.g. WhatsApp: "1234567890", Telegram: "user_12345678", web: session token
    externalUserId: text("external_user_id").notNull(),

    // Whether this conversation is currently active
    isActive: boolean("is_active").notNull().default(true),

    // Redis key where live conversation state is stored
    redisKey: text("redis_key"),

    // Linked booking if a booking was completed in this conversation
    bookingId: uuid("booking_id"),

    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    index("conversations_tenant_idx").on(t.tenantId),
    index("conversations_channel_user_idx").on(t.channelId, t.externalUserId),
    // Find or create conversation by channel + external user
    uniqueIndex("conversations_channel_user_unique").on(
      t.channelId,
      t.externalUserId
    ),
  ]
);
