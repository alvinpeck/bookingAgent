import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { Webhook } from "svix";
import { db, tenants, tenantUsers } from "@booking-agent/db";
import { eq, and } from "drizzle-orm";

/**
 * Clerk webhook handler.
 *
 * Listens for:
 *   - organization.created  → create tenant row
 *   - organization.updated  → sync tenant name
 *   - organization.deleted  → mark tenant cancelled
 *   - organizationMembership.created → create tenantUser row
 *   - organizationMembership.updated → sync role
 *   - organizationMembership.deleted → deactivate tenantUser
 *   - user.updated           → sync display name/avatar
 *
 * Security: HMAC signature verified with CLERK_WEBHOOK_SECRET before processing.
 * Idempotent: all operations use upsert or check-before-write.
 */
export async function POST(req: Request) {
  const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[clerk-webhook] CLERK_WEBHOOK_SECRET not set");
    return NextResponse.json({ error: "Misconfigured" }, { status: 500 });
  }

  // ── Verify HMAC signature ──────────────────────────────────────────────────
  const headersList = await headers();
  const svixId = headersList.get("svix-id");
  const svixTimestamp = headersList.get("svix-timestamp");
  const svixSignature = headersList.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: "Missing svix headers" }, { status: 400 });
  }

  const body = await req.text();
  const wh = new Webhook(webhookSecret);

  let event: { type: string; data: Record<string, unknown> };
  try {
    event = wh.verify(body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as typeof event;
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // ── Handle events ──────────────────────────────────────────────────────────
  try {
    switch (event.type) {
      case "organization.created": {
        const org = event.data as {
          id: string;
          name: string;
          slug: string;
        };
        await db
          .insert(tenants)
          .values({
            clerkOrgId: org.id,
            name: org.name,
            slug: org.slug ?? org.id,
          })
          .onConflictDoNothing();
        break;
      }

      case "organization.updated": {
        const org = event.data as { id: string; name: string };
        await db
          .update(tenants)
          .set({ name: org.name, updatedAt: new Date() })
          .where(eq(tenants.clerkOrgId, org.id));
        break;
      }

      case "organization.deleted": {
        const org = event.data as { id: string };
        await db
          .update(tenants)
          .set({ status: "cancelled", updatedAt: new Date() })
          .where(eq(tenants.clerkOrgId, org.id));
        break;
      }

      case "organizationMembership.created":
      case "organizationMembership.updated": {
        const membership = event.data as {
          organization: { id: string };
          public_user_data: {
            user_id: string;
            first_name: string | null;
            last_name: string | null;
            image_url: string | null;
            identifier: string;
          };
          role: string;
        };

        const tenant = await db.query.tenants.findFirst({
          where: eq(tenants.clerkOrgId, membership.organization.id),
        });
        if (!tenant) break;

        // Normalise Clerk role names (e.g. "org:admin" → "admin")
        const rawRole = membership.role.replace(/^org:/, "");
        const role = (["owner", "admin", "staff", "readonly"].includes(rawRole)
          ? rawRole
          : "staff") as typeof tenantUsers.$inferInsert["role"];

        await db
          .insert(tenantUsers)
          .values({
            tenantId: tenant.id,
            clerkUserId: membership.public_user_data.user_id,
            email: membership.public_user_data.identifier,
            firstName: membership.public_user_data.first_name,
            lastName: membership.public_user_data.last_name,
            avatarUrl: membership.public_user_data.image_url,
            role,
            isActive: true,
          })
          .onConflictDoUpdate({
            target: [tenantUsers.tenantId, tenantUsers.clerkUserId],
            set: {
              role,
              firstName: membership.public_user_data.first_name,
              lastName: membership.public_user_data.last_name,
              avatarUrl: membership.public_user_data.image_url,
              updatedAt: new Date(),
            },
          });
        break;
      }

      case "organizationMembership.deleted": {
        const membership = event.data as {
          organization: { id: string };
          public_user_data: { user_id: string };
        };
        const tenant = await db.query.tenants.findFirst({
          where: eq(tenants.clerkOrgId, membership.organization.id),
        });
        if (!tenant) break;

        await db
          .update(tenantUsers)
          .set({ isActive: false, updatedAt: new Date() })
          .where(
            and(
              eq(tenantUsers.tenantId, tenant.id),
              eq(tenantUsers.clerkUserId, membership.public_user_data.user_id)
            )
          );
        break;
      }

      default:
        // Unhandled event type — ignore
        break;
    }
  } catch (err) {
    console.error("[clerk-webhook] Processing error:", err);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
