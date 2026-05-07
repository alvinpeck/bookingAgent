/**
 * Super Admin tRPC router.
 *
 * SECURITY: All procedures validate the caller's admin session cookie against
 * the admin_sessions table in the database. This router bypasses tenant
 * scoping and reads across ALL tenants.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, desc, sql, max, isNull, gt } from "drizzle-orm";
import { cookies } from "next/headers";
import {
  tenants,
  tenantSettings,
  staff,
  channels,
  bookings,
  conversations,
  usageMetering,
  adminUsers,
  adminSessions,
  PLAN_QUOTAS,
} from "@booking-agent/db";
import { router, middleware, publicProcedure } from "../trpc";

const ADMIN_COOKIE = "admin_session";

// ─── Super admin middleware ───────────────────────────────────────────────────

const isSuperAdmin = middleware(async ({ ctx, next }) => {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_COOKIE)?.value;

  if (!token) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Access denied. Super admin only.",
    });
  }

  // Validate token against DB
  const session = await ctx.db.query.adminSessions.findFirst({
    where: and(
      eq(adminSessions.token, token),
      gt(adminSessions.expiresAt, new Date())
    ),
  });

  if (!session) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Access denied. Super admin only.",
    });
  }

  const adminUser = await ctx.db.query.adminUsers.findFirst({
    where: and(
      eq(adminUsers.id, session.adminUserId),
      eq(adminUsers.isActive, true)
    ),
    columns: { id: true, email: true, name: true },
  });

  if (!adminUser) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Access denied. Super admin only.",
    });
  }

  return next({ ctx });
});

export const superAdminProcedure = publicProcedure.use(isSuperAdmin);

// ─── Admin router ─────────────────────────────────────────────────────────────

export const adminRouter = router({
  /**
   * List all tenants with aggregate stats.
   */
  listTenants: superAdminProcedure.query(async ({ ctx }) => {
    // Fetch all non-deleted tenants
    const allTenants = await ctx.db
      .select()
      .from(tenants)
      .where(isNull(tenants.deletedAt))
      .orderBy(desc(tenants.createdAt));

    if (allTenants.length === 0) return [];

    const tenantIds = allTenants.map((t) => t.id);

    // Booking counts per tenant
    const bookingCounts = await ctx.db
      .select({
        tenantId: bookings.tenantId,
        count: sql<number>`cast(count(*) as int)`,
        lastAt: max(bookings.startsAt),
      })
      .from(bookings)
      .where(
        sql`${bookings.tenantId} = any(${sql.raw(`'{${tenantIds.join(",")}}'::uuid[]`)})`
      )
      .groupBy(bookings.tenantId);

    // Staff counts per tenant
    const staffCounts = await ctx.db
      .select({
        tenantId: staff.tenantId,
        count: sql<number>`cast(count(*) as int)`,
      })
      .from(staff)
      .where(
        sql`${staff.tenantId} = any(${sql.raw(`'{${tenantIds.join(",")}}'::uuid[]`)})`
      )
      .groupBy(staff.tenantId);

    // Channel counts per tenant
    const channelCounts = await ctx.db
      .select({
        tenantId: channels.tenantId,
        count: sql<number>`cast(count(*) as int)`,
      })
      .from(channels)
      .where(
        sql`${channels.tenantId} = any(${sql.raw(`'{${tenantIds.join(",")}}'::uuid[]`)})`
      )
      .groupBy(channels.tenantId);

    // Build lookup maps
    const bookingMap = new Map(bookingCounts.map((r) => [r.tenantId, r]));
    const staffMap   = new Map(staffCounts.map((r) => [r.tenantId, r.count]));
    const channelMap = new Map(channelCounts.map((r) => [r.tenantId, r.count]));

    return allTenants.map((t) => ({
      id:            t.id,
      name:          t.name,
      slug:          t.slug,
      plan:          t.plan,
      status:        t.status,
      createdAt:     t.createdAt,
      bookingCount:  bookingMap.get(t.id)?.count ?? 0,
      staffCount:    staffMap.get(t.id) ?? 0,
      channelCount:  channelMap.get(t.id) ?? 0,
      lastBookingAt: bookingMap.get(t.id)?.lastAt ?? null,
    }));
  }),

  /**
   * Get full detail for a single tenant.
   */
  getTenant: superAdminProcedure
    .input(z.object({ tenantId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const tenant = await ctx.db.query.tenants.findFirst({
        where: eq(tenants.id, input.tenantId),
      });

      if (!tenant) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Tenant not found." });
      }

      // Settings — return only key names (mask values)
      const settingRows = await ctx.db
        .select({ key: tenantSettings.key })
        .from(tenantSettings)
        .where(eq(tenantSettings.tenantId, input.tenantId));
      const settingKeys = settingRows.map((r) => r.key);

      // Aggregate stats
      const [bookingCountRow] = await ctx.db
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(bookings)
        .where(eq(bookings.tenantId, input.tenantId));

      const [staffCountRow] = await ctx.db
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(staff)
        .where(eq(staff.tenantId, input.tenantId));

      const [channelCountRow] = await ctx.db
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(channels)
        .where(eq(channels.tenantId, input.tenantId));

      const [activeConvRow] = await ctx.db
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(conversations)
        .where(
          and(
            eq(conversations.tenantId, input.tenantId),
            eq(conversations.isActive, true)
          )
        );

      // Current month AI token usage
      const currentMonth = new Date().toISOString().slice(0, 7); // "YYYY-MM"
      const [tokenRow] = await ctx.db
        .select({ count: usageMetering.count })
        .from(usageMetering)
        .where(
          and(
            eq(usageMetering.tenantId, input.tenantId),
            eq(usageMetering.metric, "ai_tokens"),
            eq(usageMetering.periodMonth, currentMonth)
          )
        );

      const planQuota = PLAN_QUOTAS[tenant.plan];

      return {
        tenant,
        settings: settingKeys,
        stats: {
          bookingCount:       bookingCountRow?.count ?? 0,
          staffCount:         staffCountRow?.count ?? 0,
          channelCount:       channelCountRow?.count ?? 0,
          activeConversations: activeConvRow?.count ?? 0,
          monthlyAiTokens:    tokenRow?.count ?? 0,
          aiTokenQuota:
            planQuota.aiTokensPerMonth === Infinity
              ? null
              : planQuota.aiTokensPerMonth,
        },
      };
    }),

  /**
   * Paginated bookings for a tenant, with service and staff names.
   */
  getTenantBookings: superAdminProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        page:     z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const { tenantId, page, pageSize } = input;
      const offset = (page - 1) * pageSize;

      const [countRow] = await ctx.db
        .select({ total: sql<number>`cast(count(*) as int)` })
        .from(bookings)
        .where(eq(bookings.tenantId, tenantId));

      const rows = await ctx.db.query.bookings.findMany({
        where: eq(bookings.tenantId, tenantId),
        with: {
          service: { columns: { name: true, colorHex: true } },
          staff:   { columns: { displayName: true } },
        },
        orderBy: (b, { desc: d }) => d(b.startsAt),
        limit:  pageSize,
        offset,
      });

      return {
        data:     rows,
        total:    countRow?.total ?? 0,
        page,
        pageSize,
      };
    }),

  /**
   * Channels for a tenant (secrets masked — only presence indicated).
   */
  getTenantChannels: superAdminProcedure
    .input(z.object({ tenantId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.query.channels.findMany({
        where: eq(channels.tenantId, input.tenantId),
        orderBy: (ch, { desc: d }) => d(ch.createdAt),
      });

      // Mask actual secret values — just indicate whether ref keys are set
      return rows.map((ch) => ({
        id:              ch.id,
        type:            ch.type,
        displayName:     ch.displayName,
        status:          ch.status,
        lastWebhookAt:   ch.lastWebhookAt,
        lastErrorAt:     ch.lastErrorAt,
        lastErrorMessage: ch.lastErrorMessage,
        createdAt:       ch.createdAt,
        hasWhatsappSecret: ch.whatsappAppSecretRef !== null,
        hasWhatsappToken:  ch.whatsappAccessTokenRef !== null,
        hasTelegramToken:  ch.telegramBotTokenRef !== null,
      }));
    }),

  /**
   * Update tenant status.
   */
  updateTenantStatus: superAdminProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        status:   z.enum(["active", "suspended"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(tenants)
        .set({ status: input.status, updatedAt: new Date() })
        .where(eq(tenants.id, input.tenantId))
        .returning({ id: tenants.id, status: tenants.status });

      if (!updated) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Tenant not found." });
      }

      return updated;
    }),

  /**
   * Update tenant plan.
   */
  updateTenantPlan: superAdminProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        plan:     z.enum(["starter", "growth", "enterprise"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(tenants)
        .set({ plan: input.plan, updatedAt: new Date() })
        .where(eq(tenants.id, input.tenantId))
        .returning({ id: tenants.id, plan: tenants.plan });

      if (!updated) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Tenant not found." });
      }

      return updated;
    }),

  /**
   * Create a new client workspace (Clerk org + tenant DB row) and optionally
   * send an invitation email to the client.
   */
  createWorkspace: superAdminProcedure
    .input(
      z.object({
        businessName: z.string().min(1).max(100),
        slug:         z.string().min(1).max(48).regex(/^[a-z0-9-]+$/, "Slug may only contain lowercase letters, numbers and hyphens"),
        plan:         z.enum(["starter", "growth", "enterprise"]).default("starter"),
        inviteEmail:  z.string().email().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const clerkSecret = process.env.CLERK_SECRET_KEY;
      if (!clerkSecret) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "CLERK_SECRET_KEY not set." });

      // 1 — Create Clerk organization via Backend API
      const orgRes = await fetch("https://api.clerk.com/v1/organizations", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${clerkSecret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: input.businessName, slug: input.slug }),
      });

      if (!orgRes.ok) {
        const body = await orgRes.json().catch(() => ({})) as { errors?: { message: string }[] };
        const msg = body.errors?.[0]?.message ?? `Clerk API error ${orgRes.status}`;
        throw new TRPCError({ code: "BAD_REQUEST", message: msg });
      }

      const org = await orgRes.json() as { id: string; name: string; slug: string };

      // 2 — Upsert tenant row in our DB
      const [tenant] = await ctx.db
        .insert(tenants)
        .values({
          clerkOrgId: org.id,
          name:       org.name,
          slug:       org.slug ?? input.slug,
          plan:       input.plan,
          status:     "active",
        } as any)
        .onConflictDoUpdate({
          target: tenants.clerkOrgId,
          set:    { name: org.name, updatedAt: new Date() } as any,
        })
        .returning();

      if (!tenant) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create tenant." });

      // 3 — Optionally invite the client by email
      if (input.inviteEmail) {
        const inviteRes = await fetch(
          `https://api.clerk.com/v1/organizations/${org.id}/invitations`,
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${clerkSecret}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              email_address: input.inviteEmail,
              role:          "org:admin",
              redirect_url:  `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`,
            }),
          }
        );
        // Non-fatal — workspace is created even if invite fails
        if (!inviteRes.ok) {
          const body = await inviteRes.json().catch(() => ({})) as { errors?: { message: string }[] };
          console.warn("[admin] invite failed:", body.errors?.[0]?.message);
        }
      }

      return {
        tenantId:    tenant.id,
        name:        tenant.name,
        slug:        tenant.slug,
        clerkOrgId:  org.id,
        inviteSent:  !!input.inviteEmail,
      };
    }),

  /**
   * Invite a user to a tenant's Clerk organization by email.
   * Calls the Clerk Backend API to send an invitation email.
   */
  inviteMember: superAdminProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        email:    z.string().email(),
        role:     z.enum(["org:admin", "org:member"]).default("org:member"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Look up the tenant's Clerk org ID
      const tenant = await ctx.db.query.tenants.findFirst({
        where: eq(tenants.id, input.tenantId),
        columns: { id: true, name: true, clerkOrgId: true },
      });

      if (!tenant) throw new TRPCError({ code: "NOT_FOUND", message: "Tenant not found." });

      const clerkSecret = process.env.CLERK_SECRET_KEY;
      if (!clerkSecret) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "CLERK_SECRET_KEY not set." });

      // Call Clerk Backend API to create an organization invitation
      const res = await fetch(
        `https://api.clerk.com/v1/organizations/${tenant.clerkOrgId}/invitations`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${clerkSecret}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email_address: input.email,
            role: input.role,
            redirect_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`,
          }),
        }
      );

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { errors?: { message: string }[] };
        const msg = body.errors?.[0]?.message ?? `Clerk API error ${res.status}`;
        throw new TRPCError({ code: "BAD_REQUEST", message: msg });
      }

      return { success: true, email: input.email, tenantName: tenant.name };
    }),
});
