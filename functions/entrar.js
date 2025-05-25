// functions/entrar.js
import { v4 as uuidv4 } from 'uuid'
import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN
})

export const handler = async (event) => {
  // 1) Extrai IP do cliente
  const ip = event.headers['x-nf-client-connection-ip']
           || event.headers['x-forwarded-for']
           || 'unknown'

  // 2) Rate-limit: máximo de 5 chamadas por IP por minuto
  const rateKey = `rate:enter:${ip}`
  const count = await redis.incr(rateKey)
  if (count === 1) {
    await redis.expire(rateKey, 60)  // expira em 60s
  }
  if (count > 5) {
    return {
      statusCode: 429,
      body: JSON.stringify({ error: 'Muitas requisições. Tente novamente em breve.' })
    }
  }

  // 3) Lógica normal de gerar clientId e ticketNumber
  const token = event.queryStringParameters.t
  const clientId = uuidv4()
  // ex: push em lista Redis e contar tickets
  const ticketNumber = await redis.incr(`ticket:${token}`)

  await redis.rpush(`queue:${token}`, clientId)

  return {
    statusCode: 200,
    body: JSON.stringify({ clientId, ticketNumber })
  }
}
