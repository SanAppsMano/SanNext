import { Redis } from "@upstash/redis";

export async function handler(event) {
  const url      = new URL(event.rawUrl);
  const tenantId = url.searchParams.get("t");
  if (!tenantId) {
    return { statusCode: 400, body: "Missing tenantId" };
  }

  const redis  = Redis.fromEnv();
  const prefix = `tenant:${tenantId}:`;

  // Últimos 50 cancelamentos e tickets cancelados atualmente
  const [raw, cancelledSet, missedSet] = await Promise.all([
    redis.lrange(prefix + "log:cancelled", 0, 49),
    redis.smembers(prefix + "cancelledSet"),
    redis.smembers(prefix + "missedSet")
  ]);
  const all = raw.map(s => JSON.parse(s));
  const cancelled = all.filter(r => r.reason !== "missed").sort((a, b) => b.ts - a.ts);
  const missed = all.filter(r => r.reason === "missed").sort((a, b) => b.ts - a.ts);
  const nums = cancelledSet.map(n => Number(n));
  const missedNums = missedSet.map(n => Number(n));

  return {
    statusCode: 200,
    body: JSON.stringify({
      cancelled,
      numbers: nums,
      count: nums.length,
      missed,
      missedNumbers: missedNums,
      missedCount: missedNums.length,
    }),
  };
}
