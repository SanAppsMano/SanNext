import { Redis } from "@upstash/redis";

export async function handler(event) {
  const url      = new URL(event.rawUrl);
  const tenantId = url.searchParams.get("t");
  if (!tenantId) {
    return { statusCode: 400, body: "Missing tenantId" };
  }

  const redis     = Redis.fromEnv();
  const prefix    = `tenant:${tenantId}:`;
  const paramNum  = url.searchParams.get("num");
  const attendant = url.searchParams.get("id") || "";

  // Próximo a chamar
  let next = paramNum
    ? Number(paramNum)
    : await redis.incr(prefix + "callCounter");

  // Se automático, pular tickets cancelados
  if (!paramNum) {
    while (await redis.sismember(prefix + "cancelledSet", String(next))) {
      next = await redis.incr(prefix + "callCounter");
    }
  }

  const ts = Date.now();
  await redis.set(prefix + "currentCall", next);
  await redis.set(prefix + "currentCallTs", ts);
  if (attendant) {
    await redis.set(prefix + "currentAttendant", attendant);
  }

  // Log de chamada
  await redis.lpush(
    prefix + "log:called",
    JSON.stringify({ ticket: next, attendant, ts })
  );

  return {
    statusCode: 200,
    body: JSON.stringify({ called: next, attendant, ts }),
  };
}
