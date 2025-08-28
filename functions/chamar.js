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
  const paramNumStr = url.searchParams.get("num");
  const hasParamNum = paramNumStr !== null;
  const identifier = url.searchParams.get("id") || "";

  const counterKey = prefix + "callCounter";
  const prevCall   = Number(await redis.get(prefix + "currentCall") || 0);

  // Próximo a chamar
  let next;
  if (hasParamNum) {
    next = Number(paramNumStr);
    // Não atualiza o contador sequencial para manter a ordem quando
    // um número é chamado manualmente
    await redis.srem(prefix + "cancelledSet", String(next));
    await redis.srem(prefix + "missedSet", String(next));
    if (prevCall && prevCall !== next) {
      // Garante que o ticket anterior permaneça na fila, limpando dados de chamada
      await redis.del(prefix + `calledTime:${prevCall}`);
      await redis.del(prefix + `wait:${prevCall}`);
    }
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

  // Em chamadas automáticas (botão Próximo), o ticket anteriormente
  // chamado perde a vez. Isso precisa ocorrer mesmo se o último ticket
  // tiver sido chamado manualmente, portanto consultamos o número
  // atualmente em atendimento (prevCall).
  if (!hasParamNum && prevCall && prevCall !== next) {
    const [isCancelled, isMissed, isAttended] = await Promise.all([
      redis.sismember(prefix + "cancelledSet", String(prevCall)),
      redis.sismember(prefix + "missedSet", String(prevCall)),
      redis.sismember(prefix + "attendedSet", String(prevCall))
    ]);
    if (!isCancelled && !isMissed && !isAttended) {
      const calledTs = Number(await redis.get(prefix + `calledTime:${prevCall}`) || 0);
      const dur = calledTs ? Date.now() - calledTs : 0;
      const waitPrev = Number(await redis.get(prefix + `wait:${prevCall}`) || 0);
      await redis.sadd(prefix + "missedSet", String(prevCall));
      const missTs = Date.now();
      await redis.set(prefix + `cancelledTime:${prevCall}`, missTs);
      await redis.lpush(
        prefix + "log:cancelled",
        JSON.stringify({ ticket: prevCall, ts: missTs, reason: "missed", duration: dur, wait: waitPrev })
      );
      await redis.ltrim(prefix + "log:cancelled", 0, 999);
      await redis.expire(prefix + "log:cancelled", LOG_TTL);
      await redis.del(prefix + `wait:${prevCall}`);
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
  }
  await redis.mset(updateData);

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
