/**
 * POST /api/admin/enter-portal
 *
 * Lets the super admin impersonate any tenant's back-office portal.
 *
 * Flow:
 *   1. Verify admin_session cookie.
 *   2. Upsert a tenantUsers row for the virtual admin user in the target tenant.
 *   3. Issue a short-lived admin_impersonate JWT (4 h).
 *   4. Set active-tenant cookie.
 *   5. Return { ok: true } — client redirects to /dashboard.
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  getAdminSession,
  signImpersonateJwt,
  IMPERSONATE_COOKIE,
} from "@/lib/admin-auth";
import { db, tenants, tenantUsers } from "@booking-agent/db";
import { eq, and } from "drizzle-orm";

export async function POST(req: NextRequest) {
  // ── 1. Verify admin session ─────────────────────────────────────────────────
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── 2. Parse body ───────────────────────────────────────────────────────────
  let tenantId: string;
  try {
    const body = await req.json();
    tenantId = body.tenantId;
    if (!tenantId) throw new Error("missing tenantId");
  } catch {
    return NextResponse.json({ error: "tenantId is required" }, { status: 400 });
  }

  // ── 3. Verify tenant exists and is active ───────────────────────────────────
  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
    columns: { id: true, status: true },
  });
  if (!tenant) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }
  if (tenant.status === "cancelled") {
    return NextResponse.json({ error: "This workspace is cancelled" }, { status: 400 });
  }

  // ── 4. Upsert virtual admin tenantUser row ──────────────────────────────────
  // virtualUserId is deterministic — no FK constraint on tenantUsers.userId
  const virtualUserId = `superadmin:${admin.sub}`;

  await db
    .insert(tenantUsers)
    .values({
      tenantId,
      userId:    virtualUserId,
      email:     admin.email,
      firstName: "Super",
      lastName:  "Admin",
      role:      "owner",
      isActive:  true,
    } as any)
    .onConflictDoUpdate({
      target: [tenantUsers.tenantId, tenantUsers.userId] as any,
      set: {
        role:      "owner",
        isActive:  true,
        firstName: "Super",
        lastName:  "Admin",
        email:     admin.email,
      } as any,
    });

  // ── 5. Issue impersonation JWT ──────────────────────────────────────────────
  const impToken = signImpersonateJwt({
    adminId:       admin.sub,
    adminEmail:    admin.email,
    tenantId,
    virtualUserId,
  });

  // ── 6. Set cookies ──────────────────────────────────────────────────────────
  const cookieStore = await cookies();

  cookieStore.set(IMPERSONATE_COOKIE, impToken, {
    httpOnly:  true,
    sameSite:  "lax",
    path:      "/",
    maxAge:    4 * 60 * 60, // 4 hours
    secure:    process.env.NODE_ENV === "production",
  });

  cookieStore.set("active-tenant", tenantId, {
    httpOnly:  false,  // readable by client for workspace switcher
    sameSite:  "lax",
    path:      "/",
    maxAge:    4 * 60 * 60,
    secure:    process.env.NODE_ENV === "production",
  });

  return NextResponse.json({ ok: true });
}
