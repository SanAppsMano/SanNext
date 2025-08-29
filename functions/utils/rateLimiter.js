import { Redis } from "@upstash/redis";

export default async function rateLimit(ip, limit = 60, windowSeconds = 60) {
  if (!ip) {
    return false;
  }
  const redis = Redis.fromEnv();
  const key = `rl:${ip}`;
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, windowSeconds);
  }
  return count > limit;
}
