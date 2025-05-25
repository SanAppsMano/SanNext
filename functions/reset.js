// functions/reset.js
import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN
})

export const handler = async (event) => {
  const token = event.queryStringParameters?.t
  if (!token) {
    return { statusCode: 400, body: 'Missing tenant token' }
  }

  try {
    // Chave do contador de tickets
    const counterKey = `ticket:${token}`
    // Chave da lista da fila
    const queueKey   = `queue:${token}`

    // Remove ambos
    await redis.del(counterKey)
    await redis.del(queueKey)

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true })
    }
  } catch (e) {
    console.error('Reset error:', e)
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: e.message })
    }
  }
}
