import { z } from "zod";
import { eq, and, like, isNull, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { randomBytes } from "crypto";
import {
  router,
  protectedProcedure,
  manageIntegrationsProcedure,
  manageStaffProcedure,
  withAudit,
} from "../trpc";
import {
  tenants,
  tenantSettings,
  tenantUsers,
  tenantInvites,
  PLAN_QUOTAS,
} from "@booking-agent/db";
import { encrypt, decrypt } from "../lib/crypto";
import { sendInviteEmail } from "../lib/email";
import { stripe } from "../lib/stripe";

// Keys that can be stored per-tenant — extend this list as new services are added
export const API_KEY_SERVICES = [
  // ── Paid AI providers ──────────────────────────────────────────────────────
  { key: "anthropic",    label: "Anthropic (Claude AI)",      hint: "sk-ant-..." },
  { key: "openai",       label: "OpenAI (GPT)",               hint: "sk-..." },
  // ── Free AI providers ─────────────────────────────────────────────────────
  { key: "groq",         label: "Groq (free — Llama 3.3 70B)", hint: "gsk_..." },
  { key: "gemini",       label: "Google Gemini (free tier)",  hint: "AIza..." },
  { key: "ollama_url",   label: "Ollama (self-hosted, free)", hint: "http://localhost:11434/api" },
  // ── Other services ────────────────────────────────────────────────────────
  { key: "sendgrid",     label: "SendGrid (email)",           hint: "SG...." },
  { key: "twilio_sid",   label: "Twilio Account SID",         hint: "AC..." },
  { key: "twilio_auth",  label: "Twilio Auth Token",          hint: "" },
  { key: "stripe_secret",label: "Stripe Secret Key",          hint: "sk_live_... or sk_test_..." },
  { key: "stripe_public",label: "Stripe Publishable Key",     hint: "pk_live_... or pk_test_..." },
] as const;

export type ApiKeyService = (typeof API_KEY_SERVICES)[number]["key"];

const SETTING_PREFIX = "apikey:";

export const tenantRouter = router({
  /**
   * Get the current tenant's profile and plan details.
   */
  getCurrent: protectedProcedure.query(({ ctx }) => {
    // ctx.tenant is already loaded by createTRPCContext — no extra DB query needed.
    return {
      ...ctx.tenant,
      quotas: PLAN_QUOTAS[ctx.tenant.plan],
    };
  }),

  /**
   * Update basic business profile fields.
   * Requires admin or owner.
   */
  updateProfile: protectedProcedure
    .use(withAudit)
    .input(
      z.object({
        name: z.string().min(1).max(100).optional(),
        businessEmail: z.string().email().optional(),
        businessPhone: z.string().max(30).optional(),
        timezone: z.string().max(60).optional(),
        locale: z.string().max(10).optional(),
        logoUrl: z.string().url().optional(),
        websiteUrl: z.string().url().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const before = await ctx.db.query.tenants.findFirst({
        where: eq(tenants.id, ctx.tenant.id),
      });

      const [updated] = await ctx.db
        .update(tenants)
        .set({ ...input, updatedAt: new Date() } as any)
        .where(eq(tenants.id, ctx.tenant.id))
        .returning();

      await ctx.audit("tenant.settings_updated", {
        resourceType: "tenant",
        resourceId: ctx.tenant.id,
        before,
        after: updated,
      });

      return updated;
    }),

  /**
   * Get all settings for the current tenant.
   */
  getSettings: protectedProcedure.query(async ({ ctx }) => {
    const settings = await ctx.db.query.tenantSettings.findMany({
      where: eq(tenantSettings.tenantId, ctx.tenant.id),
    });

    // Return as a key-value map for easy consumption
    return Object.fromEntries(settings.map((s) => [s.key, s.value]));
  }),

  /**
   * Upsert a single setting key.
   */
  setSetting: protectedProcedure
    .use(withAudit)
    .input(
      z.object({
        key: z.string().min(1).max(100),
        value: z.unknown(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .insert(tenantSettings)
        .values({
          tenantId: ctx.tenant.id,
          key: input.key,
          value: input.value as Record<string, unknown>,
        } as any)
        .onConflictDoUpdate({
          target: [tenantSettings.tenantId, tenantSettings.key],
          set: {
            value: input.value as Record<string, unknown>,
            updatedAt: new Date(),
          } as any,
        });

      await ctx.audit("tenant.settings_updated", {
        resourceType: "tenant_setting",
        resourceId: input.key,
        after: { key: input.key, value: input.value },
      });

      return { success: true };
    }),

  // ─── API key management ────────────────────────────────────────────────────

  /**
   * List which API keys are configured — returns key names and masked values.
   * Never returns the full key.
   */
  listApiKeys: manageIntegrationsProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.query.tenantSettings.findMany({
      where: and(
        eq(tenantSettings.tenantId, ctx.tenant.id),
        like(tenantSettings.key, `${SETTING_PREFIX}%`)
      ),
    });

    return rows.map((r) => {
      const service = r.key.slice(SETTING_PREFIX.length);
      let masked = "";
      try {
        const plain = decrypt(r.value as string);
        masked = plain.length > 4 ? `${"•".repeat(plain.length - 4)}${plain.slice(-4)}` : "••••";
      } catch {
        masked = "••••";
      }
      return { service, masked, updatedAt: r.updatedAt };
    });
  }),

  /**
   * Save or overwrite an API key for a service.
   * The value is AES-256-GCM encrypted before storage.
   * Only services listed in API_KEY_SERVICES are accepted.
   */
  setApiKey: manageIntegrationsProcedure
    .use(withAudit)
    .input(
      z.object({
        service: z.enum(
          API_KEY_SERVICES.map((s) => s.key) as [string, ...string[]]
        ),
        value: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Validate Ollama URLs to prevent SSRF — the URL is used as an outbound
      // HTTP baseURL, so an attacker could point it at internal infrastructure.
      if (input.service === "ollama_url") {
        let parsed: URL;
        try {
          parsed = new URL(input.value);
        } catch {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Ollama URL is not a valid URL." });
        }
        if (!["http:", "https:"].includes(parsed.protocol)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Ollama URL must use http or https." });
        }
        // IPv4 private ranges + IPv6 loopback/link-local/private + 0.0.0.0
        const privateHost =
          /^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|0\.0\.0\.0|\[::1\]|\[::ffff:|^\[fc|\[fd|\[fe80:)/i;
        if (privateHost.test(parsed.hostname) && process.env.NODE_ENV === "production") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Ollama URL must not point to a private or link-local address in production." });
        }
      }

      const settingKey = `${SETTING_PREFIX}${input.service}`;
      const encryptedValue = encrypt(input.value);

      await ctx.db
        .insert(tenantSettings)
        .values({
          tenantId: ctx.tenant.id,
          key: settingKey,
          value: encryptedValue as unknown as Record<string, unknown>,
        } as any)
        .onConflictDoUpdate({
          target: [tenantSettings.tenantId, tenantSettings.key],
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          set: {
            value: encryptedValue as unknown as Record<string, unknown>,
            updatedAt: new Date(),
          } as any,
        });

      await ctx.audit("tenant.settings_updated", {
        resourceType: "api_key",
        resourceId: settingKey,
        after: { service: input.service, action: "set" },
      });

      return { success: true };
    }),

  /**
   * Delete a stored API key.
   */
  deleteApiKey: manageIntegrationsProcedure
    .use(withAudit)
    .input(z.object({ service: z.enum(API_KEY_SERVICES.map((s) => s.key) as [string, ...string[]]) }))
    .mutation(async ({ ctx, input }) => {
      const settingKey = `${SETTING_PREFIX}${input.service}`;

      const existing = await ctx.db.query.tenantSettings.findFirst({
        where: and(
          eq(tenantSettings.tenantId, ctx.tenant.id),
          eq(tenantSettings.key, settingKey)
        ),
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      await ctx.db
        .delete(tenantSettings)
        .where(
          and(
            eq(tenantSettings.tenantId, ctx.tenant.id),
            eq(tenantSettings.key, settingKey)
          )
        );

      await ctx.audit("tenant.settings_updated", {
        resourceType: "api_key",
        resourceId: settingKey,
        after: { service: input.service, action: "deleted" },
      });

      return { success: true };
    }),

  // ─── Team / member management ─────────────────────────────────────────────

  /**
   * List all active members of the current workspace.
   */
  listMembers: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.query.tenantUsers.findMany({
      where: and(
        eq(tenantUsers.tenantId, ctx.tenant.id),
        eq(tenantUsers.isActive, true),
      ),
      // userId is the internal auth identity — never expose it to the client
      // (it could be used to impersonate other users via header injection)
      columns: {
        id: true,
        tenantId: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: (tu, { asc }) => asc(tu.createdAt),
    });
  }),

  /**
   * List pending (not yet accepted, not expired) invites.
   */
  listPendingInvites: manageStaffProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const all = await ctx.db.query.tenantInvites.findMany({
      where: and(
        eq(tenantInvites.tenantId, ctx.tenant.id),
        isNull(tenantInvites.acceptedAt),
      ),
      orderBy: (ti, { desc: d }) => d(ti.createdAt),
    });
    // Filter out expired ones in JS (simpler than a Drizzle gt() on a date)
    return all.filter((inv) => inv.expiresAt > now);
  }),

  /**
   * Invite a new member to the workspace. Sends invite email if RESEND_API_KEY is set.
   * Requires manageStaff permission (owner or admin).
   */
  inviteMember: manageStaffProcedure
    .use(withAudit)
    .input(
      z.object({
        email: z.string().email(),
        role:  z.enum(["admin", "staff", "readonly"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const email = input.email.toLowerCase().trim();

      // Check quota — owners can't exceed their plan's staff seat limit
      const quota = PLAN_QUOTAS[ctx.tenant.plan];
      if (quota.maxStaffSeats !== Infinity) {
        const currentCount = await ctx.db.query.tenantUsers.findMany({
          where: and(
            eq(tenantUsers.tenantId, ctx.tenant.id),
            eq(tenantUsers.isActive, true),
          ),
          columns: { id: true },
        });
        if (currentCount.length >= quota.maxStaffSeats) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `Your plan allows a maximum of ${quota.maxStaffSeats} staff seats. Upgrade to add more.`,
          });
        }
      }

      // Delete any stale pending invite for this email+tenant
      await ctx.db
        .delete(tenantInvites)
        .where(and(
          eq(tenantInvites.tenantId, ctx.tenant.id),
          eq(tenantInvites.email, email),
          isNull(tenantInvites.acceptedAt),
        ));

      const token     = randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      const [invite] = await ctx.db
        .insert(tenantInvites)
        .values({
          tenantId:  ctx.tenant.id,
          email,
          role:      input.role,
          token,
          expiresAt,
          invitedBy: ctx.tenantUser.userId,
        } as any)
        .returning();

      const base      = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
      const inviteUrl = `${base}/invite/${token}`;

      // Fire-and-forget email
      await sendInviteEmail({
        email,
        tenantName:   ctx.tenant.name,
        inviteUrl,
        role:         input.role,
        inviterEmail: ctx.tenantUser.email,
      });

      await ctx.audit("user.invited", {
        resourceType: "tenant_invite",
        resourceId:   invite!.id,
        after:        { email, role: input.role },
      });

      return { inviteUrl, expiresAt };
    }),

  /**
   * Revoke a pending invite.
   */
  revokeInvite: manageStaffProcedure
    .input(z.object({ inviteId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const invite = await ctx.db.query.tenantInvites.findFirst({
        where: and(
          eq(tenantInvites.id, input.inviteId),
          eq(tenantInvites.tenantId, ctx.tenant.id),
          isNull(tenantInvites.acceptedAt),
        ),
      });
      if (!invite) throw new TRPCError({ code: "NOT_FOUND" });

      await ctx.db
        .delete(tenantInvites)
        .where(eq(tenantInvites.id, input.inviteId));

      return { success: true };
    }),

  /**
   * Update a member's role. Owner cannot demote themselves.
   */
  updateMemberRole: manageStaffProcedure
    .use(withAudit)
    .input(
      z.object({
        tenantUserId: z.string().uuid(),
        role:         z.enum(["owner", "admin", "staff", "readonly"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Can't change your own role
      if (input.tenantUserId === ctx.tenantUser.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "You cannot change your own role." });
      }

      const member = await ctx.db.query.tenantUsers.findFirst({
        where: and(
          eq(tenantUsers.id, input.tenantUserId),
          eq(tenantUsers.tenantId, ctx.tenant.id),
          eq(tenantUsers.isActive, true),
        ),
      });
      if (!member) throw new TRPCError({ code: "NOT_FOUND" });

      // Only owners can promote to owner or demote other owners
      if (
        (input.role === "owner" || member.role === "owner") &&
        ctx.tenantUser.role !== "owner"
      ) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only owners can manage owner-level roles." });
      }

      await ctx.db
        .update(tenantUsers)
        .set({ role: input.role } as any)
        .where(eq(tenantUsers.id, input.tenantUserId));

      await ctx.audit("user.role_changed", {
        resourceType: "tenant_user",
        resourceId:   input.tenantUserId,
        before:       { role: member.role },
        after:        { role: input.role },
      });

      return { success: true };
    }),

  /**
   * Remove a member from the workspace (soft deactivate).
   */
  removeMember: manageStaffProcedure
    .use(withAudit)
    .input(z.object({ tenantUserId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Can't remove yourself
      if (input.tenantUserId === ctx.tenantUser.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "You cannot remove yourself from the workspace." });
      }

      const member = await ctx.db.query.tenantUsers.findFirst({
        where: and(
          eq(tenantUsers.id, input.tenantUserId),
          eq(tenantUsers.tenantId, ctx.tenant.id),
          eq(tenantUsers.isActive, true),
        ),
      });
      if (!member) throw new TRPCError({ code: "NOT_FOUND" });

      // Only owners can remove other owners
      if (member.role === "owner" && ctx.tenantUser.role !== "owner") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only owners can remove other owners." });
      }

      await ctx.db
        .update(tenantUsers)
        .set({ isActive: false } as any)
        .where(eq(tenantUsers.id, input.tenantUserId));

      await ctx.audit("user.removed", {
        resourceType: "tenant_user",
        resourceId:   input.tenantUserId,
        after:        { isActive: false },
      });

      return { success: true };
    }),

  // ─── Agent customization ───────────────────────────────────────────────────

  /** Load all agent:* settings for the current tenant. */
  getAgentSettings: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.query.tenantSettings.findMany({
      where: eq(tenantSettings.tenantId, ctx.tenant.id),
      columns: { key: true, value: true },
    });

    const map: Record<string, string> = {};
    for (const row of rows) {
      if ((row.key as string).startsWith("agent:")) {
        map[row.key as string] = row.value as string;
      }
    }

    return {
      name:               map["agent:name"]          ?? "",
      tone:               map["agent:tone"]          ?? "friendly",
      language:           map["agent:language"]      ?? "en",
      greeting:           map["agent:greeting"]      ?? "",
      businessInfo:       map["agent:business_info"] ?? "",
      customInstructions: map["agent:instructions"]  ?? "",
      closingMessage:     map["agent:closing"]       ?? "",
      fallbackMessage:    map["agent:fallback"]      ?? "",
      // AI provider / model selection (empty = auto-priority fallback)
      provider:           map["agent:provider"]      ?? "",
      model:              map["agent:model"]         ?? "",
    };
  }),

  // ─── Stripe Connect ────────────────────────────────────────────────────────

  /** Return the tenant's Stripe Connect account status. */
  getConnectStatus: protectedProcedure.query(async ({ ctx }) => {
    const tenant = await ctx.db.query.tenants.findFirst({
      where: eq(tenants.id, ctx.tenant!.id),
      columns: {
        stripeConnectAccountId: true,
        stripeConnectOnboardingComplete: true,
      },
    });

    if (!tenant?.stripeConnectAccountId) {
      return { connected: false, onboardingComplete: false, chargesEnabled: false, payoutsEnabled: false, accountId: null };
    }

    try {
      const account = await stripe.accounts.retrieve(tenant.stripeConnectAccountId);
      return {
        connected: true,
        onboardingComplete: account.details_submitted ?? false,
        chargesEnabled: account.charges_enabled ?? false,
        payoutsEnabled: account.payouts_enabled ?? false,
        accountId: account.id,
      };
    } catch {
      // Account may have been deleted on Stripe side
      return { connected: false, onboardingComplete: false, chargesEnabled: false, payoutsEnabled: false, accountId: null };
    }
  }),

  /** Create (or resume) a Stripe Connect Express onboarding link. */
  createConnectOnboardingLink: protectedProcedure
    .use(withAudit)
    .mutation(async ({ ctx }) => {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
      const returnUrl  = `${appUrl}/settings?tab=payments&connect=success`;
      const refreshUrl = `${appUrl}/settings?tab=payments&connect=refresh`;

      let accountId = ctx.tenant!.stripeConnectAccountId as string | null;

      if (!accountId) {
        const account = await stripe.accounts.create({
          type: "express",
          metadata: { tenantId: ctx.tenant!.id },
        });
        accountId = account.id;
        await ctx.db
          .update(tenants)
          .set({ stripeConnectAccountId: accountId, updatedAt: new Date() } as any)
          .where(eq(tenants.id, ctx.tenant!.id));
      }

      const link = await stripe.accountLinks.create({
        account: accountId,
        refresh_url: refreshUrl,
        return_url:  returnUrl,
        type: "account_onboarding",
      });

      await ctx.audit("tenant.stripe_connect_started", {
        resourceType: "tenant",
        resourceId:   ctx.tenant!.id,
      });

      return { url: link.url };
    }),

  /** Unlink the tenant's Stripe Connect account (does not delete the Stripe account). */
  disconnectStripeConnect: protectedProcedure
    .use(withAudit)
    .mutation(async ({ ctx }) => {
      await ctx.db
        .update(tenants)
        .set({
          stripeConnectAccountId: null,
          stripeConnectOnboardingComplete: false,
          updatedAt: new Date(),
        } as any)
        .where(eq(tenants.id, ctx.tenant!.id));

      await ctx.audit("tenant.stripe_connect_disconnected", {
        resourceType: "tenant",
        resourceId:   ctx.tenant!.id,
      });

      return { success: true };
    }),

  /** Upsert agent customization settings for the current tenant. */
  saveAgentSettings: protectedProcedure
    .use(withAudit)
    .input(
      z.object({
        name:               z.string().max(60),
        tone:               z.enum(["friendly", "formal", "casual"]),
        language:           z.string().max(10),
        greeting:           z.string().max(500),
        businessInfo:       z.string().max(2000),
        customInstructions: z.string().max(2000),
        closingMessage:     z.string().max(500),
        fallbackMessage:    z.string().max(500),
        provider:           z.string().max(30),   // e.g. "groq", "openai", "" = auto
        model:              z.string().max(80),   // e.g. "llama-3.3-70b-versatile", "" = default
      })
    )
    .mutation(async ({ ctx, input }) => {
      const entries = [
        { key: "agent:name",          value: input.name },
        { key: "agent:tone",          value: input.tone },
        { key: "agent:language",      value: input.language },
        { key: "agent:greeting",      value: input.greeting },
        { key: "agent:business_info", value: input.businessInfo },
        { key: "agent:instructions",  value: input.customInstructions },
        { key: "agent:closing",       value: input.closingMessage },
        { key: "agent:fallback",      value: input.fallbackMessage },
        { key: "agent:provider",      value: input.provider },
        { key: "agent:model",         value: input.model },
      ];

      for (const { key, value } of entries) {
        await ctx.db
          .insert(tenantSettings)
          .values({ tenantId: ctx.tenant.id, key, value } as any)
          .onConflictDoUpdate({
            target: [tenantSettings.tenantId, tenantSettings.key] as any,
            set:    { value } as any,
          });
      }

      await ctx.audit("tenant.settings_updated", {
        resourceType: "agent_settings",
        resourceId:   ctx.tenant.id,
        after:        { name: input.name, tone: input.tone, language: input.language, provider: input.provider, model: input.model },
      });

      return { success: true };
    }),
});
