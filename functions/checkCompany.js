import { Redis } from '@upstash/redis';

export async function getTokenByEmpresa(empresa, redis) {
  const client = redis || Redis.fromEnv();
  const key = `monitorByEmpresa:${empresa.toLowerCase()}`;
  return client.get(key);
}

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

  const { empresa } = body;
  if (!empresa) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Dados incompletos' }) };
  }

  try {
    const token = await getTokenByEmpresa(empresa);
    return { statusCode: 200, body: JSON.stringify({ exists: Boolean(token) }) };
  } catch (err) {
    console.error('checkCompany error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
}
