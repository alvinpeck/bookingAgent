/**
 * Development seed script.
 * Run with: pnpm db:seed (from repo root)
 *
 * Creates:
 *   - 2 tenants (starter plan, growth plan)
 *   - 1 owner user per tenant
 *   - 3 services per tenant
 *   - Basic availability rules (Mon–Fri, 9–17)
 */

import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index";
import { eq } from "drizzle-orm";

const client = postgres(process.env.DATABASE_URL_DIRECT!, { max: 1 });
const db = drizzle(client, { schema });

async function seed() {
  console.log("🌱  Seeding database...\n");

  // ── Tenants ──────────────────────────────────────────────────────────────────

  const [acmeTenant] = await db
    .insert(schema.tenants)
    .values({
      clerkOrgId: "org_seed_acme_001",
      name: "Acme Barbershop",
      slug: "acme-barbershop",
      plan: "starter",
      status: "active",
      businessEmail: "info@acme-barbershop.example.com",
      timezone: "America/New_York",
    })
    .onConflictDoNothing()
    .returning();

  const [growthTenant] = await db
    .insert(schema.tenants)
    .values({
      clerkOrgId: "org_seed_growth_001",
      name: "Elite Wellness Studio",
      slug: "elite-wellness",
      plan: "growth",
      status: "active",
      businessEmail: "hello@elite-wellness.example.com",
      timezone: "Europe/London",
    })
    .onConflictDoNothing()
    .returning();

  if (!acmeTenant || !growthTenant) {
    console.log("Tenants already seeded — skipping.\n");
    await client.end();
    return;
  }

  console.log(`✅  Created tenants: ${acmeTenant.name}, ${growthTenant.name}`);

  // ── Tenant Users ──────────────────────────────────────────────────────────────

  const [ownerUser] = await db
    .insert(schema.tenantUsers)
    .values({
      tenantId: acmeTenant.id,
      clerkUserId: "user_seed_owner_001",
      email: "owner@acme-barbershop.example.com",
      firstName: "Alex",
      lastName: "Owner",
      role: "owner",
    })
    .returning();

  const [staffUser] = await db
    .insert(schema.tenantUsers)
    .values({
      tenantId: acmeTenant.id,
      clerkUserId: "user_seed_staff_001",
      email: "barber@acme-barbershop.example.com",
      firstName: "Jordan",
      lastName: "Barber",
      role: "staff",
    })
    .returning();

  console.log(`✅  Created users: ${ownerUser!.email}, ${staffUser!.email}`);

  // ── Services ──────────────────────────────────────────────────────────────────

  const serviceValues = [
    {
      tenantId: acmeTenant.id,
      name: "Haircut",
      slug: "haircut",
      status: "active" as const,
      durationMinutes: 30,
      bufferAfterMinutes: 10,
      price: "25.00",
      currency: "USD",
      isPublic: true,
      colorHex: "#6366f1",
    },
    {
      tenantId: acmeTenant.id,
      name: "Haircut + Beard Trim",
      slug: "haircut-beard",
      status: "active" as const,
      durationMinutes: 50,
      bufferAfterMinutes: 10,
      price: "40.00",
      currency: "USD",
      isPublic: true,
      colorHex: "#8b5cf6",
    },
    {
      tenantId: acmeTenant.id,
      name: "Consultation",
      slug: "consultation",
      status: "active" as const,
      durationMinutes: 15,
      bufferAfterMinutes: 0,
      price: "0.00",
      currency: "USD",
      isPublic: true,
      colorHex: "#06b6d4",
    },
  ];

  const insertedServices = await db
    .insert(schema.services)
    .values(serviceValues)
    .returning();

  console.log(`✅  Created ${insertedServices.length} services`);

  // ── Staff record for ownerUser ────────────────────────────────────────────────

  const [staffRecord] = await db
    .insert(schema.staff)
    .values({
      tenantId: acmeTenant.id,
      tenantUserId: staffUser!.id,
      displayName: "Jordan B.",
      isPublic: true,
      isActive: true,
    })
    .returning();

  console.log(`✅  Created staff record: ${staffRecord!.displayName}`);

  // ── Availability Rules (Mon–Fri, 09:00–17:00) ────────────────────────────────

  const days: (typeof schema.dayOfWeekEnum.enumValues)[number][] = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
  ];

  await db.insert(schema.availabilityRules).values(
    days.map((day) => ({
      tenantId: acmeTenant.id,
      staffId: staffRecord!.id,
      dayOfWeek: day,
      startTime: "09:00",
      endTime: "17:00",
      isActive: true,
    }))
  );

  console.log(`✅  Created availability rules (Mon–Fri 09:00–17:00)`);

  console.log("\n✨  Seed complete!\n");
  await client.end();
}

seed().catch((err) => {
  console.error("❌  Seed failed:", err);
  process.exit(1);
});
