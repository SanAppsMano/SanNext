import { Redis } from '@upstash/redis';
import { rateLimit } from './utils/rateLimit.js';
import errorHandler from './utils/errorHandler.js';

export async function handler(event) {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method not allowed' };
    }
    const { email, otp } = JSON.parse(event.body || '{}');
    if (!email || !otp) {
      return { statusCode: 400, body: 'Invalid request' };
    }
    const normalized = email.trim().toLowerCase();
    const redis = Redis.fromEnv();
    const rlKey = `rl:signup-verify:${normalized}`;
    if (await rateLimit(redis, rlKey, 10, 60)) {
      return { statusCode: 429, body: 'Too many requests' };
    }

    const otpKey = `otp:signup:${normalized}`;
    const attemptsKey = `otp:signup:${normalized}:attempts`;
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
    await redis.del(otpKey);
    await redis.del(attemptsKey);
    await redis.hset(`user:${normalized}`, { email_verified: 'true' });
    return { statusCode: 200, body: JSON.stringify({ verified: true }) };
  } catch (error) {
    return errorHandler(error);
  }
}
