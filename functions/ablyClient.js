import Ably from 'ably/promises';

const ably = new Ably.Rest(process.env.ABLY_API_KEY);

export function publish(tenantId, event, data) {
  try {
    const channel = ably.channels.get(`tenant:${tenantId}`);
    return channel.publish(event, data);
  } catch (err) {
    console.error('Ably publish error:', err);
  }
}
