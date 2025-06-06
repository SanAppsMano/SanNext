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
  let next;
  const counterKey = prefix + "callCounter";
  if (paramNum) {
    next = Number(paramNum);
    const currentCounter = Number(await redis.get(counterKey) || 0);
    if (next > currentCounter) {
      await redis.set(counterKey, next);
    }
    await redis.srem(prefix + "cancelledSet", String(next));
  } else {
    next = await redis.incr(counterKey);
    // Se automático, pular tickets cancelados
    while (await redis.sismember(prefix + "cancelledSet", String(next))) {
      await redis.srem(prefix + "cancelledSet", String(next));
      next = await redis.incr(counterKey);
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
