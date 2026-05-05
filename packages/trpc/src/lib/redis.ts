import Redis from "ioredis";

let redisClient: Redis | null = null;

export function getRedis(): Redis {
  if (!redisClient) {
    redisClient = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      maxRetriesPerRequest: 3,
      lazyConnect: false,
    });
    redisClient.on("error", (err) => {
      console.error("[redis] Connection error:", err);
    });
  }
  return redisClient;
}

/**
 * Sliding window rate limiter using sorted sets.
 * Returns { allowed: true } if under the limit, { allowed: false } otherwise.
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSecs: number
): Promise<{ allowed: boolean }> {
  const redis = getRedis();
  const now = Date.now();
  const windowMs = windowSecs * 1000;
  const windowStart = now - windowMs;

  const pipeline = redis.pipeline();
  pipeline.zremrangebyscore(key, "-inf", windowStart);
  pipeline.zadd(key, now, `${now}-${Math.random()}`);
  pipeline.zcard(key);
  pipeline.expire(key, windowSecs + 1);
  const results = await pipeline.exec();

  if (!results) return { allowed: false };

  const count = results[2]?.[1] as number;
  return { allowed: count <= limit };
}

/**
 * Check if a key is on cooldown (exists in Redis).
 */
export async function isOnCooldown(key: string): Promise<boolean> {
  const redis = getRedis();
  const result = await redis.exists(key);
  return result === 1;
}

/**
 * Set a cooldown key with a TTL in seconds.
 */
export async function setCooldown(key: string, seconds: number): Promise<void> {
  const redis = getRedis();
  await redis.set(key, "1", "EX", seconds);
}

/**
 * Increment an invalid-attempt counter with a TTL.
 * Returns the new count.
 */
export async function incrementInvalid(key: string, ttlSecs: number): Promise<number> {
  const redis = getRedis();
  const pipeline = redis.pipeline();
  pipeline.incr(key);
  pipeline.expire(key, ttlSecs);
  const results = await pipeline.exec();
  return (results?.[0]?.[1] as number) ?? 0;
}

/**
 * Reset an invalid-attempt counter.
 */
export async function resetInvalid(key: string): Promise<void> {
  const redis = getRedis();
  await redis.del(key);
}

/**
 * Check daily booking attempt quota for a user.
 */
export async function checkDailyBookingAttempts(
  tenantId: string,
  userId: string,
  maxAttempts: number
): Promise<{ allowed: boolean }> {
  const redis = getRedis();
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const key = `daily:booking:${tenantId}:${userId}:${date}`;
  const count = await redis.get(key);
  const current = count ? parseInt(count, 10) : 0;
  return { allowed: current < maxAttempts };
}

/**
 * Increment daily booking attempts for a user.
 */
export async function incrementDailyBookingAttempts(
  tenantId: string,
  userId: string
): Promise<void> {
  const redis = getRedis();
  const date = new Date().toISOString().slice(0, 10);
  const key = `daily:booking:${tenantId}:${userId}:${date}`;
  const pipeline = redis.pipeline();
  pipeline.incr(key);
  // Expire at end of day + buffer: 25 hours
  pipeline.expire(key, 60 * 60 * 25);
  await pipeline.exec();
}

const HISTORY_KEY = (tenantId: string, channelId: string, userId: string) =>
  `conv:${tenantId}:${channelId}:${userId}`;

const MAX_HISTORY = 20; // messages (each entry is a user+assistant pair = 2 messages)

/**
 * Load conversation history from Redis.
 */
export async function getConversationHistory(
  tenantId: string,
  channelId: string,
  userId: string
): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
  const redis = getRedis();
  const key = HISTORY_KEY(tenantId, channelId, userId);
  const raw = await redis.get(key);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as Array<{ role: "user" | "assistant"; content: string }>;
  } catch {
    return [];
  }
}

/**
 * Append a user+assistant message pair to history. Keeps only the last MAX_HISTORY messages.
 */
export async function appendConversationHistory(
  tenantId: string,
  channelId: string,
  userId: string,
  userMsg: string,
  assistantMsg: string,
  ttlSecs: number = 60 * 60 * 24 // 24 hours default
): Promise<void> {
  const redis = getRedis();
  const key = HISTORY_KEY(tenantId, channelId, userId);

  const history = await getConversationHistory(tenantId, channelId, userId);

  history.push({ role: "user", content: userMsg });
  history.push({ role: "assistant", content: assistantMsg });

  // Keep only the last MAX_HISTORY messages
  const trimmed = history.slice(-MAX_HISTORY);

  await redis.set(key, JSON.stringify(trimmed), "EX", ttlSecs);
}
