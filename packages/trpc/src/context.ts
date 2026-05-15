/**
 * tRPC request context.
 *
 * SECURITY RULE: tenantId is ALWAYS derived from server-side auth — never
 * accepted from query params, request body, or any client-supplied value.
 *
 * Flow:
 *   1. Auth.js middleware (in Next.js middleware.ts) validates the session JWT.
 *   2. The web app's tRPC route handler reads the session and active-tenant cookie.
 *   3. It injects x-user-id and x-tenant-id headers into the proxied request.
 *   4. createTRPCContext reads those trusted headers (set server-side only).
 *   5. It looks up the tenant row using tenantId.
 *   6. It looks up the tenantUser row using userId + tenantId.
 *   7. The resulting context carries { tenant, tenantUser, db }.
 *   8. All routers access tenant data ONLY through ctx.tenant.id.
 */

import { db } from "@booking-agent/db";
import { tenants, tenantUsers } from "@booking-agent/db";
import { eq, and } from "drizzle-orm";
import type { inferAsyncReturnType } from "@trpc/server";
import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";

// ─── Public context (unauthenticated) ────────────────────────────────────────

export type PublicContext = {
  db: typeof db;
  tenant: null;
  tenantUser: null;
  requestId: string;
  ipAddress: string | null;
  userAgent: string | null;
};

// ─── Authenticated context ────────────────────────────────────────────────────

export type AuthContext = {
  db: typeof db;
  tenant: typeof tenants.$inferSelect;
  tenantUser: typeof tenantUsers.$inferSelect;
  userId: string;
  tenantId: string;
  requestId: string;
  ipAddress: string | null;
  userAgent: string | null;
};

export type Context = PublicContext | AuthContext;

// ─── Context factory ──────────────────────────────────────────────────────────

export async function createTRPCContext(
  opts: FetchCreateContextFnOptions,
  auth?: { userId: string | null; tenantId: string | null }
): Promise<Context> {
  const requestId = crypto.randomUUID();
  const ipAddress =
    opts.req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = opts.req.headers.get("user-agent") ?? null;

  // Auth data injected by the route handler (preferred) or fallback to headers
  const userId   = auth?.userId   ?? opts.req.headers.get("x-user-id");
  const tenantId = auth?.tenantId ?? opts.req.headers.get("x-tenant-id");

  // Not logged in — return public context (used by booking site routes)
  if (!userId || !tenantId) {
    return { db, tenant: null, tenantUser: null, requestId, ipAddress, userAgent };
  }

  // Resolve tenant + tenantUser in parallel — one round-trip instead of two
  const [tenant, tenantUser] = await Promise.all([
    db.query.tenants.findFirst({
      where: eq(tenants.id, tenantId),
    }),
    db.query.tenantUsers.findFirst({
      where: and(
        eq(tenantUsers.tenantId, tenantId),
        eq(tenantUsers.userId, userId),
        eq(tenantUsers.isActive, true)
      ),
    }),
  ]);

  if (!tenant || tenant.status === "suspended" || tenant.status === "cancelled") {
    // Tenant not found or inactive — treat as unauthenticated for back-office
    return { db, tenant: null, tenantUser: null, requestId, ipAddress, userAgent };
  }

  if (!tenantUser) {
    return { db, tenant: null, tenantUser: null, requestId, ipAddress, userAgent };
  }

  return {
    db,
    tenant,
    tenantUser,
    userId,
    tenantId,
    requestId,
    ipAddress,
    userAgent,
  };
}

export type TRPCContext = inferAsyncReturnType<typeof createTRPCContext>;
