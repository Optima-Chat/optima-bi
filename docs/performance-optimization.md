# 性能优化指南

> 基于专家评审建议和 ClickHouse OLAP 架构的性能优化最佳实践

**目标**: API 响应时间 P50 < 100ms, P99 < 500ms, CDC 延迟 < 1 秒

**性能提升**: 50-1000 倍（vs 原 PostgreSQL 直接查询）

---

## 📊 优化优先级

| 优化项 | 影响 | 优先级 | 工作量 | 状态 |
|--------|------|--------|--------|------|
| ClickHouse OLAP 部署 | ⭐⭐⭐⭐⭐ | 🔴 P0 | 2-3天 | 必须 |
| Debezium CDC + Kafka | ⭐⭐⭐⭐⭐ | 🔴 P0 | 3-4天 | 必须 |
| ClickHouse 物化视图 | ⭐⭐⭐⭐⭐ | 🔴 P0 | 2-3天 | 必须 |
| 多层缓存架构 | ⭐⭐⭐⭐ | 🔴 P0 | 1-2天 | 必须 |
| ClickHouse 查询优化 | ⭐⭐⭐ | 🟡 P1 | 2天 | 建议 |
| 性能监控和告警 | ⭐⭐⭐ | 🟡 P1 | 1-2天 | 建议 |

---

## 🎯 优化策略

### 1. ClickHouse OLAP 架构（必须 - P0）

#### 问题：OLTP/OLAP 混用
```sql
-- ❌ PostgreSQL OLTP 查询（慢：2-5 秒）
SELECT
  DATE(created_at) as date,
  SUM(amount_total) as revenue,
  COUNT(*) as orders
FROM orders
WHERE merchant_id = 'xxx'
  AND created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at);

-- 问题:
-- 1. 全表扫描（百万级订单）
-- 2. 实时聚合计算
-- 3. 影响 OLTP 业务
-- 4. 线性扩展瓶颈
```

#### 解决方案：ClickHouse OLAP + CDC

**架构概览**：
```
PostgreSQL (OLTP) → Debezium CDC → Kafka → ClickHouse (OLAP) → bi-backend
                     (变更捕获)    (消息队列)  (物化视图)      (查询)
                     < 1 秒延迟              10-50ms 查询
```

**ClickHouse 查询**（快：10-50ms）：
```sql
-- ✅ ClickHouse 物化视图查询
SELECT date, total_revenue, order_count, avg_order_value
FROM daily_sales_mv
WHERE merchant_id = 'xxx'
  AND date >= today() - 30
ORDER BY date DESC;

-- 优势:
-- 1. 列式存储（只读需要的列）
-- 2. 预聚合数据（物化视图自动计算）
-- 3. 分区裁剪（月度分区）
-- 4. 零 OLTP 影响
-- 执行时间: 10-50 毫秒
```

**性能提升**: 50-1000 倍

详见: [ADR-006: ClickHouse + CDC 架构](./architecture/adr-006-clickhouse-olap.md)

---

### 2. ClickHouse 优化策略（必须 - P0）

#### 2.1 选择合适的表引擎

```sql
-- ✅ ReplacingMergeTree: 处理 UPDATE 操作
CREATE TABLE orders (
    id UUID,
    merchant_id UUID,
    amount_total Decimal(10, 2),
    created_at DateTime,
    updated_at DateTime
)
ENGINE = ReplacingMergeTree(updated_at)  -- 按 updated_at 去重
PARTITION BY toYYYYMM(created_at)        -- 按月分区
ORDER BY (merchant_id, created_at, id);  -- 排序键（主键）

-- ✅ SummingMergeTree: 自动聚合求和
CREATE MATERIALIZED VIEW daily_sales_mv
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (merchant_id, date)
AS SELECT
    merchant_id,
    toDate(created_at) as date,
    sum(amount_total) as total_revenue,
    count() as order_count
FROM orders
GROUP BY merchant_id, date;
```

#### 2.2 分区策略

