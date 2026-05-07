// Run with: npx tsx --env-file=.env.local scripts/create-admin.ts
import { db, adminUsers } from "@booking-agent/db";
import { hashPassword } from "../lib/admin-auth";

const EMAIL = process.env.ADMIN_EMAIL ?? "admin@example.com";
const PASSWORD = process.env.ADMIN_PASSWORD ?? "changeme123";
const NAME = process.env.ADMIN_NAME ?? "Super Admin";

async function main() {
  const hash = await hashPassword(PASSWORD);
  await db
    .insert(adminUsers)
    .values({ email: EMAIL, passwordHash: hash, name: NAME } as any)
    .onConflictDoUpdate({
      target: adminUsers.email,
      set: { passwordHash: hash, name: NAME, updatedAt: new Date() } as any,
    });
  console.log(`Admin user created: ${EMAIL}`);
  process.exit(0);
}

main().catch(console.error);
