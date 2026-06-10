import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../trpc";
import { db, conversations, channels } from "@booking-agent/db";
import { eq, desc, and } from "drizzle-orm";
import { getConversationHistory } from "../lib/redis";

export const conversationsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const rows = await db
      .select({
        id:             conversations.id,
        externalUserId: conversations.externalUserId,
        isActive:       conversations.isActive,
        bookingId:      conversations.bookingId,
        lastMessageAt:  conversations.lastMessageAt,
        createdAt:      conversations.createdAt,
        channelId:      conversations.channelId,
        channelType:    channels.type,
        channelName:    channels.displayName,
      })
      .from(conversations)
      .innerJoin(channels, eq(conversations.channelId, channels.id))
      .where(eq(conversations.tenantId, ctx.tenant.id))
      .orderBy(desc(conversations.lastMessageAt))
      .limit(200);

    return rows;
  }),

  getMessages: protectedProcedure
    .input(z.object({ conversationId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const convo = await db.query.conversations.findFirst({
        where: and(
          eq(conversations.id, input.conversationId),
          eq(conversations.tenantId, ctx.tenant.id)
        ),
      });

      if (!convo) throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found" });

      const messages = await getConversationHistory(
        ctx.tenant.id,
        convo.channelId,
        convo.externalUserId
      );

      return { conversation: convo, messages };
    }),
});
