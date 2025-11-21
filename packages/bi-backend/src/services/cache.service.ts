import NodeCache from 'node-cache';
import Redis from 'ioredis';
import { config } from '../config';
import { createLogger } from '../utils/logger';

const logger = createLogger('cache');

// L1 Cache: In-memory (NodeCache)
const l1Cache = new NodeCache({
  stdTTL: config.cache.l1Ttl,
  checkperiod: 60,
  useClones: false,
});

// L2 Cache: Redis
let l2Cache: Redis | null = null;

function getRedisClient(): Redis {
  if (!l2Cache) {
    l2Cache = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      db: config.redis.db,
      retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

    l2Cache.on('error', (err) => {
      logger.error({ err }, 'Redis connection error');
    });

    l2Cache.on('connect', () => {
      logger.info('Redis connected');
    });
  }

  return l2Cache;
}

export interface CacheOptions {
  ttl?: number; // TTL in seconds
  skipL1?: boolean; // Skip L1 cache
  skipL2?: boolean; // Skip L2 cache
}

export async function getCached<T>(key: string, options: CacheOptions = {}): Promise<T | null> {
  const { skipL1 = false, skipL2 = false } = options;

  // Try L1 cache first
  if (!skipL1) {
    const l1Data = l1Cache.get<T>(key);
    if (l1Data !== undefined) {
      logger.debug({ key, source: 'L1' }, 'Cache hit');
      return l1Data;
    }
  }

  // Try L2 cache (Redis)
  if (!skipL2) {
    try {
      const redis = getRedisClient();
      const l2Data = await redis.get(key);

      if (l2Data) {
        const parsed = JSON.parse(l2Data) as T;

        // Backfill L1 cache
        if (!skipL1) {
          l1Cache.set(key, parsed);
        }

        logger.debug({ key, source: 'L2' }, 'Cache hit');
        return parsed;
      }
    } catch (err) {
      logger.warn({ err, key }, 'L2 cache read failed');
    }
  }

  logger.debug({ key }, 'Cache miss');
  return null;
}

export async function setCached<T>(
  key: string,
  value: T,
  options: CacheOptions = {}
): Promise<void> {
  const { ttl = config.cache.l2Ttl, skipL1 = false, skipL2 = false } = options;

  // Set L1 cache
  if (!skipL1) {
    l1Cache.set(key, value, config.cache.l1Ttl);
  }

  // Set L2 cache (Redis)
  if (!skipL2) {
    try {
      const redis = getRedisClient();
      await redis.setex(key, ttl, JSON.stringify(value));
    } catch (err) {
      logger.warn({ err, key }, 'L2 cache write failed');
    }
  }

  logger.debug({ key, ttl }, 'Cache set');
}

export async function deleteCached(key: string): Promise<void> {
  // Delete from L1
  l1Cache.del(key);

  // Delete from L2
  try {
    const redis = getRedisClient();
    await redis.del(key);
  } catch (err) {
    logger.warn({ err, key }, 'L2 cache delete failed');
  }

  logger.debug({ key }, 'Cache deleted');
}

export async function acquireLock(key: string, ttl: number = 10): Promise<boolean> {
  try {
    const redis = getRedisClient();
    const result = await redis.set(key, '1', 'EX', ttl, 'NX');
    return result === 'OK';
  } catch (err) {
    logger.warn({ err, key }, 'Failed to acquire lock');
    return false;
  }
}

export async function releaseLock(key: string): Promise<void> {
  try {
    const redis = getRedisClient();
    await redis.del(key);
  } catch (err) {
    logger.warn({ err, key }, 'Failed to release lock');
  }
}