```sql
-- 按月分区（推荐）
PARTITION BY toYYYYMM(created_at)

-- 优势:
-- 1. 分区裁剪：查询 2024-01 只扫描一个分区
-- 2. 数据管理：删除旧数据只需 DROP PARTITION
-- 3. 性能提升：10-100x（vs 全表扫描）

-- 示例：删除 2023 年 1 月数据
ALTER TABLE orders DROP PARTITION '202301';
```

#### 2.3 排序键（主键）优化

```sql
-- ✅ 优先级原则：高基数在前，低基数在后
ORDER BY (merchant_id, created_at, id)
-- merchant_id: 高基数（1000+ 商家）
-- created_at: 时间戳（天然顺序）
-- id: UUID（唯一标识）

-- ❌ 错误示例：低基数字段在前
ORDER BY (status, merchant_id, created_at)
-- status 只有 5-10 个值，索引效率低

-- 查询示例（利用排序键）:
SELECT * FROM orders
WHERE merchant_id = 'xxx'
  AND created_at >= '2024-01-01'
-- 执行时间: < 10ms（主键索引）
```

#### 2.4 压缩优化

```sql
-- ClickHouse 默认使用 LZ4 压缩
-- 压缩比: 10:1（vs 原始数据）
-- 1 亿行订单 ≈ 10GB 存储

-- 查看压缩统计
SELECT
    table,
    formatReadableSize(sum(bytes_on_disk)) as size,
    formatReadableSize(sum(data_uncompressed_bytes)) as uncompressed,
    round(sum(data_uncompressed_bytes) / sum(bytes_on_disk), 2) as ratio
FROM system.parts
WHERE table = 'orders'
GROUP BY table;
```

#### 2.5 查询性能验证

```sql
-- 使用 EXPLAIN 分析查询
EXPLAIN
SELECT * FROM orders
WHERE merchant_id = 'xxx'
  AND created_at >= today() - 30;

-- 预期输出:
-- Expression
--   Filter (merchant_id = 'xxx')
--   ReadFromMergeTree (orders)
--     Prewhere: toYYYYMM(created_at) IN (202401, 202402)  -- 分区裁剪
--     Where: merchant_id = 'xxx'

-- 查询统计
SELECT
    query_duration_ms,
    read_rows,
    read_bytes,
    memory_usage
FROM system.query_log
WHERE query LIKE '%daily_sales_mv%'
ORDER BY event_time DESC
LIMIT 10;
```

---

### 3. 多层缓存策略（必须 - P0）

#### 四层缓存架构

```
查询请求
  ↓
L1: NodeCache 内存缓存 (1 分钟) ← 极热数据
  ↓ miss
L2: Redis 缓存 (5 分钟) ← 热数据
  ↓ miss
L3: ClickHouse 物化视图 (实时) ← 温数据（10-50ms）
  ↓ miss
L4: ClickHouse 原始表 (实时) ← 冷数据（50-200ms）
```

**查询优先级**：
1. L1/L2: 缓存命中 → 直接返回（< 10ms）
2. L3: ClickHouse 物化视图 → 预聚合数据（10-50ms）
3. L4: ClickHouse 原始表 → 实时聚合（50-200ms）

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
| **API 层** |
| API 响应时间 (P50) | < 100ms | > 200ms | > 500ms |
| API 响应时间 (P99) | < 500ms | > 1s | > 2s |
| 错误率 | < 0.1% | > 1% | > 5% |
| **缓存层** |
| 缓存命中率 (L1+L2) | > 70% | < 50% | < 30% |
| **ClickHouse 层** |
| ClickHouse 查询时间 | < 50ms | > 100ms | > 200ms |
| ClickHouse 慢查询 | 0 | > 5/小时 | > 20/小时 |
| **CDC 层** |
| CDC 数据延迟 | < 1s | > 3s | > 10s |
| Kafka 消费延迟 | < 500ms | > 2s | > 5s |
| Kafka 消息堆积 | 0 | > 1000 | > 10000 |

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
      dataSource: request.dataSource,  // 'CLICKHOUSE_MV' | 'CLICKHOUSE_RAW'
      cacheHit: request.cacheHit,      // 'L1' | 'L2' | null
      clickhouseDuration: request.clickhouseDuration,
    });

    // 慢查询告警（ClickHouse 架构下阈值更低）
    if (duration > 500) {
      logger.warn({
        type: 'slow_api_request',
        duration,
        url: request.url,
        dataSource: request.dataSource,
      });
    }

    // ClickHouse 慢查询告警
    if (request.clickhouseDuration > 100) {
      logger.warn({
        type: 'slow_clickhouse_query',
        duration: request.clickhouseDuration,
        query: request.clickhouseQuery,
      });
    }
  });
}

