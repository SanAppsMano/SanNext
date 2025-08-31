import { Redis } from '@upstash/redis';
import { sendOtpEmail } from './utils/sendEmail.js';
import { rateLimit } from './utils/rateLimit.js';
import errorHandler from './utils/errorHandler.js';

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function handler(event) {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method not allowed' };
    }
    const { email } = JSON.parse(event.body || '{}');
    if (!email) {
      return { statusCode: 400, body: 'Missing email' };
    }
    const normalized = email.trim().toLowerCase();
    const redis = Redis.fromEnv();
    const rlKey = `rl:signup:${normalized}`;
    if (await rateLimit(redis, rlKey, 5, 60)) {
      return { statusCode: 429, body: 'Too many requests' };
    }

    const cooldownKey = `otp:signup:${normalized}:cooldown`;
    if (await redis.exists(cooldownKey)) {
      return { statusCode: 429, body: 'Aguarde para reenviar' };
    }
    const userKey = `user:${normalized}`;
    const user = await redis.hgetall(userKey);
    if (!user || Object.keys(user).length === 0) {
      await redis.hset(userKey, { email_verified: 'false' });
    } else if (user.email_verified === 'true') {
      return { statusCode: 400, body: 'Email já registrado' };
    }

    const otp = generateOtp();
    await redis.set(`otp:signup:${normalized}`, otp, { ex: 60 * 15 });
    await redis.set(`otp:signup:${normalized}:attempts`, 0, { ex: 60 * 15 });
    await redis.set(cooldownKey, 1, { ex: 60 });

    await sendOtpEmail(normalized, otp, 'Código de verificação');

    return { statusCode: 200, body: JSON.stringify({ sent: true }) };
  } catch (error) {
    return errorHandler(error);
  }
}
