// functions/cancelados.js
import { Redis } from '@upstash/redis';

/**
 * Retorna a lista de tickets cancelados para um monitor (tenant)
 */
export async function handler(event) {
  // Extrai token (tenant ID) da query
  const url = new URL(event.rawUrl);
  const token = url.searchParams.get('t');
  if (!token) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing tenantId' }) };
  }

  // Conexão Redis via Upstash (configurada por variáveis de ambiente)
  const redis = Redis.fromEnv();
  // Prefixo consistente com métricas do tenant
  const key = `tenant:${token}:cancelados`;

  try {
    // Obtém todos os cancelamentos (membro = ticket, score = timestamp)
    const entries = await redis.zrevrange(key, 0, -1, { withScores: true });
    const cancelled = [];
    for (let i = 0; i < entries.length; i += 2) {
      cancelled.push({
        ticket: entries[i],
        ts: Number(entries[i + 1]),
      });
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ cancelled }),
    };
  } catch (err) {
    console.error('Error fetching cancelled tickets:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal Server Error' }),
    };
  }
}
