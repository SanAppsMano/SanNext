import { Redis } from "@upstash/redis";

export async function handler(event) {
  const url      = new URL(event.rawUrl);
  const tenantId = url.searchParams.get("t");
  const ticket   = Number(url.searchParams.get("num"));
  const token    = url.searchParams.get("tok") || "";
  if (!tenantId || !ticket) {
    return { statusCode: 400, body: "Missing parameters" };
  }

  const redis  = Redis.fromEnv();
  const prefix = `tenant:${tenantId}:`;

  const now    = Date.now();
  const callTs = Number(await redis.get(prefix + "currentCallTs") || 0);
  const duration = callTs ? now - callTs : 0;

  await redis.sadd(prefix + "attendedSet", ticket);
  await redis.lpush(
    prefix + "log:attended",
    JSON.stringify({ ticket, token, ts: now, duration })
  );

  return {
    statusCode: 200,
    body: JSON.stringify({ attended: ticket, duration })
  };
}
