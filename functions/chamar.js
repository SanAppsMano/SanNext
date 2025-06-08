import { Redis } from "@upstash/redis";
import webpush from "web-push";

export async function handler(event) {
  const url      = new URL(event.rawUrl);
  const tenantId = url.searchParams.get("t");
  if (!tenantId) {
    return { statusCode: 400, body: "Missing tenantId" };
  }

  webpush.setVapidDetails(
    "mailto:example@example.com",
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );

  const redis     = Redis.fromEnv();
  const prefix    = `tenant:${tenantId}:`;
  const paramNum  = url.searchParams.get("num");
  const attendant = url.searchParams.get("id") || "";

  // Próximo a chamar
  const next = paramNum
    ? Number(paramNum)
    : await redis.incr(prefix + "callCounter");

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

  // Envia push para o cliente cujo ticket foi chamado
  try {
    const keys = await redis.keys(prefix + "ticket:*");
    let targetId = null;
    for (const k of keys) {
      const val = await redis.get(k);
      if (Number(val) === next) {
        targetId = k.split(":").pop();
        break;
      }
    }
    if (targetId) {
      const subStr = await redis.get(prefix + `subscription:${targetId}`);
      if (subStr) {
        const sub = JSON.parse(subStr);
        await webpush.sendNotification(
          sub,
          JSON.stringify({ title: "Sua vez!", body: `Ticket ${next}` })
        );
      }
    }
  } catch (err) {
    console.error("push error", err);
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ called: next, attendant, ts }),
  };
}
