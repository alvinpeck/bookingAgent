import { NextResponse } from "next/server";
import { db, users, verificationTokens } from "@booking-agent/db";
import { eq } from "drizzle-orm";
import { scrypt, randomBytes } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const hash = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${hash.toString("hex")}`;
}

export async function POST(req: Request) {
  try {
    // Email is no longer accepted from the client — it is derived from the DB
    // record to prevent URL-parameter enumeration and email-as-input injection.
    const { token, password } = await req.json();

    if (!token || !password) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }
    if (password.length < 12) {
      return NextResponse.json({ error: "Password must be at least 12 characters." }, { status: 400 });
    }

    // Look up the reset token by token value alone — identifier (email) is
    // never trusted from the client; it comes from the server-side DB record.
    const [record] = await db
      .select()
      .from(verificationTokens)
      .where(eq(verificationTokens.token, token))
      .limit(1);

    if (!record || !record.identifier.startsWith("reset:")) {
      return NextResponse.json({ error: "Invalid or expired reset link." }, { status: 400 });
    }

    if (new Date() > record.expires) {
      await db
        .delete(verificationTokens)
        .where(eq(verificationTokens.identifier, record.identifier));
      return NextResponse.json({ error: "This reset link has expired. Please request a new one." }, { status: 400 });
    }

    // Derive email from the identifier stored server-side
    const normalizedEmail = record.identifier.slice("reset:".length);

    // Update the password
    const hashed = await hashPassword(password);
    await db
      .update(users)
      .set({ password: hashed } as any)
      .where(eq(users.email, normalizedEmail));

    // Delete the used token (single-use)
    await db
      .delete(verificationTokens)
      .where(eq(verificationTokens.identifier, record.identifier));

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[reset-password]", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
