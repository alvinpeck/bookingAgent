import { db, adminUsers, adminSessions } from "@booking-agent/db";
import { eq, and, gt } from "drizzle-orm";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { cookies } from "next/headers";

const scryptAsync = promisify(scrypt);

export const ADMIN_COOKIE = "admin_session";
const SESSION_TTL_DAYS = 7;

// Hash a password
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const hash = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${hash.toString("hex")}`;
}

// Verify a password against a stored hash
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  try {
    const hashBuf = (await scryptAsync(password, salt, 64)) as Buffer;
    return timingSafeEqual(hashBuf, Buffer.from(hash, "hex"));
  } catch {
    return false;
  }
}

// Create a session and return the token
export async function createSession(adminUserId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_TTL_DAYS);

  await db.insert(adminSessions).values({
    adminUserId,
    token,
    expiresAt,
  } as any);

  return token;
}

// Validate session from cookie — returns adminUser or null
export async function getAdminSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_COOKIE)?.value;
  if (!token) return null;

  const session = await db.query.adminSessions.findFirst({
    where: and(
      eq(adminSessions.token, token),
      gt(adminSessions.expiresAt, new Date())
    ),
  });
  if (!session) return null;

  const user = await db.query.adminUsers.findFirst({
    where: and(
      eq(adminUsers.id, session.adminUserId),
      eq(adminUsers.isActive, true)
    ),
    columns: { id: true, email: true, name: true },
  });

  return user ?? null;
}

// Delete session (logout)
export async function deleteSession(token: string): Promise<void> {
  await db.delete(adminSessions).where(eq(adminSessions.token, token));
}
