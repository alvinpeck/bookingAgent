import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db, tenantUsers } from "@booking-agent/db";
import { eq, and } from "drizzle-orm";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { tenantId } = await req.json();

  // Verify user is actually a member of this tenant
  const membership = await db.query.tenantUsers.findFirst({
    where: and(
      eq(tenantUsers.userId, session.user.id),
      eq(tenantUsers.tenantId, tenantId),
      eq(tenantUsers.isActive, true)
    ),
  });

  if (!membership)
    return NextResponse.json({ error: "Not a member" }, { status: 403 });

  const response = NextResponse.json({ ok: true });
  response.cookies.set("active-tenant", tenantId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 30 * 24 * 60 * 60, // 30 days
    path: "/",
  });
  return response;
}
