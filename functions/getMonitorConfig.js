// functions/getMonitorConfig.js
const { Redis } = require('@upstash/redis');
const bcrypt = require('bcryptjs');

const redisClient = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN
});

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Método não permitido' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'JSON inválido' }) };
  }

  const { token, senha } = body;
  if (!token || !senha) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Token ou senha ausente' }) };
  }

  let data;
  try {
    data = await redisClient.get(`monitor:${token}`);
  } catch (err) {
    console.error('Redis fetch error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }

  if (!data) {
    return { statusCode: 404, body: JSON.stringify({ error: 'Configuração não encontrada' }) };
  }

  let stored;
  try {
    stored = JSON.parse(data);
  } catch {
    return { statusCode: 500, body: JSON.stringify({ error: 'Dados inválidos no Redis' }) };
  }

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
        await redisClient.set(`monitor:${token}`, JSON.stringify(stored));
      } catch (err) {
        console.error('password migration error:', err);
      }
    }
  }

  if (!valid) {
    return { statusCode: 403, body: JSON.stringify({ error: 'Senha inválida' }) };
  }

  let schedule = stored.schedule;
  if (!schedule) {
    try {
      const schedRaw = await redisClient.get(`tenant:${token}:schedule`);
      if (schedRaw) {
        schedule = typeof schedRaw === 'string' ? JSON.parse(schedRaw) : schedRaw;
      }
    } catch (err) {
      console.error('schedule fetch error:', err);
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ empresa: stored.empresa, schedule })
  };
};
