import { Redis } from '@upstash/redis';
import { getSession } from './utils/session.js';
import errorHandler from './utils/errorHandler.js';

export async function handler(event) {
  try {
    const redis = Redis.fromEnv();
    const sess = await getSession(redis, event.headers.cookie || '');
    if (!sess) {
      return { statusCode: 401, body: 'Unauthorized' };
    }
    return { statusCode: 200, body: JSON.stringify({ email: sess.email }) };
  } catch (error) {
    return errorHandler(error);
  }
}
