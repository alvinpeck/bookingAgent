import "server-only";

import { createTRPCContext, appRouter, createCallerFactory } from "@booking-agent/trpc";
import { cache } from "react";
import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "crypto";
import { getToken } from "next-auth/jwt";

/**
 * Server-side tRPC caller — works for both public and authenticated procedures.
 *
 * Session is read via getToken() from next-auth/jwt — a pure JWT crypto utility
 * that decrypts the session cookie without importing auth.ts (which pulls in
 * DrizzleAdapter and Node.js DB/Redis side-effects).
 *
 * The context is memoised per request via React cache() so multiple Server
 * Component calls in the same request share one DB lookup.
 */

const IMPERSONATE_COOKIE = "admin_impersonate";

function verifyImpersonateCookie(token: string): { virtualUserId: string; tenantId: string } | null {
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
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) return null;

    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (Math.floor(Date.now() / 1000) > payload.exp) return null;

    return { virtualUserId: payload.virtualUserId, tenantId: payload.tenantId };
  } catch {
    return null;
  }
}

const createContext = cache(async () => {
  const cookieStore  = await cookies();

  // Build a minimal Request so getToken() can read the cookie header
  const cookieHeader = cookieStore.getAll()
    .map(({ name, value }) => `${name}=${value}`)
    .join("; ");
  const fakeReq = new Request("http://internal-server-call", {
    headers: { cookie: cookieHeader },
  });

  const token = await getToken({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    req: fakeReq as any,
    secret: process.env.AUTH_SECRET!,
    // Fake request URL is always http:// — tell getToken the actual cookie prefix
    secureCookie: process.env.NODE_ENV === "production",
  });

  let userId         = (token?.sub as string) ?? null;
  let activeTenantId = cookieStore.get("active-tenant")?.value ?? null;

  // Impersonation takes priority — mirrors the HTTP route handler logic
  const impToken = cookieStore.get(IMPERSONATE_COOKIE)?.value;
  if (impToken) {
    const imp = verifyImpersonateCookie(impToken);
    if (imp) {
      userId         = imp.virtualUserId;
      activeTenantId = imp.tenantId;
    }
  }

  const req = new Request("http://internal-server-call", { headers: new Headers() });
  return createTRPCContext(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { req, resHeaders: new Headers() } as any,
    { userId, tenantId: activeTenantId }
  );
});

const createCaller = createCallerFactory(appRouter);

export const api = createCaller(createContext);
