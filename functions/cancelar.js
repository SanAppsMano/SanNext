import { Redis } from "@upstash/redis";

export async function handler(event) {
  const url      = new URL(event.rawUrl);
  const tenantId = url.searchParams.get("t");
  if (!tenantId) {
    return { statusCode: 400, body: "Missing tenantId" };
  }

  const { clientId } = JSON.parse(event.body || "{}");
  const redis  = Redis.fromEnv();
  const prefix = `tenant:${tenantId}:`;

  // Recupera e remove ticket do cliente
  const ticketNum = await redis.get(prefix + `ticket:${clientId}`);
  await redis.del(prefix + `ticket:${clientId}`);

  // Se havia ticket, marca-o como cancelado
  if (ticketNum) {
    await redis.sadd(prefix + "cancelledSet", String(ticketNum));
  }

  // Log de cancelamento
  const ts = Date.now();
  await redis.lpush(
    prefix + "log:cancelled",
    JSON.stringify({ ticket: Number(ticketNum), ts })
  );

  return {
    statusCode: 200,
    body: JSON.stringify({ cancelled: true, ticket: Number(ticketNum), ts }),
  };
}
