/**
 * tRPC request context.
 *
 * SECURITY RULE: tenantId is ALWAYS derived from the Clerk auth token
 * (specifically from the active Clerk Organization). It is never accepted
 * from query params, request body, or any client-supplied value.
 *
 * Flow:
 *   1. Clerk middleware (in Next.js middleware.ts) validates the session JWT.
 *   2. createTRPCContext extracts clerkUserId + clerkOrgId from the auth object.
 *   3. It looks up the tenant row using clerkOrgId.
 *   4. It looks up the tenantUser row using clerkUserId + tenantId.
 *   5. The resulting context carries { tenant, tenantUser, db }.
 *   6. All routers access tenant data ONLY through ctx.tenant.id.
 */

import { auth } from "@clerk/nextjs/server";
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
  clerkUserId: string;
  clerkOrgId: string;
  requestId: string;
  ipAddress: string | null;
  userAgent: string | null;
};

export type Context = PublicContext | AuthContext;

// ─── Context factory ──────────────────────────────────────────────────────────

export async function createTRPCContext(
  opts: FetchCreateContextFnOptions
): Promise<Context> {
  const requestId = crypto.randomUUID();
  const ipAddress =
    opts.req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = opts.req.headers.get("user-agent") ?? null;

  const { userId: clerkUserId, orgId: clerkOrgId } = await auth();

  // Not logged in — return public context (used by booking site routes)
  if (!clerkUserId || !clerkOrgId) {
    return { db, tenant: null, tenantUser: null, requestId, ipAddress, userAgent };
  }

  // Resolve tenant from Clerk org ID
  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.clerkOrgId, clerkOrgId),
  });

  if (!tenant || tenant.status === "suspended" || tenant.status === "cancelled") {
    // Tenant not found or inactive — treat as unauthenticated for back-office
    return { db, tenant: null, tenantUser: null, requestId, ipAddress, userAgent };
  }

  // Resolve the user's membership and role within this tenant
  const tenantUser = await db.query.tenantUsers.findFirst({
    where: and(
      eq(tenantUsers.tenantId, tenant.id),
      eq(tenantUsers.clerkUserId, clerkUserId),
      eq(tenantUsers.isActive, true)
    ),
  });

  if (!tenantUser) {
    return { db, tenant: null, tenantUser: null, requestId, ipAddress, userAgent };
  }

  return {
    db,
    tenant,
    tenantUser,
    clerkUserId,
    clerkOrgId,
    requestId,
    ipAddress,
    userAgent,
  };
}

export type TRPCContext = inferAsyncReturnType<typeof createTRPCContext>;
