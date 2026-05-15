/**
 * Create or reset a super admin account.
 *
 * Usage:
 *   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=YourSecurePass ADMIN_NAME="Your Name" \
 *     pnpm db:create-admin
 *
 * If an account with that email already exists it is updated (password reset).
 */

import { config } from "dotenv";
import { resolve } from "path";
// Load .env.local first (takes priority), then fall back to .env
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index";
import { eq } from "drizzle-orm";
import { scrypt, randomBytes } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const hash = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${hash.toString("hex")}`;
}

async function main() {
  const email    = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const name     = process.env.ADMIN_NAME ?? "Super Admin";

  if (!email || !password) {
    console.error("❌  ADMIN_EMAIL and ADMIN_PASSWORD env vars are required.\n");
    console.error("  Example:");
    console.error('  ADMIN_EMAIL=admin@yourdomain.com ADMIN_PASSWORD="MySecurePass123" pnpm db:create-admin\n');
    process.exit(1);
  }

  if (password.length < 8) {
    console.error("❌  Password must be at least 8 characters.");
    process.exit(1);
  }

  const client = postgres(process.env.DATABASE_URL_DIRECT!, { max: 1 });
  const db     = drizzle(client, { schema });

  const passwordHash = await hashPassword(password);

  const existing = await db.query.adminUsers.findFirst({
    where: eq(schema.adminUsers.email, email),
    columns: { id: true },
  });

  if (existing) {
    await db
      .update(schema.adminUsers)
      .set({ passwordHash, name, isActive: true, updatedAt: new Date() })
      .where(eq(schema.adminUsers.email, email));
    console.log(`✅  Super admin updated: ${email}`);
  } else {
    const [created] = await db
      .insert(schema.adminUsers)
      .values({ email, name, passwordHash, isActive: true })
      .returning({ id: schema.adminUsers.id });
    console.log(`✅  Super admin created: ${email}  (id: ${created!.id})`);
  }

  console.log("\n🔑  Login at: /admin/login");
  console.log(`   Email:    ${email}`);
  console.log(`   Password: (as set)\n`);

  await client.end();
}

main().catch((err) => {
  console.error("❌  Failed:", err);
  process.exit(1);
});
