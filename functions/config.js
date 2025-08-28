const requiredVars = [
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'FAUNA_SECRET',
];

for (const v of requiredVars) {
  if (!process.env[v]) {
    throw new Error(`Missing environment variable: ${v}`);
  }
}

export {};

