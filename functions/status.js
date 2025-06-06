import { Redis } from "@upstash/redis";

export async function handler(event) {
  const url      = new URL(event.rawUrl);
  const tenantId = url.searchParams.get("t");
  if (!tenantId) {
    return { statusCode: 400, body: "Missing tenantId" };
  }

  const redis  = Redis.fromEnv();
  const prefix = `tenant:${tenantId}:`;

  const currentCall   = Number(await redis.get(prefix + "currentCall")   || 0);
  const callCounter   = Number(await redis.get(prefix + "callCounter")    || 0);
  const ticketCounter = Number(await redis.get(prefix + "ticketCounter") || 0);
  const attendant     = (await redis.get(prefix + "currentAttendant")) || "";
  const timestamp     = Number(await redis.get(prefix + "currentCallTs")  || 0);
  const cancelledCount= Number(await redis.scard(prefix + "cancelledSet")) || 0;

  return {
    statusCode: 200,
    body: JSON.stringify({
      currentCall,
      callCounter,
      ticketCounter,
      attendant,
      timestamp,
      cancelledCount,
    }),
  };
}
