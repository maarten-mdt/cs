/**
 * Redis cache layer for the Agent Hub.
 * All caching is optional — if REDIS_URL is not set, get() returns null and set() is a no-op.
 */

import { Redis } from "ioredis";

let redis: Redis | null = null;

function getRedis(): Redis | null {
  if (redis) return redis;
  const url = process.env.REDIS_URL?.trim();
  if (!url) return null;
  try {
    redis = new Redis(url, { maxRetriesPerRequest: 3, lazyConnect: true });
    redis.connect().catch((e) => {
      console.warn("[redis] Connection failed:", (e as Error).message);
      redis = null;
    });
    return redis;
  } catch {
    return null;
  }
}

/** TTL presets in seconds */
export const TTL = {
  BOOTSTRAP: 30,
  CONVERSATION: 300,      // 5 min
  CUSTOMER: 600,           // 10 min
  CUSTOMER_KLAVIYO: 900,   // 15 min
  SHOPIFY_ORDERS: 120,     // 2 min
  CANNED_RESPONSES: 300,   // 5 min
} as const;

export async function cacheGet<T>(key: string): Promise<T | null> {
  const r = getRedis();
  if (!r) return null;
  try {
    const val = await r.get(key);
    return val ? (JSON.parse(val) as T) : null;
  } catch {
    return null;
  }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const r = getRedis();
  if (!r) return;
  try {
    await r.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch {
    // silent
  }
}

export async function cacheDel(...keys: string[]): Promise<void> {
  const r = getRedis();
  if (!r || keys.length === 0) return;
  try {
    await r.del(...keys);
  } catch {
    // silent
  }
}

export async function cacheDelPattern(pattern: string): Promise<void> {
  const r = getRedis();
  if (!r) return;
  try {
    const keys = await r.keys(pattern);
    if (keys.length > 0) await r.del(...keys);
  } catch {
    // silent
  }
}
