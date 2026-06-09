import { NextResponse } from "next/server";
import { db, users, verificationTokens } from "@booking-agent/db";
import { eq } from "drizzle-orm";
import { randomBytes } from "crypto";
import { sendPasswordResetEmail } from "@booking-agent/trpc/lib/email";
import { checkRateLimit } from "@booking-agent/trpc/lib/redis";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    // Rate limit: 3 attempts per IP per hour to prevent email flooding / enumeration
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const { allowed } = await checkRateLimit(`rl:forgot:${ip}`, 3, 60 * 60);
    if (!allowed) {
      // Return 200 (same as success) to avoid leaking rate-limit state
      return NextResponse.json({ ok: true });
    }

    const { email } = await req.json();
    if (!email) return NextResponse.json({ error: "Email is required." }, { status: 400 });

    const normalizedEmail = email.toLowerCase().trim();

    // Always return the same response to prevent email enumeration
    const [user] = await db
      .select({ id: users.id, password: users.password })
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    if (!user || !user.password) {
      // No account or Google-only account — still return success to prevent enumeration
      return NextResponse.json({ ok: true });
    }

    // Delete any existing reset tokens for this email
    await db
      .delete(verificationTokens)
      .where(eq(verificationTokens.identifier, `reset:${normalizedEmail}`));

    // Generate a new reset token (expires in 1 hour)
    const token     = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await db.insert(verificationTokens).values({
      identifier: `reset:${normalizedEmail}`,
      token,
      expires: expiresAt,
    });

    const base     = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    // Token only in the URL — no email in query params (avoids browser history,
    // server logs, and referrer header leakage). The reset-password route looks
    // up the email from the DB using the token alone.
    const resetUrl = `${base}/reset-password/${token}`;

    // Send the reset email via Resend (fire-and-forget)
    await sendPasswordResetEmail({ email: normalizedEmail, resetUrl });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[forgot-password]", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
