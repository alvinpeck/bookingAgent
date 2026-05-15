import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db, tenantUsers, tenants } from "@booking-agent/db";
import { eq, and } from "drizzle-orm";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json([]);

  const memberships = await db
    .select({
      tenantId: tenantUsers.tenantId,
      tenantName: tenants.name,
      role: tenantUsers.role,
    })
    .from(tenantUsers)
    .innerJoin(tenants, eq(tenants.id, tenantUsers.tenantId))
    .where(
      and(
        eq(tenantUsers.userId, session.user.id),
        eq(tenantUsers.isActive, true)
      )
    );

  return NextResponse.json(memberships);
}
