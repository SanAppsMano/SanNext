// functions/cancelar.js
import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN
})

export const handler = async (event) => {
  const { t: token } = event.queryStringParameters
  const { clientId, ticketNumber } = JSON.parse(event.body)

  // 1) Remove o cliente da fila
  await redis.lrem(`queue:${token}`, 0, clientId)

  // 2) Registra cancelamento com timestamp
  const ts = Date.now()
  await redis.zadd(`cancelados:${token}`, { score: ts, member: ticketNumber })

  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true })
  }
}
