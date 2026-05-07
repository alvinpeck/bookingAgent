import { NextRequest, NextResponse } from "next/server";
import { db, adminUsers } from "@booking-agent/db";
import { eq, and } from "drizzle-orm";
import { verifyPassword, createSession, ADMIN_COOKIE } from "@/lib/admin-auth";

export async function POST(req: NextRequest) {
  let email: string;
  let password: string;

  try {
    const body = await req.json() as { email?: unknown; password?: unknown };
    if (typeof body.email !== "string" || typeof body.password !== "string") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    email = body.email;
    password = body.password;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Look up active user by email
  const user = await db.query.adminUsers.findFirst({
    where: and(
      eq(adminUsers.email, email.toLowerCase().trim()),
      eq(adminUsers.isActive, true)
    ),
  });

  if (!user) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const token = await createSession(user.id);

  const isProduction = process.env.NODE_ENV === "production";
  const maxAge = 7 * 24 * 60 * 60; // 7 days in seconds

  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    maxAge,
    path: "/",
  });

  return response;
}
