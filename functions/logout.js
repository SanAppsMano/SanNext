import { Redis } from '@upstash/redis';
import { getSession, destroySession } from './utils/session.js';
import errorHandler from './utils/errorHandler.js';

export async function handler(event) {
  try {
    const redis = Redis.fromEnv();
    const sess = await getSession(redis, event.headers.cookie || '');
    if (sess) {
      await destroySession(redis, sess.sid);
    }
    return {
      statusCode: 200,
      headers: {
        'Set-Cookie': 'session=; Max-Age=0; HttpOnly; Secure; Path=/; SameSite=Lax',
      },
      body: JSON.stringify({ ok: true }),
    };
  } catch (error) {
    return errorHandler(error);
  }
}
