import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  router,
  protectedProcedure,
  manageChannelsProcedure,
  withAudit,
} from "../trpc";
import { channels, conversations } from "@booking-agent/db";
import { encrypt } from "../lib/crypto";

export const channelsRouter = router({
  /**
   * List all channels for the current tenant (secrets masked).
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.query.channels.findMany({
      where: eq(channels.tenantId, ctx.tenant.id),
      orderBy: (c, { asc }) => asc(c.createdAt),
    });

    return rows.map(
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      ({ whatsappAppSecretRef, telegramBotTokenRef, telegramWebhookSecretRef, ...rest }) => ({
        ...rest,
        hasWhatsappSecret: !!whatsappAppSecretRef,
        hasTelegramToken: !!telegramBotTokenRef,
        hasTelegramWebhookSecret: !!telegramWebhookSecretRef,
      })
    );
  }),

  /**
   * Configure a WhatsApp Cloud API channel.
   * Returns the verify token the user needs to paste into the Meta webhook config.
   */
  createWhatsapp: manageChannelsProcedure
    .use(withAudit)
    .input(
      z.object({
        displayName: z.string().min(1).max(100),
        phoneNumberId: z.string().min(1),
        appSecret: z.string().min(1),
        accessToken: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.channels.findFirst({
        where: and(eq(channels.tenantId, ctx.tenant.id), eq(channels.type, "whatsapp")),
        columns: { id: true, displayName: true },
      });
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `A WhatsApp channel already exists ("${existing.displayName}"). Delete it first before creating a new one.`,
        });
      }

      const verifyToken = crypto.randomUUID();
      const encryptedSecret = encrypt(input.appSecret);

      const [created] = await ctx.db
        .insert(channels)
        .values({
          tenantId: ctx.tenant.id,
          type: "whatsapp",
          displayName: input.displayName,
          whatsappPhoneNumberId: input.phoneNumberId,
          whatsappVerifyToken: verifyToken,
          whatsappAppSecretRef: encryptedSecret,
          whatsappAccessTokenRef: encrypt(input.accessToken),
          status: "pending_setup",
        } as any)
        .returning();

      await ctx.audit("channel.created", {
        resourceType: "channel",
        resourceId: created!.id,
        after: { type: "whatsapp", displayName: input.displayName },
      });

      return {
        id: created!.id,
        verifyToken,
        webhookUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/whatsapp`,
      };
    }),

  /**
   * Configure a Telegram bot channel.
   * Returns the webhook URL + secret to register with setWebhook.
   */
  createTelegram: manageChannelsProcedure
    .use(withAudit)
    .input(
      z.object({
        displayName: z.string().min(1).max(100),
        botUsername: z.string().min(1),
        botToken: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.channels.findFirst({
        where: and(eq(channels.tenantId, ctx.tenant.id), eq(channels.type, "telegram")),
        columns: { id: true, displayName: true },
      });
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `A Telegram channel already exists ("${existing.displayName}"). Delete it first before creating a new one.`,
        });
      }

      const webhookSecret = crypto.randomUUID().replace(/-/g, "");
      const encryptedToken = encrypt(input.botToken);
      const encryptedSecret = encrypt(webhookSecret);

      const [created] = await ctx.db
        .insert(channels)
        .values({
          tenantId: ctx.tenant.id,
          type: "telegram",
          displayName: input.displayName,
          telegramBotUsername: input.botUsername,
          telegramBotTokenRef: encryptedToken,
          telegramWebhookSecretRef: encryptedSecret,
          status: "pending_setup",
        } as any)
        .returning();

      await ctx.audit("channel.created", {
        resourceType: "channel",
        resourceId: created!.id,
        after: { type: "telegram", displayName: input.displayName },
      });

      const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/telegram/${created!.id}`;

      return {
        id: created!.id,
        webhookUrl,
        webhookSecret,
        // Convenience: full setWebhook command
        setWebhookCmd: `curl "https://api.telegram.org/bot${input.botToken}/setWebhook?url=${webhookUrl}&secret_token=${webhookSecret}"`,
      };
    }),

  /**
   * Update a channel's display name and/or credentials.
   * Passing a new secret/token re-encrypts and replaces the stored value.
   */
  update: manageChannelsProcedure
    .use(withAudit)
    .input(
      z.object({
        id: z.string().uuid(),
        displayName: z.string().min(1).max(100).optional(),
        // WhatsApp
        phoneNumberId: z.string().min(1).optional(),
        appSecret: z.string().min(1).optional(),
        accessToken: z.string().min(1).optional(),
        // Telegram
        botUsername: z.string().min(1).optional(),
        botToken: z.string().min(1).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.channels.findFirst({
        where: and(
          eq(channels.id, input.id),
          eq(channels.tenantId, ctx.tenant.id)
        ),
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (input.displayName) updates.displayName = input.displayName;

      if (existing.type === "whatsapp") {
        if (input.phoneNumberId) updates.whatsappPhoneNumberId = input.phoneNumberId;
        if (input.appSecret) updates.whatsappAppSecretRef = encrypt(input.appSecret);
        if (input.accessToken) updates.whatsappAccessTokenRef = encrypt(input.accessToken);
      }

      if (existing.type === "telegram") {
        if (input.botUsername) updates.telegramBotUsername = input.botUsername;
        if (input.botToken) updates.telegramBotTokenRef = encrypt(input.botToken);
      }

      await ctx.db
        .update(channels)
        .set(updates as any)
        .where(eq(channels.id, input.id));

      await ctx.audit("channel.updated", {
        resourceType: "channel",
        resourceId: input.id,
        before: { displayName: existing.displayName },
        after: { displayName: input.displayName ?? existing.displayName },
      });

      return { success: true };
    }),

  /**
   * Mark a channel as active once the webhook has been verified.
   */
  activate: manageChannelsProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.channels.findFirst({
        where: and(
          eq(channels.id, input.id),
          eq(channels.tenantId, ctx.tenant.id)
        ),
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      await ctx.db
        .update(channels)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .set({ status: "active", updatedAt: new Date() } as any)
        .where(eq(channels.id, input.id));

      return { success: true };
    }),

  /**
   * Delete a channel and all its conversations.
   */
  delete: manageChannelsProcedure
    .use(withAudit)
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.channels.findFirst({
        where: and(
          eq(channels.id, input.id),
          eq(channels.tenantId, ctx.tenant.id)
        ),
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      await ctx.db
        .delete(conversations)
        .where(eq(conversations.channelId, input.id));

      await ctx.db.delete(channels).where(eq(channels.id, input.id));

      await ctx.audit("channel.deleted", {
        resourceType: "channel",
        resourceId: input.id,
        before: { type: existing.type, displayName: existing.displayName },
      });

      return { success: true };
    }),

  /**
   * Stats: number of conversations per channel.
   */
  getStats: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const existing = await ctx.db.query.channels.findFirst({
        where: and(
          eq(channels.id, input.id),
          eq(channels.tenantId, ctx.tenant.id)
        ),
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      const convos = await ctx.db.query.conversations.findMany({
        where: eq(conversations.channelId, input.id),
        columns: { id: true, isActive: true },
      });

      return {
        total: convos.length,
        active: convos.filter((c) => c.isActive).length,
      };
    }),
});
