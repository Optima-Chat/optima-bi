# 性能优化指南

> 基于专家评审建议的性能优化最佳实践

**目标**: API 响应时间 P50 < 500ms, P99 < 2s

---

## 📊 优化优先级

| 优化项 | 影响 | 优先级 | 工作量 | 状态 |
|--------|------|--------|--------|------|
| 预聚合表 | ⭐⭐⭐⭐⭐ | 🔴 P0 | 3-5天 | 必须 |
| 数据库索引 | ⭐⭐⭐⭐ | 🔴 P0 | 1天 | 必须 |
| 多层缓存 | ⭐⭐⭐⭐ | 🔴 P0 | 2-3天 | 必须 |
| 查询优化 | ⭐⭐⭐ | 🟡 P1 | 2天 | 建议 |
| 连接池优化 | ⭐⭐ | 🟡 P1 | 1天 | 建议 |

---

## 🎯 优化策略

### 1. 预聚合表（必须 - P0）

#### 问题
```sql
-- 当前查询（慢）
SELECT
  DATE(created_at) as date,
  SUM(amount_total) as revenue,
  COUNT(*) as orders
FROM orders
WHERE merchant_id = 'xxx'
  AND created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at);

-- 执行时间: 2-5 秒
-- 全表扫描 + 实时聚合
```

#### 解决方案
```sql
-- 查询预聚合表（快）
SELECT date, total_revenue, order_count
FROM daily_merchant_summary
WHERE merchant_id = 'xxx'
  AND date >= CURRENT_DATE - 30;

-- 执行时间: 50-200 毫秒
-- 索引查询 + 预计算数据
```

**性能提升**: 10-100 倍

详见: [ADR-006: 预聚合表设计](./architecture/adr-006-materialized-views.md)

---

### 2. 数据库索引优化（必须 - P0）

#### 必要索引清单

```sql
-- 1. 订单表索引（最重要）
CREATE INDEX idx_orders_merchant_created_status
ON orders(merchant_id, created_at, status)
WHERE status IN ('paid', 'delivered');

CREATE INDEX idx_orders_merchant_date
ON orders(merchant_id, DATE(created_at))
WHERE status IN ('paid', 'delivered');

-- 2. 订单明细表索引
CREATE INDEX idx_order_items_product
ON order_items(product_id, order_id);

-- 3. 商品表索引
CREATE INDEX idx_products_merchant_status
ON products(merchant_id, status, created_at);

-- 4. 预聚合表索引
CREATE INDEX idx_daily_summary_merchant_date
ON daily_merchant_summary(merchant_id, date DESC);

CREATE INDEX idx_daily_summary_date
ON daily_merchant_summary(date DESC);
```

#### 索引使用验证

```sql
-- 使用 EXPLAIN ANALYZE 验证索引
EXPLAIN ANALYZE
SELECT * FROM orders
WHERE merchant_id = 'xxx'
  AND created_at >= NOW() - INTERVAL '7 days';

-- 预期输出:
-- Index Scan using idx_orders_merchant_created_status
-- Execution Time: < 100ms
```

---

### 3. 多层缓存策略（必须 - P0）

#### 三层缓存架构

```
查询请求
  ↓
L1: 内存缓存 (1 分钟) ← 极热数据
  ↓ miss
L2: Redis 缓存 (5 分钟) ← 热数据
  ↓ miss
L3: 预聚合表 (实时) ← 温数据
  ↓ miss
L4: 原始表 (实时) ← 冷数据
```

#### 实现代码

```typescript
// src/services/cache.service.ts
import NodeCache from 'node-cache';
import { Redis } from 'ioredis';

export class CacheService {
  private memCache: NodeCache;
  private redis: Redis;

  constructor() {
    this.memCache = new NodeCache({ stdTTL: 60 }); // L1: 1 分钟
    this.redis = new Redis(process.env.REDIS_URL);
  }

  async get<T>(key: string): Promise<T | null> {
    // L1: 内存缓存
    const memData = this.memCache.get<T>(key);
    if (memData) {
      logger.debug({ cache: 'L1_HIT', key });
      return memData;
    }

    // L2: Redis 缓存
    const redisData = await this.redis.get(key);
    if (redisData) {
      const data = JSON.parse(redisData) as T;
      this.memCache.set(key, data); // 写入 L1
      logger.debug({ cache: 'L2_HIT', key });
      return data;
    }

    logger.debug({ cache: 'MISS', key });
    return null;
  }

  async set<T>(key: string, data: T, ttl: number = 300): Promise<void> {
    // 写入 L1 (内存)
    this.memCache.set(key, data);

    // 写入 L2 (Redis)
    await this.redis.set(key, JSON.stringify(data), 'EX', ttl);
  }

  async del(key: string): Promise<void> {
    this.memCache.del(key);
    await this.redis.del(key);
  }
}
```

