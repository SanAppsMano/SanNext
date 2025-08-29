import { Redis } from "@upstash/redis";
import errorHandler from "./utils/errorHandler.js";

export async function handler(event) {
  try {
    const url = new URL(event.rawUrl);
    const tenantId = url.searchParams.get("t");
    if (!tenantId) {
      return { statusCode: 400, body: "Missing tenantId" };
    }
    const { ticket } = JSON.parse(event.body || "{}");
    const nextTicket = Number(ticket);
    if (!nextTicket) {
      return { statusCode: 400, body: "Missing ticket" };
    }
    const redis = Redis.fromEnv();
    const [pwHash, monitor] = await redis.mget(
      `tenant:${tenantId}:pwHash`,
      `monitor:${tenantId}`
    );
    if (!pwHash && !monitor) {
      return { statusCode: 404, body: "Invalid link" };
    }
    const prefix = `tenant:${tenantId}:`;
    const last = Number(await redis.get(prefix + "ticketCounter") || 0);
    if (nextTicket <= last) {
      return { statusCode: 400, body: "Ticket must be greater than last" };
    }
    await redis.mset({
      [prefix + "ticketCounter"]: nextTicket - 1,
      [prefix + "callCounter"]: nextTicket - 1,
    });
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, ticketNumber: nextTicket })
    };
  } catch (error) {
    return errorHandler(error);
  }
}
