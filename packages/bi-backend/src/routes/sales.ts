import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getDailySales } from '../services/clickhouse.service';
import { getCached, setCached, acquireLock, releaseLock } from '../services/cache.service';

interface SalesQueryParams {
  days?: number;
  start_date?: string;
  end_date?: string;
}

export async function salesRoutes(fastify: FastifyInstance) {
  // GET /api/v1/sales - Get sales analytics
  fastify.get<{ Querystring: SalesQueryParams }>(
    '/api/v1/sales',
    async (request: FastifyRequest<{ Querystring: SalesQueryParams }>, reply: FastifyReply) => {
      const { days = 7 } = request.query;

      // TODO: Get merchant_id from authenticated user (JWT token)
      // For now, using a mock merchant_id
      const merchantId = '11111111-1111-1111-1111-111111111111';

      // Validate days parameter
      if (days < 1 || days > 365) {
        return reply.code(400).send({
          success: false,
          error: {
            code: 'INVALID_PARAMETER',
            message: 'days must be between 1 and 365',
          },
        });
      }

      // Cache key
      const cacheKey = `sales:${merchantId}:${days}`;

      try {
        // Try to get from cache (L1 + L2)
        const cachedData = await getCached(cacheKey);
        if (cachedData) {
          request.log.info({ cacheKey, source: 'cache' }, 'Cache hit');
          return reply.send({
            success: true,
            data: cachedData,
            meta: {
              cached: true,
              days,
            },
          });
        }

        // Acquire lock to prevent cache stampede
        const lockKey = `lock:${cacheKey}`;
        const lockAcquired = await acquireLock(lockKey, 10);

        if (!lockAcquired) {
          // Wait a bit and retry from cache
          await new Promise((resolve) => setTimeout(resolve, 100));
          const retryData = await getCached(cacheKey);
          if (retryData) {
            return reply.send({
              success: true,
              data: retryData,
              meta: {
                cached: true,
                days,
              },
            });
          }
        }

        try {
          // Fetch from ClickHouse
          const startTime = Date.now();
          const salesData = await getDailySales(merchantId, days);
          const duration = Date.now() - startTime;

          request.log.info(
            {
              merchantId,
              days,
              rowCount: salesData.length,
              duration,
            },
            'Sales data fetched'
          );

          // Calculate totals
          const totals = salesData.reduce(
            (acc, row) => ({
              total_revenue: acc.total_revenue + Number(row.total_revenue),
              total_orders: acc.total_orders + Number(row.order_count),
              total_customers: acc.total_customers + Number(row.unique_customers),
            }),
            { total_revenue: 0, total_orders: 0, total_customers: 0 }
          );

          const avgOrderValue =
            totals.total_orders > 0 ? totals.total_revenue / totals.total_orders : 0;

          const result = {
            summary: {
              total_revenue: totals.total_revenue,
              total_orders: totals.total_orders,
              avg_order_value: avgOrderValue,
              unique_customers: totals.total_customers,
            },
            daily: salesData,
          };

          // Set cache (L1 + L2)
          await setCached(cacheKey, result);

          return reply.send({
            success: true,
            data: result,
            meta: {
              cached: false,
              days,
              query_time_ms: duration,
            },
          });
        } finally {
          // Release lock
          if (lockAcquired) {
            await releaseLock(lockKey);
          }
        }
      } catch (err: unknown) {
        const errorObj = err as Error;
        request.log.error({ err, merchantId, days }, 'Sales query failed');
        return reply.code(500).send({
          success: false,
          error: {
            code: 'QUERY_FAILED',
            message: 'Failed to fetch sales data',
            details: errorObj.message || 'Unknown error',
          },
        });
      }
    }
  );
}
