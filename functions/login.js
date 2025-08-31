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
    const rlKey = `rl:login:${normalized}`;
    if (await rateLimit(redis, rlKey, 10, 60)) {
      return { statusCode: 429, body: 'Too many requests' };
    }
    const user = await redis.hgetall(`user:${normalized}`);
    if (!user || user.email_verified !== 'true' || !user.password_hash) {
      return { statusCode: 400, body: 'Credenciais inválidas' };
    }
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return { statusCode: 400, body: 'Credenciais inválidas' };
    }
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
