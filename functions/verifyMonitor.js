import { Redis } from '@upstash/redis';

export async function handler(event) {
  try {
    const url = new URL(event.rawUrl);
    const token = url.searchParams.get('t');
    const empresa = url.searchParams.get('empresa');
    if (!token || !empresa) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Token ou empresa ausente' })
      };
    }

    const redis = Redis.fromEnv();
    const data = await redis.get(`monitor:${token}`);
    if (!data) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Configuração não encontrada' })
      };
    }

    let stored;
    try {
      stored = typeof data === 'string' ? JSON.parse(data) : data;
    } catch {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Dados inválidos no Redis' })
      };
    }

    if (stored.empresa !== empresa) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Configuração não encontrada' })
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true })
    };
  } catch (err) {
    console.error('verifyMonitor error', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Erro interno do servidor' })
    };
  }
}
