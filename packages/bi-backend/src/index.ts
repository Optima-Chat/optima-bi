import Fastify from 'fastify';
import cors from '@fastify/cors';
import { createLogger } from './utils/logger';

const logger = createLogger('server');

async function start() {
  const fastify = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
      transport:
        process.env.NODE_ENV === 'development'
          ? {
              target: 'pino-pretty',
              options: {
                translateTime: 'HH:MM:ss Z',
                ignore: 'pid,hostname',
              },
            }
          : undefined,
    },
  });

  // Register CORS
  await fastify.register(cors, {
    origin: process.env.CORS_ORIGIN || '*',
  });

  // Health check endpoint
  fastify.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // API routes placeholder
  fastify.get('/api/v1', async () => {
    return { message: 'Optima BI API v1' };
  });

  // Start server
  const port = Number(process.env.PORT) || 3001;
  const host = process.env.HOST || '0.0.0.0';

  try {
    await fastify.listen({ port, host });
    logger.info(`🚀 bi-backend listening on http://${host}:${port}`);
  } catch (err) {
    logger.error(err);
    process.exit(1);
  }
}

start();
