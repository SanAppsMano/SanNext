import { Redis } from "@upstash/redis";
import scanDelete from "./utils/scanDelete.js";
import errorHandler from "./utils/errorHandler.js";
import bcrypt from 'bcryptjs';
import { createSession } from './utils/session.js';

const LOG_TTL = 60 * 60 * 24 * 30; // 30 days

async function handleQueueReset(event, redis) {
  const url        = new URL(event.rawUrl);
  const tenantId   = url.searchParams.get("t");
  const attendant  = url.searchParams.get("id") || "";
  if (!tenantId) {
    return { statusCode: 400, body: "Missing tenantId" };
  }

  const [pwHash, monitor] = await redis.mget(
    `tenant:${tenantId}:pwHash`,
    `monitor:${tenantId}`
  );
  if (!pwHash && !monitor) {
    return { statusCode: 404, body: "Invalid link" };
  }
  const prefix = `tenant:${tenantId}:`;
  const ts     = Date.now();

  // Zera todos os contadores
  await redis.set(prefix + "ticketCounter", 0);
  await redis.set(prefix + "callCounter",  0);
  await redis.set(prefix + "currentCall",  0);
  await redis.set(prefix + "currentCallTs", ts);
  await redis.del(prefix + "currentAttendant");
  await redis.del(prefix + "cancelledSet");
  await redis.del(prefix + "missedSet");
  await redis.del(prefix + "attendedSet");
  await redis.del(prefix + "skippedSet");
  await redis.del(prefix + "offHoursSet");
  await redis.del(prefix + "ticketNames");
  await redis.del(prefix + "log:entered");
  await redis.del(prefix + "log:called");
  await redis.del(prefix + "log:attended");
  await redis.del(prefix + "log:cancelled");
  await redis.del(prefix + "log:reset");
  await scanDelete(redis, prefix + "ticketTime:*");
  await scanDelete(redis, prefix + "calledTime:*");
  await scanDelete(redis, prefix + "attendedTime:*");
  await scanDelete(redis, prefix + "cancelledTime:*");
  await scanDelete(redis, prefix + "wait:*");

  // Log de reset
  await redis.lpush(
    prefix + "log:reset",
    JSON.stringify({ attendant, ts })
  );
  await redis.ltrim(prefix + "log:reset", 0, 999);
  await redis.expire(prefix + "log:reset", LOG_TTL);

  return {
    statusCode: 200,
    body: JSON.stringify({ reset: true, attendant, ts }),
  };
}

async function handlePasswordReset(body, redis) {
  const { email, otp, password } = body;
  const normalized = email.trim().toLowerCase();
  const otpKey = `otp:reset:${normalized}`;
  const attemptsKey = `otp:reset:${normalized}:attempts`;
  const stored = await redis.get(otpKey);
  if (!stored) {
    return { statusCode: 400, body: 'OTP inválido' };
  }
  const attempts = await redis.incr(attemptsKey);
  if (attempts > 5) {
    await redis.del(otpKey);
    await redis.del(attemptsKey);
    return { statusCode: 400, body: 'OTP expirado' };
  }
  if (stored !== otp) {
    return { statusCode: 400, body: 'OTP inválido' };
  }
  const userKey = `user:${normalized}`;
  const user = await redis.hgetall(userKey);
  if (!user || user.email_verified !== 'true') {
    return { statusCode: 400, body: 'Usuário inválido' };
  }
  const hash = await bcrypt.hash(password, 10);
  await redis.hset(userKey, { password_hash: hash });
  await redis.del(otpKey);
  await redis.del(attemptsKey);
  const sid = await createSession(redis, normalized);
  return {
    statusCode: 200,
    headers: {
      'Set-Cookie': `session=${sid}; HttpOnly; Secure; Path=/; SameSite=Lax`,
    },
    body: JSON.stringify({ ok: true }),
  };
}

export async function handler(event) {
  try {
    const redis = Redis.fromEnv();
    let body = {};
    if (event.body) {
      try { body = JSON.parse(event.body); } catch {}
    }
    if (body.email && body.otp && body.password) {
      return await handlePasswordReset(body, redis);
    }
    return await handleQueueReset(event, redis);
  } catch (error) {
    return errorHandler(error);
  }
}
