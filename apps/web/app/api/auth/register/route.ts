import { NextResponse } from "next/server";
import { db, users } from "@booking-agent/db";
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
    const { name, email, password } = await req.json();

    if (!name?.trim() || !email?.trim() || !password) {
      return NextResponse.json({ error: "Name, email and password are required." }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check for existing account
    const [existing] = await db
      .select({ id: users.id, password: users.password })
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    if (existing) {
      if (existing.password) {
        return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
      } else {
        // Google-only account — set password so they can also use credentials
        const hashed = await hashPassword(password);
        await db.update(users).set({ password: hashed, name: name.trim() } as any).where(eq(users.email, normalizedEmail));
        return NextResponse.json({ ok: true });
      }
    }

    const hashed = await hashPassword(password);
    await db.insert(users).values({
      email: normalizedEmail,
      name:  name.trim(),
      password: hashed,
    } as any);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[register]", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
