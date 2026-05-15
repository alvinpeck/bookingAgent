import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db, tenants, tenantUsers, users } from "@booking-agent/db";
import { eq } from "drizzle-orm";
import Stripe from "stripe";

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2026-04-22.dahlia" })
  : null;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { name?: string; slug?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const name = body.name?.trim();
  const slug = body.slug?.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");

  if (!name || name.length < 2) {
    return NextResponse.json({ error: "Workspace name is required." }, { status: 400 });
  }
  if (!slug || slug.length < 2) {
    return NextResponse.json({ error: "Workspace slug is required." }, { status: 400 });
  }
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return NextResponse.json(
      { error: "Slug may only contain lowercase letters, numbers, and hyphens." },
      { status: 400 }
    );
  }

  // Check slug uniqueness
  const existing = await db.query.tenants.findFirst({
    where: eq(tenants.slug, slug),
    columns: { id: true },
  });
  if (existing) {
    return NextResponse.json({ error: "That workspace URL is already taken." }, { status: 409 });
  }

  // Get user details for denormalized fields
  const user = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
    columns: { email: true, name: true, image: true },
  });

  // Provision a Stripe customer for this workspace (fire-and-forget safe)
  let stripeCustomerId: string | null = null;
  if (stripe) {
    try {
      const customer = await stripe.customers.create({
        name,
        email: user?.email ?? session.user.email ?? undefined,
        metadata: { slug },
      });
      stripeCustomerId = customer.id;
    } catch (err) {
      console.error("[workspaces/create] Stripe customer creation failed:", err);
      // Non-fatal — tenant is still created without a Stripe customer
    }
  }

  // Create tenant
  const [tenant] = await db
    .insert(tenants)
    .values({
      name,
      slug,
      plan: "starter",
      status: "active",
      ...(stripeCustomerId ? { stripeCustomerId } : {}),
    } as any)
    .returning();

  if (!tenant) {
    return NextResponse.json({ error: "Failed to create workspace." }, { status: 500 });
  }

  // Add creator as owner
  const nameParts = (user?.name ?? session.user.name ?? "").split(" ");
  await db
    .insert(tenantUsers)
    .values({
      tenantId:  tenant.id,
      userId:    session.user.id,
      email:     user?.email ?? session.user.email ?? "",
      firstName: nameParts[0] ?? null,
      lastName:  nameParts.slice(1).join(" ") || null,
      avatarUrl: user?.image ?? session.user.image ?? null,
      role:      "owner",
      isActive:  true,
    } as any)
    .onConflictDoNothing();

  // Set active-tenant cookie on the response
  const response = NextResponse.json({ ok: true, tenantId: tenant.id, name: tenant.name, slug: tenant.slug });
  response.cookies.set("active-tenant", tenant.id, {
    httpOnly: true,
    sameSite: "lax",
    secure:   process.env.NODE_ENV === "production",
    maxAge:   30 * 24 * 60 * 60, // 30 days
    path:     "/",
  });
  return response;
}
