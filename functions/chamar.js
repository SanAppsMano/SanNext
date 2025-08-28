import { Redis } from "@upstash/redis";

const LOG_TTL = 60 * 60 * 24 * 30; // 30 days

export async function handler(event) {
  const url      = new URL(event.rawUrl);
  const tenantId = url.searchParams.get("t");
  if (!tenantId) {
    return { statusCode: 400, body: "Missing tenantId" };
  }

  const redis     = Redis.fromEnv();
  const [pwHash, monitor] = await redis.mget(
    `tenant:${tenantId}:pwHash`,
    `monitor:${tenantId}`
  );
  if (!pwHash && !monitor) {
    return { statusCode: 404, body: "Invalid link" };
  }
  const prefix    = `tenant:${tenantId}:`;
  const paramNum  = url.searchParams.get("num");
  const identifier = url.searchParams.get("id") || "";

  const counterKey = prefix + "callCounter";
  const prevCounter = Number(await redis.get(counterKey) || 0);
  const prevByIdKey = prefix + `currentCallById:${identifier}`;
  const prevByIdTsKey = prefix + `currentCallTsById:${identifier}`;
  const prevById = Number(await redis.get(prevByIdKey) || 0);
  const prevByIdTs = Number(await redis.get(prevByIdTsKey) || 0);

  // Próximo a chamar
  let next;
  if (paramNum) {
    next = Number(paramNum);
    // Não atualiza o contador sequencial para manter a ordem quando
    // um número é chamado manualmente
    await redis.srem(prefix + "cancelledSet", String(next));
    await redis.srem(prefix + "missedSet", String(next));
  } else {
    next = await redis.incr(counterKey);
    const ticketCount = Number(await redis.get(prefix + "ticketCounter") || 0);
    // Se automático, pular tickets cancelados e perdidos sem removê-los
    while (
      next <= ticketCount &&
      ((await redis.sismember(prefix + "cancelledSet", String(next))) ||
       (await redis.sismember(prefix + "missedSet", String(next))))
    ) {
      next = await redis.incr(counterKey);
    }
  }

  // Quando a chamada é automática (Próximo), quem perde a vez é a última
  // chamada daquele identificador. Se for a primeira chamada do
  // identificador, segue a lógica global anterior (prevCounter).
  const prevToCheck = identifier ? prevById : prevCounter;
  const prevTs = identifier ? prevByIdTs : 0;
  if (!paramNum && prevToCheck && next > prevToCheck) {
    const [isCancelled, isMissed, isAttended] = await Promise.all([
      redis.sismember(prefix + "cancelledSet", String(prevToCheck)),
      redis.sismember(prefix + "missedSet", String(prevToCheck)),
      redis.sismember(prefix + "attendedSet", String(prevToCheck))
    ]);
    if (!isCancelled && !isMissed && !isAttended) {
      const calledTs = Number(await redis.get(prefix + `calledTime:${prevToCheck}`) || 0);
      const dur = calledTs ? Date.now() - calledTs : 0;
      const waitPrev = Number(await redis.get(prefix + `wait:${prevToCheck}`) || 0);
      await redis.sadd(prefix + "missedSet", String(prevToCheck));
      const missTs = Date.now();
      await redis.set(prefix + `cancelledTime:${prevToCheck}`, missTs);
      await redis.lpush(
        prefix + "log:cancelled",
        JSON.stringify({ ticket: prevToCheck, ts: missTs, reason: "missed", duration: dur, wait: waitPrev })
      );
      await redis.ltrim(prefix + "log:cancelled", 0, 999);
      await redis.expire(prefix + "log:cancelled", LOG_TTL);
      await redis.del(prefix + `wait:${prevToCheck}`);
    }
    if (identifier) {
      await redis.lrem(prefix + "callQueue", 0, JSON.stringify({ ticket: prevById, attendant: identifier, ts: prevTs }));
    }
  }

  const ts = Date.now();
  let wait = 0;
  const joinTs = await redis.get(prefix + `ticketTime:${next}`);
  if (joinTs) {
    wait = ts - Number(joinTs);
    // mantém ticketTime registrado para o relatório
  }
  // Atualiza dados da chamada em um único comando
  const updateData = {
    [prefix + `wait:${next}`]: wait,
    [prefix + "currentCall"]: next,
    [prefix + "currentCallTs"]: ts,
    [prefix + `calledTime:${next}`]: ts,
  };
  if (identifier) {
    updateData[prefix + `identifier:${next}`] = identifier;
    updateData[prefix + "currentAttendant"] = identifier;
    updateData[prevByIdKey] = next;
    updateData[prevByIdTsKey] = ts;
  }
  await redis.mset(updateData);

  // fila de chamadas para múltiplos identificadores
  await redis.rpush(prefix + "callQueue", JSON.stringify({ ticket: next, attendant: identifier, ts }));

  const name = await redis.hget(prefix + "ticketNames", String(next));

  // Log de chamada
  await redis.lpush(
    prefix + "log:called",
    JSON.stringify({ ticket: next, attendant: identifier, identifier, ts, wait, name })
  );
  await redis.ltrim(prefix + "log:called", 0, 999);
  await redis.expire(prefix + "log:called", LOG_TTL);

  return {
    statusCode: 200,
    body: JSON.stringify({ called: next, attendant: identifier, identifier, ts, wait, name }),
  };
}
