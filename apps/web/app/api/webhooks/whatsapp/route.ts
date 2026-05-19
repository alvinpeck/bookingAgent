import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, channels, conversations, webhookEvents } from "@booking-agent/db";
import { decrypt } from "@booking-agent/trpc/lib/crypto";
import {
  normalizeWhatsApp,
  type WhatsAppPayload,
} from "@booking-agent/trpc/lib/normalizer";
import { checkRateLimit, isOnCooldown } from "@booking-agent/trpc/lib/redis";
import { sendWhatsAppMessage } from "@booking-agent/trpc/lib/whatsapp-send";
import { runBookingAgent } from "@booking-agent/trpc/lib/agent";
import { logger } from "@booking-agent/trpc/lib/logger";

/**
 * WhatsApp Cloud API webhook.
 *
 * GET  — Meta challenge verification.
 *         Meta sends ?hub.mode=subscribe&hub.verify_token=TOKEN&hub.challenge=CHALLENGE
 *         We find the channel with matching verifyToken and echo back the challenge.
 *
 * POST — Inbound message events.
 *         Signature verified via X-Hub-Signature-256 (HMAC-SHA256 of the raw body
 *         using the app secret). Idempotent: duplicate events are ignored via
 *         webhookEvents.externalEventId.
 */

export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode !== "subscribe" || !token || !challenge) {
    return new NextResponse("Bad request", { status: 400 });
  }

  // Find the channel whose verify token matches
  const allChannels = await db.query.channels.findMany({
    where: eq(channels.type, "whatsapp"),
    columns: { id: true, whatsappVerifyToken: true, tenantId: true },
  });

  const match = allChannels.find((c) => c.whatsappVerifyToken === token);
  if (!match) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  // Mark channel as active now that Meta has verified it
  await db
    .update(channels)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .set({ status: "active", updatedAt: new Date() } as any)
    .where(eq(channels.id, match.id));

  return new NextResponse(challenge, { status: 200 });
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256") ?? "";

  let payload: WhatsAppPayload;
  try {
    payload = JSON.parse(rawBody) as WhatsAppPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (payload.object !== "whatsapp_business_account") {
    // Not a message event (e.g. status update from a different product)
    return NextResponse.json({ received: true });
  }

  // Process each entry in the payload
  for (const entry of payload.entry ?? []) {
    const phoneNumberId = entry.changes?.[0]?.value?.metadata?.phone_number_id;
    if (!phoneNumberId) continue;

    // Look up channel by phone number ID
    const channel = await db.query.channels.findFirst({
      where: eq(channels.whatsappPhoneNumberId, phoneNumberId),
      columns: {
        id: true,
        tenantId: true,
        whatsappAppSecretRef: true,
        whatsappAccessTokenRef: true,
        whatsappPhoneNumberId: true,
        status: true,
      },
    });

    if (!channel?.whatsappAppSecretRef) continue;

    // Verify HMAC signature using the app secret for this channel
    let appSecret: string;
    try {
      appSecret = decrypt(channel.whatsappAppSecretRef);
    } catch {
      logger.error("[whatsapp-webhook] Failed to decrypt app secret", { channelId: channel.id });
      continue;
    }

    const expectedSig =
      "sha256=" + createHmac("sha256", appSecret).update(rawBody).digest("hex");

    let sigValid = false;
    try {
      sigValid = timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSig)
      );
    } catch {
      sigValid = false;
    }

    if (!sigValid) {
      logger.warn("[whatsapp-webhook] Signature mismatch", { channelId: channel.id });
      // Record failed verification
      await db
        .update(channels)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .set({
          lastErrorAt: new Date(),
          lastErrorMessage: "HMAC signature verification failed",
          updatedAt: new Date(),
        } as any)
        .where(eq(channels.id, channel.id));
      continue;
    }

    // ── Replay protection — reject requests older than 5 minutes ─────────────
    // Meta includes X-Hub-Timestamp (Unix seconds) on every POST.
    // Combined with the HMAC check above this prevents replayed webhooks.
    const tsHeader = req.headers.get("x-hub-timestamp");
    const tsSeconds = tsHeader ? Number(tsHeader) : NaN;
    const ageSeconds = Math.floor(Date.now() / 1000) - tsSeconds;
    if (!tsHeader || isNaN(tsSeconds) || ageSeconds > 300) {
      logger.warn("[whatsapp-webhook] Stale or missing timestamp — possible replay", {
        channelId: channel.id,
        ageSeconds: isNaN(ageSeconds) ? "missing" : ageSeconds,
      });
      continue; // drop silently — already returned 200 to Meta at end
    }

    // Normalise messages and persist each one
    const messages = normalizeWhatsApp(entry);

    for (const msg of messages) {
      // Idempotency check — skip if already processed
      const alreadyProcessed = await db.query.webhookEvents.findFirst({
        where: eq(webhookEvents.externalEventId, msg.externalMessageId),
        columns: { id: true },
      });
      if (alreadyProcessed) continue;

      // Store raw event
      await db.insert(webhookEvents).values({
        tenantId: channel.tenantId,
        source: "whatsapp",
        externalEventId: msg.externalMessageId,
        payload: msg.raw as Record<string, unknown>,
        signatureVerified: true,
        processedAt: new Date(),
      } as any);

      // Find or create conversation
      const existingConvo = await db.query.conversations.findFirst({
        where: eq(conversations.channelId, channel.id),
        columns: { id: true },
      });

      if (!existingConvo) {
        await db.insert(conversations).values({
          tenantId: channel.tenantId,
          channelId: channel.id,
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
      if (msg.text && channel.whatsappAccessTokenRef && channel.whatsappPhoneNumberId) {
        let accessToken: string;
        try {
          accessToken = decrypt(channel.whatsappAccessTokenRef);
        } catch {
          logger.error("[whatsapp-webhook] Failed to decrypt access token", { channelId: channel.id });
          continue;
        }

        try {
          const rateLimitKey = `rl:msg:${channel.tenantId}:${msg.externalUserId}`;
          const { allowed } = await checkRateLimit(rateLimitKey, 5, 60);

          if (!allowed) {
            // Silently drop rate-limited users
          } else if (await isOnCooldown(`cooldown:${channel.tenantId}:${msg.externalUserId}`)) {
            await sendWhatsAppMessage(
              accessToken,
              channel.whatsappPhoneNumberId,
              msg.externalUserId,
              "You're on a brief cooldown. Please try again in a few minutes."
            );
          } else {
            const reply = await runBookingAgent({
              tenantId: channel.tenantId,
              channelId: channel.id,
              externalUserId: msg.externalUserId,
              platform: "whatsapp",
              messageText: msg.text,
              db,
            });
            await sendWhatsAppMessage(
              accessToken,
              channel.whatsappPhoneNumberId,
              msg.externalUserId,
              reply
            );
          }
        } catch (err) {
          logger.error("[whatsapp-webhook] Agent error", { channelId: channel.id, err: String(err) });
          try {
            await sendWhatsAppMessage(
              accessToken!,
              channel.whatsappPhoneNumberId,
              msg.externalUserId,
              "Sorry, something went wrong. Please try again."
            );
          } catch { /* ignore */ }
        }
      }
    }

    // Heartbeat: update lastWebhookAt
    await db
      .update(channels)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .set({ lastWebhookAt: new Date(), updatedAt: new Date() } as any)
      .where(eq(channels.id, channel.id));
  }

  // Always return 200 — Meta will retry on any other status
  return NextResponse.json({ received: true });
}
