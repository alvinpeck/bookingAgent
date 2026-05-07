import { NextRequest, NextResponse } from "next/server";
import { verifyAdminCredentials, createSession, ADMIN_COOKIE } from "@/lib/admin-auth";

const JWT_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

export async function POST(req: NextRequest) {
  let email: string;
  let password: string;

  try {
    const body = await req.json() as { email?: unknown; password?: unknown };
    if (typeof body.email !== "string" || typeof body.password !== "string") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    email = body.email.toLowerCase().trim();
    password = body.password;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Verify credentials — only DB call during login
  const user = await verifyAdminCredentials(email, password);
  if (!user) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  // Sign JWT — no DB write needed
  const token = createSession(user);

  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: JWT_TTL_SECONDS,
    path: "/",
  });

  return response;
}
