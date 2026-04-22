import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index";

// ─────────────────────────────────────────────────────────────────────────────
// Connection strategy
//   • MIGRATIONS: use DATABASE_URL_DIRECT (no pooler, required by Drizzle Kit)
//   • RUNTIME:    use DATABASE_URL        (pooled, handles serverless concurrency)
// ─────────────────────────────────────────────────────────────────────────────

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set");
}

// Prevent multiple connections in Next.js hot-reload (dev only)
declare global {
  // eslint-disable-next-line no-var
  var __dbClient: ReturnType<typeof postgres> | undefined;
}

// RDS requires SSL; local dev works without it
const isRDS = connectionString.includes(".rds.amazonaws.com");

const client =
  global.__dbClient ??
  postgres(connectionString, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    ssl: isRDS ? { rejectUnauthorized: true } : false,
  });

if (process.env.NODE_ENV !== "production") {
  global.__dbClient = client;
}

export const db = drizzle(client, { schema, logger: process.env.NODE_ENV === "development" });

export type DB = typeof db;