#### 防止缓存击穿

```typescript
// 使用分布式锁防止并发查询
async getSalesDataWithLock(merchantId: string, days: number) {
  const cacheKey = `sales:${merchantId}:${days}`;
  const lockKey = `lock:${cacheKey}`;

  // 尝试获取缓存
  let data = await this.cacheService.get(cacheKey);
  if (data) return data;

  // 获取分布式锁
  const lock = await this.redis.set(lockKey, '1', 'EX', 10, 'NX');

  if (lock) {
    try {
      // 获取锁成功，查询数据库
      data = await this.querySalesFromDB(merchantId, days);

      // 写入缓存
      await this.cacheService.set(cacheKey, data, 300);

      return data;
    } finally {
      // 释放锁
      await this.redis.del(lockKey);
    }
  } else {
    // 获取锁失败，等待后重试
    await sleep(50);
    return this.getSalesDataWithLock(merchantId, days);
  }
}
```

---

### 4. SQL 查询优化（建议 - P1）

#### 查询优化清单

##### ✅ 避免 SELECT *
```sql
-- ❌ 不好
SELECT * FROM orders WHERE merchant_id = 'xxx';

-- ✅ 好
SELECT id, order_number, amount_total, created_at
FROM orders WHERE merchant_id = 'xxx';
```

##### ✅ 使用 LIMIT
```sql
-- ❌ 不好
SELECT * FROM orders WHERE merchant_id = 'xxx';

-- ✅ 好
SELECT id, amount_total FROM orders
WHERE merchant_id = 'xxx'
ORDER BY created_at DESC
LIMIT 100;
```

##### ✅ 避免子查询
```sql
-- ❌ 不好
SELECT * FROM orders
WHERE merchant_id IN (
  SELECT id FROM merchants WHERE is_active = true
);

-- ✅ 好
SELECT o.* FROM orders o
JOIN merchants m ON o.merchant_id = m.id
WHERE m.is_active = true;
```

##### ✅ 使用 EXISTS 替代 IN
```sql
-- ❌ 不好
SELECT * FROM products
WHERE id IN (SELECT product_id FROM order_items);

-- ✅ 好
SELECT * FROM products p
WHERE EXISTS (
  SELECT 1 FROM order_items oi WHERE oi.product_id = p.id
);
```

##### ✅ 批量操作
```typescript
// ❌ 不好：N+1 查询
for (const orderId of orderIds) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
}

// ✅ 好：批量查询
const orders = await prisma.order.findMany({
  where: { id: { in: orderIds } }
});
```

---

### 5. 连接池优化（建议 - P1）

#### Prisma 连接池配置

```typescript
// prisma/schema.prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// .env
DATABASE_URL="postgresql://user:pass@host:5432/db?
  connection_limit=10&
  pool_timeout=10&
  connect_timeout=10"
```

#### 连接池最佳实践

```typescript
// src/db/prisma.ts
import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development'
      ? ['query', 'error', 'warn']
      : ['error'],
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// 优雅关闭
process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});
```

**连接池大小建议**:
- **开发环境**: 5-10 连接
- **生产环境**: 20-50 连接（根据并发量调整）
- **计算公式**: `连接数 = (核心数 × 2) + 磁盘数`

---

## 📈 性能监控

### 关键指标

| 指标 | 目标 | 警告阈值 | 严重阈值 |
|------|------|---------|---------|
| API 响应时间 (P50) | < 500ms | > 1s | > 2s |
| API 响应时间 (P99) | < 2s | > 3s | > 5s |
| 缓存命中率 | > 70% | < 50% | < 30% |
| 数据库查询时间 | < 200ms | > 500ms | > 1s |
| 慢查询数量 | 0 | > 10/小时 | > 50/小时 |
| 错误率 | < 0.1% | > 1% | > 5% |

