import { Redis } from '@upstash/redis';
import bcrypt from 'bcryptjs';
import { createSession } from './utils/session.js';
import { rateLimit } from './utils/rateLimit.js';
import errorHandler from './utils/errorHandler.js';

export async function handler(event) {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method not allowed' };
    }
    const { email, password } = JSON.parse(event.body || '{}');
    if (!email || !password) {
      return { statusCode: 400, body: 'Invalid request' };
    }
    const normalized = email.trim().toLowerCase();
    const redis = Redis.fromEnv();
    const rlKey = `rl:setpw:${normalized}`;
    if (await rateLimit(redis, rlKey, 10, 60)) {
      return { statusCode: 429, body: 'Too many requests' };
    }
    const userKey = `user:${normalized}`;
    const user = await redis.hgetall(userKey);
    if (!user || user.email_verified !== 'true') {
      return { statusCode: 400, body: 'Usuário não verificado' };
    }
    const hash = await bcrypt.hash(password, 10);
    await redis.hset(userKey, { password_hash: hash });

    const sid = await createSession(redis, normalized);
    return {
      statusCode: 200,
      headers: {
        'Set-Cookie': `session=${sid}; HttpOnly; Secure; Path=/; SameSite=Lax`,
      },
      body: JSON.stringify({ ok: true }),
    };
  } catch (error) {
    return errorHandler(error);
  }
}
