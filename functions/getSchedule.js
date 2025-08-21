// functions/getSchedule.js
const { Redis } = require('@upstash/redis');

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN
});

exports.handler = async (event) => {
  const token = event.queryStringParameters && event.queryStringParameters.t;
  if (!token) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing token' }) };
  }
  try {
    const data = await redis.get(`monitor:${token}`);
    if (!data) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Configuração não encontrada' }) };
    }
    let stored;
    try {
      stored = JSON.parse(data);
    } catch {
      return { statusCode: 500, body: JSON.stringify({ error: 'Dados inválidos' }) };
    }
    return {
      statusCode: 200,
      body: JSON.stringify({ schedule: stored.schedule || null })
    };
  } catch (err) {
    console.error('getSchedule error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
