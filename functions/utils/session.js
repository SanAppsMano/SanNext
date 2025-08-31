import { v4 as uuidv4 } from 'uuid';

export async function createSession(redis, email) {
  const sid = uuidv4();
  await redis.set(`session:${sid}`, email, { ex: 60 * 60 * 24 * 7 });
  return sid;
}

export async function getSession(redis, cookies = '') {
  const match = cookies.match(/session=([^;]+)/);
  if (!match) return null;
  const sid = match[1];
  const email = await redis.get(`session:${sid}`);
  if (!email) return null;
  return { sid, email };
}

export async function destroySession(redis, sid) {
  await redis.del(`session:${sid}`);
}