// src/services/monitoring.service.ts
export class MonitoringService {
  // CDC 延迟监控
  async monitorCdcLatency() {
    const pgLatest = await prisma.order.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true }
    });

    const chResult = await clickhouse.query({
      query: `SELECT max(created_at) as latest FROM orders`,
      format: 'JSONEachRow',
    });
    const chLatest = await chResult.json();

    const latency = pgLatest.createdAt - chLatest[0].latest;

    logger.info({
      type: 'cdc_latency',
      latency_ms: latency,
      pg_latest: pgLatest.createdAt,
      ch_latest: chLatest[0].latest,
    });

    if (latency > 3000) {
      logger.warn({ type: 'cdc_latency_alert', latency_ms: latency });
    }
  }
}
```

---

## 🧪 性能测试

### 基准测试（ClickHouse 架构）

```bash
# 使用 Apache Bench 进行基准测试
ab -n 1000 -c 50 \
   -H "Authorization: Bearer <token>" \
   https://bi-api.optima.chat/api/v1/sales?days=7

# 预期结果（ClickHouse 架构）:
# Requests per second: > 100 req/s（vs 原 50 req/s）
# Time per request (mean): < 100ms（vs 原 200ms）
# Time per request (50th percentile): < 100ms
# Time per request (99th percentile): < 500ms（vs 原 2000ms）
```

### 压力测试

```bash
# 使用 k6 进行压力测试
k6 run - <<EOF
import http from 'k6/http';
import { check } from 'k6';

export let options = {
  stages: [
    { duration: '2m', target: 100 },  // 升至 100 并发
    { duration: '5m', target: 100 },  // 保持 100 并发
    { duration: '2m', target: 200 },  // 升至 200 并发
    { duration: '5m', target: 200 },  // 保持 200 并发
    { duration: '2m', target: 500 },  // 升至 500 并发（极限测试）
    { duration: '3m', target: 500 },  // 保持 500 并发
    { duration: '2m', target: 0 },    // 降至 0
  ],
};

export default function() {
  let response = http.get('https://bi-api.optima.chat/api/v1/sales?days=7', {
    headers: { 'Authorization': 'Bearer <token>' },
  });

  check(response, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,  // ClickHouse 目标
    'response time < 1s': (r) => r.timings.duration < 1000,
  });
}
EOF

# 预期结果:
# ✅ 100 并发: P95 < 200ms
# ✅ 200 并发: P95 < 300ms
# ✅ 500 并发: P95 < 500ms
```

### CDC 延迟测试

```bash
# 测试 PostgreSQL → ClickHouse CDC 延迟
# 1. 在 PostgreSQL 插入订单
psql -c "INSERT INTO orders (...) VALUES (...);" -c "SELECT now();"

# 2. 等待 1 秒
sleep 1

# 3. 在 ClickHouse 查询订单
clickhouse-client --query "SELECT * FROM orders WHERE id = 'xxx';" --query "SELECT now();"

# 预期结果:
# ✅ CDC 延迟 < 1 秒
# ✅ 订单数据已同步到 ClickHouse
```

### 数据规模测试（ClickHouse）

```sql
-- ClickHouse 数据规模测试
-- 导入 1000 万历史订单到 ClickHouse

-- 1. 测试 ClickHouse 物化视图查询（90 天销售）
SELECT * FROM daily_sales_mv
WHERE merchant_id = 'merchant_test'
  AND date >= today() - 90
ORDER BY date DESC;

