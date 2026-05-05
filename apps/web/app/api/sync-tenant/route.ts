import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db, tenants, tenantUsers, staff, availabilityRules, type UserRole } from "@booking-agent/db";

const DEFAULT_RULES = [
  { dayOfWeek: "monday",    startTime: "09:00", endTime: "17:00" },
  { dayOfWeek: "tuesday",   startTime: "09:00", endTime: "17:00" },
  { dayOfWeek: "wednesday", startTime: "09:00", endTime: "17:00" },
  { dayOfWeek: "thursday",  startTime: "09:00", endTime: "17:00" },
  { dayOfWeek: "friday",    startTime: "09:00", endTime: "17:00" },
] as const;

/**
 * POST /api/sync-tenant
 *
 * Upserts the tenant and tenantUser rows from the current Clerk session.
 * Called from the onboarding page after createOrganization() succeeds,
 * as a fallback for when the Clerk webhook is not yet configured locally.
 */
export async function POST() {
  const { userId, orgId } = await auth();

  if (!userId || !orgId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const client = await clerkClient();

  // Fetch org + user from Clerk in parallel
  const [org, user, { data: memberships }] = await Promise.all([
    client.organizations.getOrganization({ organizationId: orgId }),
    client.users.getUser(userId),
    client.organizations.getOrganizationMembershipList({ organizationId: orgId }),
  ]);

  // Determine this user's role in the org
  const myMembership = memberships.find(
    (m) => m.publicUserData?.userId === userId
  );
  const rawRole = myMembership?.role?.replace(/^org:/, "") ?? "owner";
  const role = (
    ["owner", "admin", "staff", "readonly"].includes(rawRole) ? rawRole : "owner"
  ) as UserRole;

  // Upsert tenant row
  const [tenant] = await db
    .insert(tenants)
    .values({
      clerkOrgId: orgId,
      name: org.name,
      slug: org.slug ?? orgId,
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .onConflictDoUpdate({
      target: tenants.clerkOrgId,
      set: { name: org.name, updatedAt: new Date() } as any,
    })
    .returning();

  if (!tenant) {
    return NextResponse.json({ error: "Failed to upsert tenant" }, { status: 500 });
  }

  // Upsert tenantUser row
  const primaryEmail =
    user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)
      ?.emailAddress ?? "";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [tenantUser] = await db
    .insert(tenantUsers)
    .values({
      tenantId: tenant.id,
      clerkUserId: userId,
      email: primaryEmail,
      firstName: user.firstName ?? null,
      lastName: user.lastName ?? null,
      avatarUrl: user.imageUrl ?? null,
      role,
      isActive: true,
    } as any)
    .onConflictDoUpdate({
      target: [tenantUsers.tenantId, tenantUsers.clerkUserId],
      set: {
        role,
        firstName: user.firstName ?? null,
        lastName: user.lastName ?? null,
        avatarUrl: user.imageUrl ?? null,
        isActive: true,
        updatedAt: new Date(),
      } as any,
    })
    .returning();

  // Auto-create a staff record for this user if one doesn't exist yet
  if (tenantUser) {
    const existingStaff = await db.query.staff.findFirst({
      where: and(eq(staff.tenantId, tenant.id), eq(staff.tenantUserId, tenantUser.id)),
    });
    if (!existingStaff) {
      const displayName =
        [user.firstName, user.lastName].filter(Boolean).join(" ") ||
        primaryEmail.split("@")[0] ||
        "Staff";
      await db.transaction(async (tx) => {
        const [newStaff] = await tx.insert(staff).values({
          tenantId: tenant.id,
          tenantUserId: tenantUser.id,
          displayName,
          avatarUrl: user.imageUrl ?? null,
        } as any).returning();
        await tx.insert(availabilityRules).values(
          DEFAULT_RULES.map((r) => ({ tenantId: tenant.id, staffId: newStaff!.id, ...r, isActive: true }))
        );
      });
    }
  }

  return NextResponse.json({ ok: true, tenantId: tenant.id, slug: tenant.slug });
}
