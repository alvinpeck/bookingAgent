/**
 * Admin authentication — JWT-based, stateless.
 *
 * Uses Node.js built-in `crypto` only — no external JWT library.
 * Algorithm: HMAC-SHA256 (HS256)
 * Secret:    JWT_SECRET env var (min 32 chars)
 * TTL:       7 days
 *
 * Password hashing: scrypt (Node built-in, no bcrypt needed)
 */

import { db, adminUsers } from "@booking-agent/db";
import { eq, and } from "drizzle-orm";
import { createHmac, scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { cookies } from "next/headers";
import { z } from "zod";

const scryptAsync = promisify(scrypt);

export const ADMIN_COOKIE       = "admin_session";
export const IMPERSONATE_COOKIE = "admin_impersonate";
const JWT_TTL_SECONDS           = 7 * 24 * 60 * 60; // 7 days
const IMPERSONATE_TTL_SECONDS   = 4 * 60 * 60;       // 4 hours

// ─── Runtime payload schemas ──────────────────────────────────────────────────

const AdminPayloadSchema = z.object({
  sub:   z.string().min(1),
  email: z.string().email(),
  name:  z.string(),
  iat:   z.number().int(),
  exp:   z.number().int(),
});

const ImpersonatePayloadSchema = z.object({
  adminId:       z.string().min(1),
  adminEmail:    z.string().email(),
  tenantId:      z.string().uuid(),
  virtualUserId: z.string().min(1),
  iat:           z.number().int(),
  exp:           z.number().int(),
});

// ─── JWT helpers (no external library) ───────────────────────────────────────

function b64url(input: string | Buffer): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf.toString("base64url");
}

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET env var must be set and at least 32 characters.");
  }
  return secret;
}

export interface AdminPayload {
  sub: string;   // adminUser.id
  email: string;
  name: string;
  iat: number;   // issued at (unix seconds)
  exp: number;   // expires at (unix seconds)
}

/** Sign a JWT and return the token string */
export function signJwt(payload: Omit<AdminPayload, "iat" | "exp">): string {
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: AdminPayload = {
    ...payload,
    iat: now,
    exp: now + JWT_TTL_SECONDS,
  };

  const header  = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body    = b64url(JSON.stringify(fullPayload));
  const signing = `${header}.${body}`;
  const sig     = createHmac("sha256", getSecret()).update(signing).digest("base64url");

  return `${signing}.${sig}`;
}

/** Verify a JWT — returns payload or null if invalid/expired */
export function verifyJwt(token: string): AdminPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [header, body, sig] = parts as [string, string, string];

    // Verify signature (timing-safe)
    const expected = createHmac("sha256", getSecret())
      .update(`${header}.${body}`)
      .digest("base64url");
    const sigBuf  = Buffer.from(sig,      "base64url");
    const expBuf  = Buffer.from(expected, "base64url");
    if (sigBuf.length !== expBuf.length) return null;
    if (!timingSafeEqual(sigBuf, expBuf)) return null;

    // Decode and validate payload shape at runtime
    const raw = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    const parsed = AdminPayloadSchema.safeParse(raw);
    if (!parsed.success) return null;
    // Cast is safe — shape is guaranteed by the Zod parse above
    const payload = parsed.data as AdminPayload;

    // Check expiry
    if (Math.floor(Date.now() / 1000) > payload.exp) return null;

    return payload;
  } catch {
    return null;
  }
}

// ─── Password hashing ─────────────────────────────────────────────────────────

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const hash = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${hash.toString("hex")}`;
}

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

// ─── Session helpers ──────────────────────────────────────────────────────────

/** Create a JWT for the given admin user and return the token string */
export function createSession(user: { id: string; email: string; name: string }): string {
  return signJwt({ sub: user.id, email: user.email, name: user.name });
}

/**
 * Read + verify the JWT from the admin_session cookie.
 * Returns the decoded payload or null — no DB query needed.
 */
export async function getAdminSession(): Promise<AdminPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_COOKIE)?.value;
  if (!token) return null;
  return verifyJwt(token);
}

// ─── Impersonation JWT ────────────────────────────────────────────────────────

export interface ImpersonatePayload {
  adminId:       string;   // adminUsers.id
  adminEmail:    string;
  tenantId:      string;   // target tenant being impersonated
  virtualUserId: string;   // "superadmin:{adminId}" — inserted into tenantUsers
  iat: number;
  exp: number;
}

/** Sign a short-lived (4h) impersonation token */
export function signImpersonateJwt(
  payload: Omit<ImpersonatePayload, "iat" | "exp">
): string {
  const now = Math.floor(Date.now() / 1000);
  const full: ImpersonatePayload = { ...payload, iat: now, exp: now + IMPERSONATE_TTL_SECONDS };
  const header  = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body    = b64url(JSON.stringify(full));
  const signing = `${header}.${body}`;
  const sig     = createHmac("sha256", getSecret()).update(signing).digest("base64url");
  return `${signing}.${sig}`;
}

/** Verify an impersonation token — returns payload or null */
export function verifyImpersonateJwt(token: string): ImpersonatePayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [header, body, sig] = parts as [string, string, string];
    const expected = createHmac("sha256", getSecret())
      .update(`${header}.${body}`)
      .digest("base64url");
    const sigBuf = Buffer.from(sig,      "base64url");
    const expBuf = Buffer.from(expected, "base64url");
    if (sigBuf.length !== expBuf.length) return null;
    if (!timingSafeEqual(sigBuf, expBuf)) return null;
    const raw = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    const parsed = ImpersonatePayloadSchema.safeParse(raw);
    if (!parsed.success) return null;
    const payload = parsed.data as ImpersonatePayload;
    if (Math.floor(Date.now() / 1000) > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Read + verify the impersonation cookie (server component / route handler). */
export async function getAdminImpersonation(): Promise<ImpersonatePayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(IMPERSONATE_COOKIE)?.value;
  if (!token) return null;
  return verifyImpersonateJwt(token);
}

/**
 * Verify admin credentials and return user if valid.
 * This is the only place we touch the DB during auth.
 */
export async function verifyAdminCredentials(
  email: string,
  password: string
): Promise<{ id: string; email: string; name: string } | null> {
  const user = await db.query.adminUsers.findFirst({
    where: and(eq(adminUsers.email, email), eq(adminUsers.isActive, true)),
    columns: { id: true, email: true, name: true, passwordHash: true },
  });

  if (!user) return null;
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return null;

  return { id: user.id, email: user.email, name: user.name };
}
