export async function rateLimit(redis, key, limit = 5, ttl = 60) {
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, ttl);
  }
  return count > limit;
}