### 监控实现

```typescript
// src/middleware/metrics.ts
import { FastifyRequest, FastifyReply } from 'fastify';

export async function metricsMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const start = Date.now();

  reply.addHook('onSend', async () => {
    const duration = Date.now() - start;

    // 记录指标
    logger.info({
      type: 'api_metrics',
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      duration,
      merchantId: request.user?.merchantId,
    });

    // 慢查询告警
    if (duration > 2000) {
      logger.warn({
        type: 'slow_query',
        duration,
        url: request.url,
      });
    }
  });
}
```

---

## 🧪 性能测试

### 基准测试

```bash
# 使用 Apache Bench 进行基准测试
ab -n 1000 -c 10 \
   -H "Authorization: Bearer <token>" \
   https://bi-api.optima.chat/api/v1/sales?days=7

# 预期结果:
# Requests per second: > 50 req/s
# Time per request: < 200ms (mean)
# Time per request: < 2000ms (99th percentile)
```

### 压力测试

```bash
# 使用 k6 进行压力测试
k6 run - <<EOF
import http from 'k6/http';
import { check } from 'k6';

export let options = {
  stages: [
    { duration: '2m', target: 50 },   // 升至 50 并发
    { duration: '5m', target: 50 },   // 保持 50 并发
    { duration: '2m', target: 100 },  // 升至 100 并发
    { duration: '5m', target: 100 },  // 保持 100 并发
    { duration: '2m', target: 0 },    // 降至 0
  ],
};

export default function() {
  let response = http.get('https://bi-api.optima.chat/api/v1/sales?days=7', {
    headers: { 'Authorization': 'Bearer <token>' },
  });

  check(response, {
    'status is 200': (r) => r.status === 200,
    'response time < 2s': (r) => r.timings.duration < 2000,
  });
}
EOF
```

### 数据规模测试

```sql
-- 创建测试数据（100 万订单）
INSERT INTO orders (...)
SELECT
  gen_random_uuid(),
  'merchant_test',
  'ORD-' || generate_series,
  ...
FROM generate_series(1, 1000000);

-- 测试查询性能
EXPLAIN ANALYZE
SELECT * FROM daily_merchant_summary
WHERE merchant_id = 'merchant_test'
  AND date >= CURRENT_DATE - 90;

-- 预期: < 200ms
```

---

## ✅ 性能优化检查清单

### MVP 阶段（必须完成）

- [ ] **创建预聚合表**
  - [ ] daily_merchant_summary
  - [ ] weekly_product_summary
  - [ ] monthly_customer_summary
  - [ ] ETL 脚本和 Cron Job

- [ ] **添加数据库索引**
  - [ ] orders 表索引
  - [ ] order_items 表索引
  - [ ] products 表索引
  - [ ] 预聚合表索引

- [ ] **实现多层缓存**
  - [ ] L1 内存缓存（NodeCache）
  - [ ] L2 Redis 缓存
  - [ ] 分布式锁（防击穿）
  - [ ] 缓存预热

- [ ] **性能测试**
  - [ ] 基准测试（AB）
  - [ ] 压力测试（k6）
  - [ ] 数据规模测试（百万级）
  - [ ] 性能报告

### Phase 2（建议完成）

- [ ] **查询优化**
  - [ ] SQL 慢查询分析
  - [ ] EXPLAIN ANALYZE 所有查询
  - [ ] 批量查询替代 N+1
  - [ ] 避免 SELECT *

- [ ] **监控和告警**
  - [ ] 响应时间监控
  - [ ] 缓存命中率监控
  - [ ] 慢查询告警
  - [ ] 错误率监控

- [ ] **连接池优化**
  - [ ] 连接池大小调整
  - [ ] 连接超时配置
  - [ ] 连接泄漏检测

---

## 📚 参考资料

- [PostgreSQL Performance Optimization](https://wiki.postgresql.org/wiki/Performance_Optimization)
- [Redis Best Practices](https://redis.io/docs/manual/patterns/)
- [Prisma Performance Best Practices](https://www.prisma.io/docs/guides/performance-and-optimization)
- [专家评审报告](./expert-review.md)

---

**维护者**: Optima BI Team
**最后更新**: 2025-01-21
