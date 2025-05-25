// functions/cancelados.js
import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN
})

export const handler = async (event) => {
  const { t: token } = event.queryStringParameters

  // Lê todos os cancelados (membro = ticket, score = timestamp)
  const entries = await redis.zrevrange(`cancelados:${token}`, 0, -1, { withScores: true })
  const cancelled = []
  for (let i = 0; i < entries.length; i += 2) {
    cancelled.push({
      ticket: entries[i],
      ts: Number(entries[i + 1])
    })
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ cancelled })
  }
}
