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
  const [cancelledSet, missedSet] = await Promise.all([
    redis.smembers(prefix + "cancelledSet"),
    redis.smembers(prefix + "missedSet")
  ]);
  const cancelledNums = cancelledSet.map(n => Number(n)).sort((a, b) => a - b);
  const missedNums    = missedSet.map(n => Number(n)).sort((a, b) => a - b);
  const cancelledCount= cancelledNums.length;
  const effCancelled  = cancelledNums.filter(n => n > currentCall).length;
  const waiting       = Math.max(0, ticketCounter - currentCall - effCancelled);

  return {
    statusCode: 200,
    body: JSON.stringify({
      currentCall,
      callCounter,
      ticketCounter,
      attendant,
      timestamp,
      cancelledCount,
      cancelledNumbers: cancelledNums,
      missedNumbers: missedNums,
      waiting,
    }),
  };
}
