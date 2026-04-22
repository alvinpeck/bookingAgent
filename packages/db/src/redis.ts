/**
 * Redis client singleton.
 * Supports ElastiCache with TLS (rediss://) and local Redis (redis://).
 *
 * Used for:
 *   - Conversation state (Phase 10 — AI agent multi-turn)
 *   - Rate limiting (Phase 10)
 *   - Slot hold fast-path cache (Phase 5)
 *   - Session revocation list (Phase 3)
 *
 * Import pattern:
 *   import { redis } from "@booking-agent/db";
 */

import { createClient } from "redis";

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) {
  throw new Error("REDIS_URL environment variable is not set");
}

// ElastiCache requires TLS — detected via rediss:// scheme
const isTLS = redisUrl.startsWith("rediss://");

declare global {
  // eslint-disable-next-line no-var
  var __redisClient: ReturnType<typeof createClient> | undefined;
}

function buildClient() {
  const client = createClient({
    url: redisUrl,
    socket: isTLS
      ? {
          tls: true,
          // ElastiCache uses AWS-managed certs; rejectUnauthorized = true is correct
          rejectUnauthorized: true,
          // Reconnect with exponential backoff
          reconnectStrategy: (retries) => Math.min(retries * 100, 3000),
        }
      : {
          reconnectStrategy: (retries) => Math.min(retries * 100, 3000),
        },
  });

  client.on("error", (err) => {
    console.error("[redis] Client error:", err);
  });

  client.on("connect", () => {
    if (process.env.NODE_ENV === "development") {
      console.log("[redis] Connected");
    }
  });

  return client;
}

// Singleton — prevents multiple connections in Next.js hot-reload
const redis = global.__redisClient ?? buildClient();

if (process.env.NODE_ENV !== "production") {
  global.__redisClient = redis;
}

// Connect lazily — called once on first use
let connected = false;
async function getRedis() {
  if (!connected) {
    await redis.connect();
    connected = true;
  }
  return redis;
}

export { redis, getRedis };

// ─── Key helpers ──────────────────────────────────────────────────────────────
// Centralised key patterns prevent typos and make TTL management consistent.

export const RedisKeys = {
  /** Conversation state for AI agent — expires after 1 hour of inactivity */
  conversation: (channelId: string, userId: string) =>
    `conv:${channelId}:${userId}`,

  /** Slot hold validation cache — mirrors DB slot_holds, expires with the hold */
  slotHold: (holdToken: string) => `hold:${holdToken}`,

  /** Rate limit counter — per tenant per endpoint */
  rateLimit: (tenantId: string, endpoint: string) =>
    `rl:${tenantId}:${endpoint}`,

  /** Session revocation — tracks invalidated Clerk session IDs */
  revokedSession: (sessionId: string) => `revoked:${sessionId}`,
} as const;

export const RedisTTL = {
  conversation: 60 * 60,         // 1 hour
  slotHold: 5 * 60,              // 5 minutes (matches HOLD_DURATION_SECONDS)
  rateLimit: 60,                  // 1 minute window
  revokedSession: 24 * 60 * 60,  // 24 hours
} as const;
