import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db, integrations, staff, tenants } from "@booking-agent/db";
import { encrypt } from "@booking-agent/trpc/lib/crypto";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

/**
 * GET /api/integrations/google/callback
 *
 * Handles the Google OAuth 2.0 redirect. Verifies the state signature,
 * exchanges the auth code for tokens, fetches the Google account email,
 * and upserts the integration row with AES-256-GCM encrypted tokens.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const stateB64 = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  if (error) {
    return NextResponse.redirect(
      `${appUrl}/integrations?error=${encodeURIComponent(error)}`
    );
  }

  if (!code || !stateB64) {
    return NextResponse.redirect(`${appUrl}/integrations?error=missing_params`);
  }

  const encryptionKey = process.env.ENCRYPTION_KEY;
  if (!encryptionKey) {
    return NextResponse.redirect(`${appUrl}/integrations?error=misconfigured`);
  }

  // ── Verify state signature ────────────────────────────────────────────────
  let staffId: string;
  try {
    const decoded = Buffer.from(stateB64, "base64url").toString();
    const parts = decoded.split(":");
    if (parts.length !== 3) throw new Error("Invalid state format");
    const [sid, nonce, sig] = parts as [string, string, string];
    const expectedSig = createHmac("sha256", encryptionKey)
      .update(`${sid}:${nonce}`)
      .digest("hex");
    if (
      !timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expectedSig, "hex"))
    ) {
      throw new Error("State signature mismatch");
    }
    staffId = sid;
  } catch {
    return NextResponse.redirect(`${appUrl}/integrations?error=invalid_state`);
  }

  // ── Resolve staff + tenant ────────────────────────────────────────────────
  const staffRecord = await db.query.staff.findFirst({
    where: eq(staff.id, staffId),
    columns: { id: true, tenantId: true },
  });
  if (!staffRecord) {
    return NextResponse.redirect(`${appUrl}/integrations?error=staff_not_found`);
  }

  // ── Exchange code for tokens ──────────────────────────────────────────────
  const tokenRes = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    console.error("[google-callback] Token exchange failed:", await tokenRes.text());
    return NextResponse.redirect(`${appUrl}/integrations?error=token_exchange_failed`);
  }

  const tokens = (await tokenRes.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope: string;
  };

  if (!tokens.refresh_token) {
    // No refresh token — user may have already connected before and not re-consented
    // Redirect with hint to disconnect first
    return NextResponse.redirect(
      `${appUrl}/integrations?error=no_refresh_token`
    );
  }

  // ── Fetch connected Google account email ──────────────────────────────────
  const userinfoRes = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const userinfo = userinfoRes.ok
    ? ((await userinfoRes.json()) as { email?: string })
    : {};

  // ── Upsert integration row ────────────────────────────────────────────────
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

  await db
    .insert(integrations)
    .values({
      tenantId: staffRecord.tenantId,
      staffId: staffRecord.id,
      type: "google_calendar",
      status: "active",
      googleEmail: userinfo.email ?? null,
      googleCalendarId: "primary",
      encryptedAccessToken: encrypt(tokens.access_token),
      encryptedRefreshToken: encrypt(tokens.refresh_token),
      tokenExpiresAt: expiresAt,
      scopes: tokens.scope.split(" "),
      writeBackEnabled: true,
    } as any)
    .onConflictDoUpdate({
      target: [integrations.staffId, integrations.type],
      set: {
        status: "active",
        googleEmail: userinfo.email ?? null,
        encryptedAccessToken: encrypt(tokens.access_token),
        encryptedRefreshToken: encrypt(tokens.refresh_token),
        tokenExpiresAt: expiresAt,
        scopes: tokens.scope.split(" "),
        updatedAt: new Date(),
      } as any,
    });

  return NextResponse.redirect(`${appUrl}/integrations?connected=true`);
}
