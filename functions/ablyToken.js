import Ably from 'ably/promises';

export async function handler(event) {
  const url = new URL(event.rawUrl);
  const tenantId = url.searchParams.get('t');
  if (!tenantId) {
    return { statusCode: 400, body: 'Missing tenantId' };
  }

  const ably = new Ably.Rest(process.env.ABLY_API_KEY);
  try {
    const tokenRequest = await ably.auth.createTokenRequest({
      capability: JSON.stringify({ [`tenant:${tenantId}`]: ['subscribe'] })
    });
    return { statusCode: 200, body: JSON.stringify(tokenRequest) };
  } catch (err) {
    console.error('Ably token error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Ably error' }) };
  }
}
