import { Redis } from '@upstash/redis';
import bcrypt from 'bcryptjs';

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Método não permitido' })
    };
  }

  let body;
  try {
    if (typeof event.body === 'string') {
      body = JSON.parse(event.body || '{}');
    } else {
      body = event.body || {};
    }
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'JSON inválido' }) };
  }

  const { empresa, senha } = body;
  if (!empresa || !senha) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Dados incompletos' }) };
  }

  const key = `monitorByEmpresa:${empresa.toLowerCase()}`;

  let redis;
  try {
    redis = Redis.fromEnv();
  } catch (err) {
    console.error('Redis init error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Server configuration error' })
    };
  }

  try {
    const token = await redis.get(key);
    if (!token) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Empresa não encontrada' }) };
    }

    const data = await redis.get(`monitor:${token}`);
    if (!data) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Configuração não encontrada' }) };
    }

    const stored = JSON.parse(data);
    let valid = false;
    if (stored.pwHash) {
      valid = await bcrypt.compare(senha, stored.pwHash);
    } else if (stored.senha) {
      if (stored.senha === senha) {
        valid = true;
        try {
          const pwHash = await bcrypt.hash(senha, 10);
          stored.pwHash = pwHash;
          delete stored.senha;
          await redis.set(`monitor:${token}`, JSON.stringify(stored));
        } catch (err) {
          console.error('password migration error:', err);
        }
      }
    }

    if (!valid) {
      return { statusCode: 403, body: JSON.stringify({ error: 'Senha inválida' }) };
    }

    return { statusCode: 200, body: JSON.stringify({ token }) };
  } catch (err) {
    console.error('getMonitorToken error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
}
