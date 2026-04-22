import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";
import type { TRPCContext } from "./context";
import type { UserRole, Permission } from "@booking-agent/db";
import { hasPermission } from "@booking-agent/db";

// ─── tRPC init ────────────────────────────────────────────────────────────────

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        // Expose Zod validation errors in a structured way
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

// ─── Router and middleware builders ──────────────────────────────────────────

export const router = t.router;
export const middleware = t.middleware;
export const mergeRouters = t.mergeRouters;

// ─── Procedures ───────────────────────────────────────────────────────────────

/**
 * Public procedure — no auth required.
 * Used for: booking site slot queries, public service listings.
 */
export const publicProcedure = t.procedure;

// ─── Auth middleware ──────────────────────────────────────────────────────────

const isAuthenticated = middleware(({ ctx, next }) => {
  if (!ctx.tenant || !ctx.tenantUser) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You must be signed in to access this resource.",
    });
  }
  return next({
    ctx: {
      ...ctx,
      tenant: ctx.tenant,
      tenantUser: ctx.tenantUser,
    },
  });
});

/**
 * Protected procedure — requires valid Clerk session + active tenant membership.
 * All back-office routes should use this or a more-specific variant below.
 */
export const protectedProcedure = t.procedure.use(isAuthenticated);

// ─── RBAC middleware factory ──────────────────────────────────────────────────

/**
 * Creates a procedure that enforces a specific permission.
 *
 * Usage:
 *   requirePermission("manageBookings")  → throws FORBIDDEN if role lacks it
 *   requirePermission("manageBilling")   → only owners can proceed
 *
 * The permission matrix is defined in packages/db/src/schema/users.ts.
 */
export function requirePermission(permission: Permission) {
  return protectedProcedure.use(({ ctx, next }) => {
    const role = ctx.tenantUser.role as UserRole;
    if (!hasPermission(role, permission)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `Your role (${role}) does not have the '${permission}' permission.`,
      });
    }
    return next({ ctx });
  });
}

// Convenience shortcuts for common permission gates
export const manageBookingsProcedure = requirePermission("manageBookings");
export const manageServicesProcedure = requirePermission("manageServices");
export const manageStaffProcedure = requirePermission("manageStaff");
export const manageIntegrationsProcedure = requirePermission("manageIntegrations");
export const manageBillingProcedure = requirePermission("manageBilling");
export const manageChannelsProcedure = requirePermission("manageChannels");
export const viewAuditLogsProcedure = requirePermission("viewAuditLogs");

// ─── Audit log middleware ─────────────────────────────────────────────────────

/**
 * Applied to write procedures that require an audit trail.
 * Passes auditLog helper into context so the resolver can call it
 * without duplicating boilerplate.
 *
 * Usage in a resolver:
 *   ctx.audit("booking.created", { resourceType: "booking", resourceId: booking.id, after: booking })
 */
export const withAudit = middleware(async ({ ctx, next, path }) => {
  const result = await next({
    ctx: {
      ...ctx,
      audit: async (
        action: Parameters<typeof createAuditEntry>[0]["action"],
        data: Omit<Parameters<typeof createAuditEntry>[0], "ctx" | "action">
      ) => {
        if (!ctx.tenant || !ctx.tenantUser) return;
        await createAuditEntry({
          ctx: ctx as Required<typeof ctx>,
          action,
          ...data,
        });
      },
    },
  });
  return result;
});

// ─── Audit entry helper ───────────────────────────────────────────────────────

import { auditLogs } from "@booking-agent/db";

type AuditEntryInput = {
  ctx: {
    db: typeof import("@booking-agent/db").db;
    tenant: NonNullable<TRPCContext["tenant"]>;
    tenantUser: NonNullable<TRPCContext["tenantUser"]>;
    requestId: string;
    ipAddress: string | null;
    userAgent: string | null;
  };
  action: typeof auditLogs.$inferInsert["action"];
  resourceType?: string;
  resourceId?: string;
  before?: unknown;
  after?: unknown;
  metadata?: unknown;
};

async function createAuditEntry({
  ctx,
  action,
  resourceType,
  resourceId,
  before,
  after,
  metadata,
}: AuditEntryInput) {
  try {
    await ctx.db.insert(auditLogs).values({
      tenantId: ctx.tenant.id,
      action,
      actorId: `user:${ctx.tenantUser.clerkUserId}`,
      actorEmail: ctx.tenantUser.email,
      actorRole: ctx.tenantUser.role,
      resourceType: resourceType ?? null,
      resourceId: resourceId ?? null,
      before: before ? (before as Record<string, unknown>) : null,
      after: after ? (after as Record<string, unknown>) : null,
      metadata: metadata ? (metadata as Record<string, unknown>) : null,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });
  } catch (err) {
    // Audit log failure must NEVER crash the main operation
    console.error("[audit] Failed to write audit log:", err);
  }
}
