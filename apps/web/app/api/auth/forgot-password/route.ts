import { NextResponse } from "next/server";
import { db, users, verificationTokens } from "@booking-agent/db";
import { eq } from "drizzle-orm";
import { randomBytes } from "crypto";
import { sendPasswordResetEmail } from "@booking-agent/trpc/lib/email";

export async function POST(req: Request) {
  try {
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
    const resetUrl = `${base}/reset-password?token=${token}&email=${encodeURIComponent(normalizedEmail)}`;

    // Send the reset email via Resend (fire-and-forget)
    await sendPasswordResetEmail({ email: normalizedEmail, resetUrl });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[forgot-password]", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