-- 预期: < 50ms（vs PostgreSQL 2-5s）
-- 性能提升: 40-100x

-- 2. 测试 ClickHouse 原始表查询（7 天销售）
SELECT
    toDate(created_at) as date,
    sum(amount_total) as revenue,
    count() as orders
FROM orders
WHERE merchant_id = 'merchant_test'
  AND created_at >= today() - 7
  AND status IN ('paid', 'delivered')
GROUP BY date
ORDER BY date DESC;

-- 预期: < 100ms（vs PostgreSQL 2-5s）
-- 性能提升: 20-50x

-- 3. 测试商品 Top 10 查询
SELECT
    product_id,
    sum(quantity) as total_quantity,
    sum(amount) as total_revenue
FROM order_items
WHERE merchant_id = 'merchant_test'
  AND created_at >= today() - 30
GROUP BY product_id
ORDER BY total_revenue DESC
LIMIT 10;

-- 预期: < 50ms（vs PostgreSQL 3-8s）
-- 性能提升: 60-160x
```

---

## ✅ 性能优化检查清单

### Phase 1: ClickHouse + CDC 部署（必须完成 - P0）

- [ ] **ClickHouse 部署**
  - [ ] ClickHouse 单节点部署（Docker Compose）
  - [ ] 创建 orders 表（ReplacingMergeTree）
  - [ ] 创建 order_items 表（ReplacingMergeTree）
  - [ ] 创建 products 表（ReplacingMergeTree）
  - [ ] 配置分区策略（按月 PARTITION BY toYYYYMM）

- [ ] **ClickHouse 物化视图**
  - [ ] daily_sales_mv（SummingMergeTree）
  - [ ] hourly_sales_mv（SummingMergeTree）
  - [ ] product_stats_mv（SummingMergeTree）
  - [ ] customer_stats_mv（SummingMergeTree）
  - [ ] merchant_overview_mv（SummingMergeTree）

- [ ] **Debezium CDC + Kafka**
  - [ ] Kafka + Zookeeper 部署
  - [ ] Debezium Connect 部署
  - [ ] PostgreSQL Logical Replication 配置
  - [ ] 创建 Publication（dbz_publication）
  - [ ] 配置 Debezium Connector
  - [ ] 验证 CDC 流程（< 1 秒延迟）

- [ ] **ClickHouse Kafka Engine**
  - [ ] 创建 orders_kafka 表
  - [ ] 创建 orders_consumer 物化视图
  - [ ] 创建其他 Kafka 消费者表
  - [ ] 验证消息消费

- [ ] **bi-backend 集成 ClickHouse**
  - [ ] 安装 @clickhouse/client
  - [ ] 创建 ClickHouse 服务层
  - [ ] 重构查询服务（查询物化视图）
  - [ ] 集成多层缓存

- [ ] **多层缓存架构**
  - [ ] L1 内存缓存（NodeCache，1 分钟）
  - [ ] L2 Redis 缓存（5 分钟）
  - [ ] L3 ClickHouse 物化视图
  - [ ] L4 ClickHouse 原始表
  - [ ] 分布式锁（防击穿）

- [ ] **性能测试**
  - [ ] 基准测试（P50 < 100ms, P99 < 500ms）
  - [ ] 压力测试（500 并发）
  - [ ] CDC 延迟测试（< 1 秒）
  - [ ] 数据规模测试（千万级订单）
  - [ ] 性能报告（50-1000x 提升验证）

### Phase 2: 监控和优化（建议完成 - P1）

- [ ] **ClickHouse 查询优化**
  - [ ] 使用 EXPLAIN 分析所有查询
  - [ ] 优化排序键（ORDER BY）
  - [ ] 优化分区策略
  - [ ] 查看压缩统计

- [ ] **监控和告警**
  - [ ] API 响应时间监控（< 100ms）
  - [ ] ClickHouse 查询时间监控（< 50ms）
  - [ ] CDC 延迟监控（< 1 秒）
  - [ ] Kafka 消费延迟监控（< 500ms）
  - [ ] 缓存命中率监控（> 70%）
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
