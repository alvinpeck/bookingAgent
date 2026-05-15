/**
 * POST /api/admin/exit-portal
 *
 * Clears the impersonation session and redirects back to the admin panel.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAdminSession, IMPERSONATE_COOKIE } from "@/lib/admin-auth";

export async function POST() {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cookieStore = await cookies();

  // Clear impersonation cookie
  cookieStore.set(IMPERSONATE_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path:     "/",
    maxAge:   0,
  });

  // Clear active-tenant (admin panel uses its own context)
  cookieStore.set("active-tenant", "", {
    httpOnly: false,
    sameSite: "lax",
    path:     "/",
    maxAge:   0,
  });

  return NextResponse.json({ ok: true });
}
