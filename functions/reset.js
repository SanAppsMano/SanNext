// functions/reset.js
import { Redis } from "@upstash/redis";

/**
 * Endpoint para resetar tickets e chamadas de um monitor (tenant)
 */
export async function handler(event) {
  const url = new URL(event.rawUrl);
  const tenantId = url.searchParams.get("t");
  const attendant = url.searchParams.get("id") || "";
  if (!tenantId) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing tenantId" }) };
  }

  const redis = Redis.fromEnv();
  const prefix = `tenant:${tenantId}:`;
  const ts = Date.now();

  try {
    // Zera contadores principais
    await redis.set(prefix + "currentCall", 0);
    await redis.set(prefix + "currentCallTs", ts);
    await redis.del(prefix + "currentAttendant");
    // Opcionalmente, também limpar histórico de log
    // await redis.del(prefix + "log:called");
    // await redis.del(prefix + "log:reset");

    // Registra log de reset
    await redis.lpush(
      prefix + "log:reset",
      JSON.stringify({ attendant, ts })
    );

    // Observação: caso utilize Socket.IO, dispare evento resetTickets no servidor WebSocket.
    // Exemplo (pseudocódigo):
    // socketServer.emit("resetTickets", { tenantId });

    return {
      statusCode: 200,
      body: JSON.stringify({ reset: true, attendant, ts }),
    };
  } catch (err) {
    console.error('Error in reset handler:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal Server Error' }) };
  }
}
