// functions/registerMonitor.js
import { Redis } from '@upstash/redis';
import bcrypt from 'bcryptjs';

export async function handler(event) {
  try {
    const { tenantId, label, password } = JSON.parse(event.body || '{}');
    if (!tenantId || !label || !password) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing fields' }) };
    }

    // Cria hash seguro da senha
    const saltRounds = 10;
    const hash = await bcrypt.hash(password, saltRounds);

    const redis = Redis.fromEnv();
    // Armazena as configurações do tenant no Redis
    await redis.set(`tenant:${tenantId}:label`, label);
    await redis.set(`tenant:${tenantId}:pwHash`, hash);

    // Inicializa todos os contadores do tenant em um único hash
    const stateKey = `tenant:${tenantId}:state`;
    await redis.hset(stateKey, {
      ticketCounter: 0,
      callCounter: 0,
      currentCall: 0,
      currentCallTs: Date.now(),
      logoutVersion: 0,
    });
    await redis.del(`tenant:${tenantId}:clones`);

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, tenantId }),
    };
  } catch (err) {
    console.error('registerMonitor error', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Server error' }) };
  }
}
