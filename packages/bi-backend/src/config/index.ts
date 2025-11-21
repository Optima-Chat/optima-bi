export const config = {
  server: {
    port: Number(process.env.PORT) || 3001,
    host: process.env.HOST || '0.0.0.0',
    corsOrigin: process.env.CORS_ORIGIN || '*',
  },
  clickhouse: {
    host: process.env.CLICKHOUSE_HOST || 'http://localhost:7281',
    username: process.env.CLICKHOUSE_USER || 'default',
    password: process.env.CLICKHOUSE_PASSWORD || '',
    database: process.env.CLICKHOUSE_DB || 'bi',
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: Number(process.env.REDIS_PORT) || 7288,
    password: process.env.REDIS_PASSWORD || 'redis_password',
    db: Number(process.env.REDIS_DB) || 0,
  },
  cache: {
    l1Ttl: 60, // 1 minute
    l2Ttl: 300, // 5 minutes
  },
};
