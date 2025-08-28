import { Redis } from "@upstash/redis";

export async function handler(event) {
  const url      = new URL(event.rawUrl);
  const tenantId = url.searchParams.get("t");
  if (!tenantId) {
    return { statusCode: 400, body: "Missing tenantId" };
  }

  const redis  = Redis.fromEnv();
  const [pwHash, monitor] = await redis.mget(
    `tenant:${tenantId}:pwHash`,
    `monitor:${tenantId}`
  );
  if (!pwHash && !monitor) {
    return { statusCode: 404, body: "Invalid link" };
  }
  const prefix = `tenant:${tenantId}:`;

  const [callCounterRaw, ticketCounterRaw, logoutVersionRaw] = await redis.mget(
    prefix + "callCounter",
    prefix + "ticketCounter",
    prefix + "logoutVersion"
  );
  const callCounter   = Number(callCounterRaw || 0);
  const ticketCounter = Number(ticketCounterRaw || 0);
  const queueRaw = await redis.lrange(prefix + "callQueue", 0, -1);
  const calls = queueRaw.map(item => {
    try { return JSON.parse(item); } catch { return null; }
  }).filter(Boolean);
  const last = calls[calls.length - 1] || {};
  const currentCall = Number(last.ticket || 0);
  const attendant   = last.attendant || "";
  const timestamp   = Number(last.ts || 0);
  const [cancelledSet, missedSet, attendedSet, nameMap] = await Promise.all([
    redis.smembers(prefix + "cancelledSet"),
    redis.smembers(prefix + "missedSet"),
    redis.smembers(prefix + "attendedSet"),
    redis.hgetall(prefix + "ticketNames")
  ]);
  const cancelledNums = cancelledSet.map(n => Number(n)).sort((a, b) => a - b);
  const missedNums    = missedSet.map(n => Number(n)).sort((a, b) => a - b);
  const attendedNums  = attendedSet.map(n => Number(n)).sort((a, b) => a - b);
  const cancelledCount= cancelledNums.length;
  const missedCount   = missedNums.length;
  const attendedCount = attendedNums.length;
  const waiting       = Math.max(0, ticketCounter - cancelledCount - missedCount - attendedCount);

  return {
    statusCode: 200,
    body: JSON.stringify({
      calls,
      currentCall,
      callCounter,
      ticketCounter,
      attendant,
      timestamp,
      cancelledCount,
      cancelledNumbers: cancelledNums,
      missedNumbers: missedNums,
      missedCount,
      attendedNumbers: attendedNums,
      attendedCount,
      waiting,
      names: nameMap || {},
      logoutVersion: Number(logoutVersionRaw || 0),
    }),
  };
}
