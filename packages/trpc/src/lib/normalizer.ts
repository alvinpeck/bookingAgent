/**
 * Phase 9 — inbound message normaliser.
 *
 * Converts platform-specific webhook payloads into a single InboundMessage
 * type that the AI booking agent (Phase 10) will consume.
 */

export type InboundMessage = {
  platform: "whatsapp" | "telegram";
  /** Channel-scoped user identifier (WA: sender phone, TG: user ID as string) */
  externalUserId: string;
  /** Provider message ID — used for deduplication */
  externalMessageId: string;
  /** Plain text content, null for non-text messages (images, stickers, etc.) */
  text: string | null;
  timestamp: Date;
  /** Raw platform payload — stored for audit/replay */
  raw: unknown;
};

// ─── WhatsApp Cloud API ───────────────────────────────────────────────────────

export interface WhatsAppPayload {
  object: string;
  entry?: WhatsAppEntry[];
}

export interface WhatsAppEntry {
  id: string;
  changes?: Array<{
    value?: {
      messaging_product?: string;
      metadata?: { phone_number_id: string; display_phone_number: string };
      messages?: WhatsAppMessage[];
    };
    field: string;
  }>;
}

export interface WhatsAppMessage {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  image?: { caption?: string };
  audio?: Record<string, unknown>;
  document?: { filename?: string; caption?: string };
}

export function normalizeWhatsApp(entry: WhatsAppEntry): InboundMessage[] {
  const messages: InboundMessage[] = [];
  for (const change of entry.changes ?? []) {
    for (const msg of change.value?.messages ?? []) {
      let text: string | null = null;
      if (msg.type === "text") text = msg.text?.body ?? null;
      else if (msg.type === "image" && msg.image?.caption) text = msg.image.caption;
      else if (msg.type === "document" && msg.document?.caption) text = msg.document.caption;

      messages.push({
        platform: "whatsapp",
        externalUserId: msg.from,
        externalMessageId: msg.id,
        text,
        timestamp: new Date(Number(msg.timestamp) * 1000),
        raw: msg,
      });
    }
  }
  return messages;
}

// ─── Telegram Bot API ─────────────────────────────────────────────────────────

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  callback_query?: {
    id: string;
    from: TelegramUser;
    data?: string;
    message?: TelegramMessage;
  };
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: { id: number; type: string };
  date: number;
  text?: string;
  caption?: string;
}

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
}

export function normalizeTelegram(update: TelegramUpdate): InboundMessage | null {
  const msg = update.message ?? update.edited_message;
  if (!msg) return null;

  return {
    platform: "telegram",
    externalUserId: String(msg.from?.id ?? msg.chat.id),
    externalMessageId: String(update.update_id),
    text: msg.text ?? msg.caption ?? null,
    timestamp: new Date(msg.date * 1000),
    raw: update,
  };
}
