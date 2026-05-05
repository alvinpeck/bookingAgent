import { z } from "zod";
import { eq, and, like } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  router,
  protectedProcedure,
  manageIntegrationsProcedure,
  manageBillingProcedure,
  withAudit,
} from "../trpc";
import { tenants, tenantSettings, PLAN_QUOTAS } from "@booking-agent/db";
import { encrypt, decrypt } from "../lib/crypto";

// Keys that can be stored per-tenant — extend this list as new services are added
export const API_KEY_SERVICES = [
  { key: "anthropic",    label: "Anthropic (Claude AI)",      hint: "sk-ant-..." },
  { key: "openai",       label: "OpenAI (GPT)",               hint: "sk-..." },
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
  getCurrent: protectedProcedure.query(async ({ ctx }) => {
    const tenant = await ctx.db.query.tenants.findFirst({
      where: eq(tenants.id, ctx.tenant.id),
    });

    if (!tenant) throw new TRPCError({ code: "NOT_FOUND" });

    return {
      ...tenant,
      quotas: PLAN_QUOTAS[tenant.plan],
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
        .set({ ...input, updatedAt: new Date() })
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
        })
        .onConflictDoUpdate({
          target: [tenantSettings.tenantId, tenantSettings.key],
          set: {
            value: input.value as Record<string, unknown>,
            updatedAt: new Date(),
          },
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
   */
  setApiKey: manageIntegrationsProcedure
    .use(withAudit)
    .input(
      z.object({
        service: z.string().min(1).max(60),
        value: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const settingKey = `${SETTING_PREFIX}${input.service}`;
      const encryptedValue = encrypt(input.value);

      await ctx.db
        .insert(tenantSettings)
        .values({
          tenantId: ctx.tenant.id,
          key: settingKey,
          value: encryptedValue as unknown as Record<string, unknown>,
        })
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
    .input(z.object({ service: z.string().min(1).max(60) }))
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

  /**
   * Retrieve a decrypted API key value — for server-side use only.
   * This procedure is intentionally NOT exposed in a way that returns
   * the plain value to the browser; call it from Server Components or
   * API routes that keep the key server-side.
   */
  getApiKeyValue: manageIntegrationsProcedure
    .input(z.object({ service: z.string().min(1).max(60) }))
    .query(async ({ ctx, input }) => {
      const settingKey = `${SETTING_PREFIX}${input.service}`;
      const row = await ctx.db.query.tenantSettings.findFirst({
        where: and(
          eq(tenantSettings.tenantId, ctx.tenant.id),
          eq(tenantSettings.key, settingKey)
        ),
      });
      if (!row) return null;
      try {
        return decrypt(row.value as string);
      } catch {
        return null;
      }
    }),
});
