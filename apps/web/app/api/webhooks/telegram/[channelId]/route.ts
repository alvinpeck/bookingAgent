import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db, channels, conversations, webhookEvents } from "@booking-agent/db";
import { decrypt } from "@booking-agent/trpc/lib/crypto";
import {
  normalizeTelegram,
  type TelegramUpdate,
} from "@booking-agent/trpc/lib/normalizer";
import {
  checkRateLimit,
  isOnCooldown,
} from "@booking-agent/trpc/lib/redis";
import { sendTelegramMessage } from "@booking-agent/trpc/lib/telegram-send";
import { runBookingAgent } from "@booking-agent/trpc/lib/agent";
import { logger } from "@booking-agent/trpc/lib/logger";

/**
 * Telegram Bot webhook.
 *
 * URL:  /api/webhooks/telegram/[channelId]
 *
 * Register this URL with Telegram via:
 *   POST https://api.telegram.org/bot{TOKEN}/setWebhook
 *   { "url": "<this URL>", "secret_token": "<webhookSecret>" }
 *
 * Security: Telegram sends the secret_token in X-Telegram-Bot-Api-Secret-Token.
 *           We decrypt the stored secret and compare with timingSafeEqual.
 *
 * Idempotent: update_id is used as externalEventId to skip duplicates.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ channelId: string }> }
) {
  const { channelId } = await params;

  const channel = await db.query.channels.findFirst({
    where: and(
      eq(channels.id, channelId),
      eq(channels.type, "telegram")
    ),
    columns: {
      id: true,
      tenantId: true,
      telegramBotTokenRef: true,
      telegramWebhookSecretRef: true,
      status: true,
    },
  });

  if (!channel?.telegramWebhookSecretRef) {
    return new NextResponse("Not found", { status: 404 });
  }

  // Verify secret token header
  const headerSecret = req.headers.get("x-telegram-bot-api-secret-token") ?? "";

  let storedSecret: string;
  try {
    storedSecret = decrypt(channel.telegramWebhookSecretRef);
  } catch {
    logger.error("[telegram-webhook] Failed to decrypt webhook secret", { channelId });
    return new NextResponse("Internal error", { status: 500 });
  }

  let secretValid = false;
  try {
    secretValid = timingSafeEqual(
      Buffer.from(headerSecret),
      Buffer.from(storedSecret)
    );
  } catch {
    secretValid = false;
  }

  if (!secretValid) {
    logger.warn("[telegram-webhook] Secret token mismatch", { channelId });
    await db
      .update(channels)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .set({
        lastErrorAt: new Date(),
        lastErrorMessage: "Webhook secret token verification failed",
        updatedAt: new Date(),
      } as any)
      .where(eq(channels.id, channelId));
    return new NextResponse("Forbidden", { status: 403 });
  }

  let update: TelegramUpdate;
  try {
    update = (await req.json()) as TelegramUpdate;
  } catch {
    return new NextResponse("Invalid JSON", { status: 400 });
  }

  const chatId = update.message?.chat?.id;
  const updateIdStr = String(update.update_id);

  // Idempotency check
  const alreadyProcessed = await db.query.webhookEvents.findFirst({
    where: eq(webhookEvents.externalEventId, updateIdStr),
    columns: { id: true },
  });

  if (!alreadyProcessed) {
    const msg = normalizeTelegram(update);

    await db.insert(webhookEvents).values({
      tenantId: channel.tenantId,
      source: "telegram",
      externalEventId: updateIdStr,
      payload: update as unknown as Record<string, unknown>,
      signatureVerified: true,
      processedAt: new Date(),
    } as any);

    if (msg) {
      // Find or create conversation for this user
      const existingConvo = await db.query.conversations.findFirst({
        where: and(
          eq(conversations.channelId, channelId),
          eq(conversations.externalUserId, msg.externalUserId)
        ),
        columns: { id: true },
      });

      if (!existingConvo) {
        await db.insert(conversations).values({
          tenantId: channel.tenantId,
          channelId,
          externalUserId: msg.externalUserId,
          lastMessageAt: msg.timestamp,
        } as any);
      } else {
        await db
          .update(conversations)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .set({ lastMessageAt: msg.timestamp, isActive: true, updatedAt: new Date() } as any)
          .where(eq(conversations.id, existingConvo.id));
      }

      // ── AI Agent ──────────────────────────────────────────────────────────
      if (chatId && msg.text) {
        let botToken: string;
        try {
          botToken = decrypt(channel.telegramBotTokenRef!);
        } catch {
          logger.error("[telegram-webhook] Failed to decrypt bot token", { channelId });
          return NextResponse.json({ ok: true });
        }

        try {
          // Rate limiting: 5 messages per 60 seconds per user
          const rateLimitKey = `rl:msg:${channel.tenantId}:${msg.externalUserId}`;
          const { allowed } = await checkRateLimit(rateLimitKey, 5, 60);

          if (!allowed) {
            // Silently drop — don't reply to rate-limited users
          } else if (await isOnCooldown(`cooldown:${channel.tenantId}:${msg.externalUserId}`)) {
            await sendTelegramMessage(botToken, chatId, "You're on a brief cooldown. Please try again in a few minutes.");
          } else {
            const reply = await runBookingAgent({
              tenantId: channel.tenantId,
              channelId,
              externalUserId: msg.externalUserId,
              platform: "telegram",
              messageText: msg.text,
              db,
            });
            await sendTelegramMessage(botToken, chatId, reply);
          }
        } catch (err) {
          logger.error("[telegram-webhook] Agent error", { channelId, err: String(err) });
          await sendTelegramMessage(botToken, chatId, "Sorry, something went wrong. Please try again.");
        }
      }
    }
  }

  // Heartbeat
  await db
    .update(channels)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .set({ lastWebhookAt: new Date(), updatedAt: new Date() } as any)
    .where(eq(channels.id, channelId));

  // Telegram requires a 200 response within ~60 s
  return NextResponse.json({ ok: true });
}
