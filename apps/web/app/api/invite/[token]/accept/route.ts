import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db, tenantInvites, tenantUsers, users } from "@booking-agent/db";
import { eq, and, isNull } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { token } = await params;

  const invite = await db.query.tenantInvites.findFirst({
    where: and(eq(tenantInvites.token, token), isNull(tenantInvites.acceptedAt)),
  });

  if (!invite || new Date() > invite.expiresAt) {
    return NextResponse.json(
      { error: "Invalid or expired invite" },
      { status: 400 }
    );
  }

  // Get user details
  const user = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });

  // Create tenantUser membership
  await db
    .insert(tenantUsers)
    .values({
      tenantId:  invite.tenantId,
      userId:    session.user.id,
      email:     user?.email ?? session.user.email ?? "",
      firstName: session.user.name?.split(" ")[0] ?? null,
      lastName:  session.user.name?.split(" ").slice(1).join(" ") ?? null,
      avatarUrl: session.user.image ?? null,
      role:      invite.role,
      isActive:  true,
      invitedAt: invite.createdAt,
    } as any)
    .onConflictDoNothing();

  // Mark invite as accepted
  await db
    .update(tenantInvites)
    .set({ acceptedAt: new Date() } as any)
    .where(eq(tenantInvites.id, invite.id));

  // Set active-tenant cookie
  const response = NextResponse.json({ ok: true });
  response.cookies.set("active-tenant", invite.tenantId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 30 * 24 * 60 * 60,
    path: "/",
  });
  return response;
}
