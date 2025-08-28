const LIMIT = Number(process.env.PUBLIC_RATE_LIMIT || 60);
const WINDOW = Number(process.env.PUBLIC_RATE_TTL || 60); // seconds

export default async function rateLimit(redis, tenantId, ip) {
  if (!ip) {
    return true;
  }
  const key = `rate:${tenantId}:${ip}`;
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, WINDOW);
  }
  return count <= LIMIT;
}
