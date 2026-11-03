import "server-only";
import { db } from "./db";
import { tooMany } from "./http";

/**
 * Fixed-window rate limiter backed by Postgres so limits hold across multiple
 * application instances. A single atomic upsert both increments and resets.
 */
export async function hitRateLimit(key: string, limit: number, windowSeconds: number) {
  const rows = await db.$queryRaw<{ count: number; expiresAt: Date }[]>`
    INSERT INTO "RateLimitBucket" ("key", "count", "windowStart", "expiresAt")
    VALUES (${key}, 1, now(), now() + make_interval(secs => ${windowSeconds}))
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimitBucket"."expiresAt" < now() THEN 1 ELSE "RateLimitBucket"."count" + 1 END,
      "windowStart" = CASE WHEN "RateLimitBucket"."expiresAt" < now() THEN now() ELSE "RateLimitBucket"."windowStart" END,
      "expiresAt" = CASE WHEN "RateLimitBucket"."expiresAt" < now() THEN now() + make_interval(secs => ${windowSeconds}) ELSE "RateLimitBucket"."expiresAt" END
    RETURNING "count", "expiresAt"
  `;
  const row = rows[0]!;
  const retryAfter = Math.max(1, Math.ceil((row.expiresAt.getTime() - Date.now()) / 1000));
  return { allowed: row.count <= limit, count: row.count, remaining: Math.max(0, limit - row.count), retryAfter };
}

export async function enforceRateLimit(key: string, limit: number, windowSeconds: number, message?: string) {
  const res = await hitRateLimit(key, limit, windowSeconds);
  if (!res.allowed) {
    throw tooMany(message ?? "Too many requests. Please wait a moment and try again.", res.retryAfter);
  }
  return res;
}

export async function purgeExpiredRateLimits() {
  return db.rateLimitBucket.deleteMany({ where: { expiresAt: { lt: new Date() } } });
}
