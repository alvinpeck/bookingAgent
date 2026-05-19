/**
 * Redis client singleton (ioredis).
 * Supports ElastiCache with TLS (rediss://) and local Redis (redis://).
 *
 * Single shared client for the whole monorepo — imported by both this package
 * and packages/trpc (which re-exports getRedis from here).
 *
 * Used for:
 *   - Conversation state (AI agent multi-turn)
 *   - Rate limiting
 *   - Slot hold fast-path cache
 *   - Session revocation list
 *
 * Import pattern:
 *   import { redis, getRedis } from "@booking-agent/db";
 */

import Redis from "ioredis";

// ── Global name is __ioredisClient (not __redisClient) to avoid picking up a
// stale node-redis client that may have been stored under the old name during
// hot-reload in development.
declare global {
  // eslint-disable-next-line no-var
  var __ioredisClient: Redis | undefined;
}

function buildClient(): Redis {
  const url = process.env.REDIS_URL ?? "redis://localhost:6379";

  // No lazyConnect — ioredis auto-connects on first command and queues
  // any commands sent before the connection is ready.
  const client = new Redis(url, {
    maxRetriesPerRequest: 3,
    // Exponential back-off: min 100 ms, max 3 s
    retryStrategy: (times) => Math.min(times * 100, 3000),
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

// Singleton — prevents multiple connections on Next.js hot-reload
const redis: Redis = global.__ioredisClient ?? buildClient();

if (process.env.NODE_ENV !== "production") {
  global.__ioredisClient = redis;
}

/**
 * Return the shared Redis client.
 * ioredis connects lazily on first command — no explicit connect() needed.
 */
function getRedis(): Redis {
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

  /** Session revocation — tracks invalidated session IDs */
  revokedSession: (sessionId: string) => `revoked:${sessionId}`,
} as const;

export const RedisTTL = {
  conversation: 60 * 60,        // 1 hour
  slotHold: 5 * 60,             // 5 minutes (matches HOLD_DURATION_SECONDS)
  rateLimit: 60,                 // 1 minute window
  revokedSession: 24 * 60 * 60, // 24 hours
} as const;
