// GET /api/health
// Returns 200 { status: "ok", checks: { db: "ok", redis: "ok" } }
// Returns 503 if any check fails

import { NextResponse } from "next/server";
import { db } from "@booking-agent/db";
import { sql } from "drizzle-orm";
import { getRedis } from "@booking-agent/trpc/lib/redis";

export async function GET() {
  const checks: Record<string, "ok" | "fail"> = {};

  // DB check
  try {
    await db.execute(sql`SELECT 1`);
    checks.db = "ok";
  } catch {
    checks.db = "fail";
  }

  // Redis check
  try {
    const redis = getRedis();
    await redis.ping();
    checks.redis = "ok";
  } catch {
    checks.redis = "fail";
  }

  const allOk = Object.values(checks).every((v) => v === "ok");
  return NextResponse.json(
    { status: allOk ? "ok" : "degraded", checks, ts: new Date().toISOString() },
    { status: allOk ? 200 : 503 }
  );
}
