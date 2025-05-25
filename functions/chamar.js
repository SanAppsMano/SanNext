// functions/chamar.js
import { Redis } from "@upstash/redis";

/**
 * Endpoint para chamar próximo ticket ou repetir chamada/manual
 */
export async function handler(event) {
  const url = new URL(event.rawUrl);
  const tenantId = url.searchParams.get("t");
  if (!tenantId) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing tenantId" }) };  
  }

  const redis = Redis.fromEnv();
  const prefix = `tenant:${tenantId}:`;
  const paramNum = url.searchParams.get("num");
  const attendant = url.searchParams.get("id") || "";

  try {
    // Determina próximo ticket a chamar
    const next = paramNum
      ? Number(paramNum)
      : await redis.incr(prefix + "currentCall");

    const ts = Date.now();
    // Atualiza estado de chamada
    await redis.set(prefix + "currentCall", next);
    await redis.set(prefix + "currentCallTs", ts);
    if (attendant) {
      await redis.set(prefix + "currentAttendant", attendant);
    }

    // Registra log de chamada
    await redis.lpush(
      prefix + "log:called",
      JSON.stringify({ ticket: next, attendant, ts })
    );

    return {
      statusCode: 200,
      body: JSON.stringify({ called: next, attendant, ts }),
    };
  } catch (err) {
    console.error('Error in chamar handler:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal Server Error' }) };
  }
}
