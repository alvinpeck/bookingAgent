import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  router,
  protectedProcedure,
  manageIntegrationsProcedure,
  withAudit,
} from "../trpc";
import { integrations, staff } from "@booking-agent/db";
import { decrypt } from "../lib/crypto";
import { getAccessToken, listCalendars } from "../lib/google-calendar";

export const integrationsRouter = router({
  /**
   * List all Google Calendar integrations for the tenant (admin/owner).
   * Returns connection status per staff member — never exposes tokens.
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.query.integrations.findMany({
      where: eq(integrations.tenantId, ctx.tenant.id),
      with: {
        staff: {
          columns: { id: true, displayName: true, avatarUrl: true },
        },
      },
      columns: {
        id: true,
        staffId: true,
        type: true,
        status: true,
        googleEmail: true,
        googleCalendarId: true,
        writeBackEnabled: true,
        lastSyncAt: true,
        lastSyncError: true,
        createdAt: true,
      },
    });
    return rows;
  }),

  /**
   * Get the current user's own Google Calendar integration (if any).
   */
  getMine: protectedProcedure.query(async ({ ctx }) => {
    const myStaff = await ctx.db.query.staff.findFirst({
      where: and(
        eq(staff.tenantId, ctx.tenant.id),
        eq(staff.tenantUserId, ctx.tenantUser.id)
      ),
      columns: { id: true },
    });

    if (!myStaff) return null;

    const integration = await ctx.db.query.integrations.findFirst({
      where: and(
        eq(integrations.staffId, myStaff.id),
        eq(integrations.type, "google_calendar")
      ),
      columns: {
        id: true,
        status: true,
        googleEmail: true,
        googleCalendarId: true,
        writeBackEnabled: true,
        lastSyncAt: true,
        lastSyncError: true,
      },
    });

    return integration ?? null;
  }),

  /**
   * Fetch the authenticated Google account's calendar list.
   * Used so the user can pick which calendar to sync.
   */
  listGoogleCalendars: manageIntegrationsProcedure
    .input(z.object({ integrationId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const integration = await ctx.db.query.integrations.findFirst({
        where: and(
          eq(integrations.id, input.integrationId),
          eq(integrations.tenantId, ctx.tenant.id)
        ),
        columns: { id: true },
      });
      if (!integration) throw new TRPCError({ code: "NOT_FOUND" });

      try {
        const accessToken = await getAccessToken(input.integrationId, ctx.db);
        return await listCalendars(accessToken);
      } catch {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch calendar list. Try reconnecting.",
        });
      }
    }),

  /**
   * Update which calendar to sync and whether to write bookings back.
   */
  update: manageIntegrationsProcedure
    .use(withAudit)
    .input(
      z.object({
        integrationId: z.string().uuid(),
        googleCalendarId: z.string().optional(),
        writeBackEnabled: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.integrations.findFirst({
        where: and(
          eq(integrations.id, input.integrationId),
          eq(integrations.tenantId, ctx.tenant.id)
        ),
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (input.googleCalendarId !== undefined)
        updates.googleCalendarId = input.googleCalendarId;
      if (input.writeBackEnabled !== undefined)
        updates.writeBackEnabled = input.writeBackEnabled;

      await ctx.db
        .update(integrations)
        .set(updates as any)
        .where(eq(integrations.id, input.integrationId));

      await ctx.audit("integration.connected", {
        resourceType: "integration",
        resourceId: input.integrationId,
        after: updates,
      });

      return { success: true };
    }),

  /**
   * Disconnect: revoke the Google token and remove the row.
   */
  disconnect: manageIntegrationsProcedure
    .use(withAudit)
    .input(z.object({ integrationId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.integrations.findFirst({
        where: and(
          eq(integrations.id, input.integrationId),
          eq(integrations.tenantId, ctx.tenant.id)
        ),
        columns: {
          id: true,
          encryptedAccessToken: true,
          googleEmail: true,
        },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      // Best-effort token revocation
      if (existing.encryptedAccessToken) {
        try {
          const accessToken = decrypt(existing.encryptedAccessToken);
          await fetch(
            `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(accessToken)}`,
            { method: "POST" }
          );
        } catch {
          // Ignore — we're deleting the record anyway
        }
      }

      await ctx.db
        .delete(integrations)
        .where(eq(integrations.id, input.integrationId));

      await ctx.audit("integration.disconnected", {
        resourceType: "integration",
        resourceId: input.integrationId,
        before: { googleEmail: existing.googleEmail },
      });

      return { success: true };
    }),
});
