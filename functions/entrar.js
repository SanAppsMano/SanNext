import './config.js';
import { Redis } from "@upstash/redis";
import { v4 as uuidv4 } from "uuid";
import errorHandler from "./utils/errorHandler.js";

const LOG_TTL = 60 * 60 * 24 * 30; // 30 days

export async function handler(event) {
  try {
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

    // Cria clientId e incrementa contador de tickets
    const clientId     = uuidv4();
    const ticketNumber = await redis.incr(prefix + "ticketCounter");
    // registra ticket e horário de entrada em um único comando
    await redis.mset({
      [prefix + `ticket:${clientId}`]: ticketNumber,
      [prefix + `ticketTime:${ticketNumber}`]: Date.now(),
    });

    // Log de entrada
    const ts = Date.now();
    await redis.lpush(prefix + "log:entered", JSON.stringify({ ticket: ticketNumber, ts }));
    await redis.ltrim(prefix + "log:entered", 0, 999);
    await redis.expire(prefix + "log:entered", LOG_TTL);

    return {
      statusCode: 200,
      body: JSON.stringify({ clientId, ticketNumber, ts }),
    };
  } catch (error) {
    return errorHandler(error);
  }
}
