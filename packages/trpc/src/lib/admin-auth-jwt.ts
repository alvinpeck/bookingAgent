/**
 * Minimal JWT verify — shared between the tRPC admin router and the web app.
 * Uses Node.js built-in crypto only — no external dependencies.
 */

import { createHmac, timingSafeEqual } from "crypto";

export const ADMIN_COOKIE = "admin_session";

export interface AdminPayload {
  sub: string;
  email: string;
  name: string;
  iat: number;
  exp: number;
}

export function verifyJwt(token: string): AdminPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [header, body, sig] = parts as [string, string, string];

    const secret = process.env.JWT_SECRET;
    if (!secret || secret.length < 32) return null;

    const expected = createHmac("sha256", secret)
      .update(`${header}.${body}`)
      .digest("base64url");

    const sigBuf = Buffer.from(sig,      "base64url");
    const expBuf = Buffer.from(expected, "base64url");
    if (sigBuf.length !== expBuf.length) return null;
    if (!timingSafeEqual(sigBuf, expBuf)) return null;

    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8")
    ) as AdminPayload;

    if (Math.floor(Date.now() / 1000) > payload.exp) return null;

    return payload;
  } catch {
    return null;
  }
}
