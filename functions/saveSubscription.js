import { Redis } from "@upstash/redis";

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }
  const url = new URL(event.rawUrl);
  const tenantId = url.searchParams.get("t");
  if (!tenantId) {
    return { statusCode: 400, body: "Missing tenantId" };
  }
  let data;
  try {
    data = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: "Invalid JSON" };
  }
  const { clientId, subscription } = data;
  if (!clientId || !subscription) {
    return { statusCode: 400, body: "Missing data" };
  }

  const redis = Redis.fromEnv();
  const prefix = `tenant:${tenantId}:`;
  await redis.set(prefix + `subscription:${clientId}`, JSON.stringify(subscription));

  return {
    statusCode: 200,
    body: JSON.stringify({ saved: true })
  };
}
