import { createHmac, randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { cookies } from "next/headers";
import { eq, and } from "drizzle-orm";
import { db, staff, tenants, tenantUsers } from "@booking-agent/db";

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
  "email",
  "profile",
].join(" ");

/**
 * GET /api/integrations/google/connect
 *
 * Initiates the Google Calendar OAuth 2.0 flow.
 * Builds a signed state token (HMAC-SHA256) containing the staff ID so the
 * callback can safely associate the tokens with the correct staff record.
 */
export async function GET() {
  const session = await auth();
  const cookieStore = await cookies();
  const activeTenantId = cookieStore.get("active-tenant")?.value;

  if (!session?.user?.id || !activeTenantId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const userId = session.user.id;

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  const encryptionKey = process.env.ENCRYPTION_KEY;

  if (!clientId || !redirectUri || !encryptionKey) {
    return NextResponse.json(
      {
        error:
          "Google OAuth is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI.",
      },
      { status: 500 }
    );
  }

  // Resolve the tenant + staff record for this user
  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, activeTenantId),
    columns: { id: true },
  });
  if (!tenant) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  const tenantUser = await db.query.tenantUsers.findFirst({
    where: and(
      eq(tenantUsers.tenantId, tenant.id),
      eq(tenantUsers.userId, userId)
    ),
    columns: { id: true },
  });

  const staffRecord = tenantUser
    ? await db.query.staff.findFirst({
        where: and(
          eq(staff.tenantId, tenant.id),
          eq(staff.tenantUserId, tenantUser.id)
        ),
        columns: { id: true },
      })
    : null;

  if (!staffRecord) {
    return NextResponse.json(
      { error: "You must have a staff record to connect Google Calendar." },
      { status: 400 }
    );
  }

  // Build state = staffId:nonce:hmac so the callback can verify it
  const nonce = randomBytes(16).toString("hex");
  const payload = `${staffRecord.id}:${nonce}`;
  const sig = createHmac("sha256", encryptionKey).update(payload).digest("hex");
  const state = Buffer.from(`${payload}:${sig}`).toString("base64url");

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", SCOPES);
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent"); // always get refresh token
  authUrl.searchParams.set("state", state);

  return NextResponse.redirect(authUrl.toString());
}
