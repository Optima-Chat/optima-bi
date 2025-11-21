# ADR-006: 使用 ClickHouse + CDC 实时数据同步

**状态**: 🔴 必须采纳（基于专家评审建议）
**日期**: 2025-01-21
**决策者**: Optima BI Team
**相关 ADR**: [ADR-002](./adr-002-direct-db-access.md)

---

## 背景

在专家评审中发现，当前方案直接在 OLTP 数据库执行复杂分析查询存在严重性能问题：

### 当前架构问题

```
bi-backend → 直接查询 commerce-backend PostgreSQL (OLTP)
             ↓
          复杂聚合查询（90 天销售趋势）
          SELECT DATE(created_at), SUM(amount_total), COUNT(*)
          FROM orders
          WHERE merchant_id = 'xxx' AND created_at >= ...
          GROUP BY DATE(created_at)
          执行时间: 2-5 秒
```

### 问题分析

1. **性能影响 OLTP 业务**:
   - 订单创建、支付等业务受影响
   - 复杂查询占用大量 CPU/内存
   - 可能导致锁表

2. **查询性能差**:
   - 实时聚合计算慢（2-5 秒）
   - 全表扫描（即使有索引）
   - 历史数据查询越来越慢

3. **扩展性差**:
   - 商家数增长后压力线性增长
   - 无法支持复杂多维分析
   - 硬盘 I/O 成为瓶颈

---

## 决策

**采用 ClickHouse OLAP 数据库 + Debezium CDC + Kafka 实时数据同步架构**

### 整体架构

```
PostgreSQL (OLTP)
    ↓ 写入订单
[Write-Ahead Log]
    ↓ 监听 WAL
Debezium CDC (变更捕获)
    ↓ 发送事件
Kafka (消息队列)
    ↓ 消费消息
ClickHouse (OLAP 列存储)
    ↑ 查询
bi-backend
    ↑
bi-cli
```

### 核心组件

1. **ClickHouse**: 列式 OLAP 数据库，查询性能极佳
2. **Debezium CDC**: 监听 PostgreSQL WAL，捕获数据变更
3. **Kafka**: 消息队列，解耦和缓冲
4. **ClickHouse Kafka Engine**: 从 Kafka 实时消费数据

---

## 理由

### 为什么选择 ClickHouse 而非预聚合表

**性能对比**:

| 查询场景 | PostgreSQL | 预聚合表 | **ClickHouse** |
|---------|-----------|---------|----------------|
| 最近 7 天销售 | 2-5 秒 | 50-200ms | **10-50ms** |
| 90 天销售趋势 | 5-10 秒 | 200-500ms | **20-100ms** |
| 商品 Top 10 | 3-8 秒 | 300-800ms | **30-150ms** |
| 客户留存分析 | 10-30 秒 | 1-3 秒 | **100-500ms** |
| 数据延迟 | 0 (实时) | 1 小时 | **<1 秒** |

**性能提升**: **50-1000 倍**

### ClickHouse 优势

1. **列式存储**: 只读取需要的列，压缩比高（10:1）
2. **向量化执行**: SIMD 指令加速计算
3. **分布式查询**: 支持水平扩展（未来可多节点）
4. **物化视图**: 自动预聚合，查询更快
5. **实时写入**: Kafka Engine 支持秒级同步

### 为什么选择 CDC 而非定时同步

**CDC (Change Data Capture) 优势**:

| 维度 | 定时同步（每 5 分钟） | **Debezium CDC** |
|------|---------------------|------------------|
| **数据延迟** | 5-15 分钟 | **<1 秒** |
| **准确性** | 可能重复/遗漏 | **精确捕获** |
| **OLTP 负载** | 定期全表扫描 | **零负载** |
| **DELETE 支持** | 无法捕获硬删除 | **完整支持** |
| **实时性** | 批量延迟 | **流式实时** |

---

## 实施方案

### Phase 1: ClickHouse 表结构设计

#### 1. 原始数据表

```sql
-- 订单表（从 Kafka 实时写入）
CREATE TABLE orders (
    id UUID,
    merchant_id UUID,
    order_number String,
    customer_email String,
    customer_name String,

    status String,

    subtotal Decimal(10, 2),
    shipping_fee Decimal(10, 2),
    tax_amount Decimal(10, 2),
    amount_total Decimal(10, 2),
    currency String,

    created_at DateTime,
    updated_at DateTime,
    shipped_at Nullable(DateTime),
    delivered_at Nullable(DateTime),

    -- 元数据（用于调试和监控）
    _kafka_offset Int64,
    _kafka_partition Int16,
    _kafka_timestamp DateTime
)
ENGINE = ReplacingMergeTree(updated_at)  -- 自动去重，保留最新版本
PARTITION BY toYYYYMM(created_at)        -- 按月分区
ORDER BY (merchant_id, created_at, id);  -- 排序键

-- 订单明细表
CREATE TABLE order_items (
    id UUID,
    order_id UUID,
    product_id UUID,
    merchant_id UUID,  -- 冗余，加速查询
    product_name String,
    sku String,
    quantity Int32,
    price Decimal(10, 2),
    total Decimal(10, 2),

    created_at DateTime,

    _kafka_offset Int64,
    _kafka_partition Int16,
    _kafka_timestamp DateTime
)
ENGINE = ReplacingMergeTree(created_at)
PARTITION BY toYYYYMM(created_at)
ORDER BY (merchant_id, product_id, order_id);

-- 商品表
CREATE TABLE products (
    id UUID,
    merchant_id UUID,
    name String,
    price Decimal(10, 2),
    stock_quantity Int32,
    status String,
    category String,
    created_at DateTime,
    updated_at DateTime,

    _kafka_offset Int64,
    _kafka_partition Int16,
    _kafka_timestamp DateTime
)
ENGINE = ReplacingMergeTree(updated_at)
PARTITION BY toYYYYMM(created_at)
ORDER BY (merchant_id, status, id);
```

**关键设计点**:
- **ReplacingMergeTree**: 自动处理 UPDATE（保留最新版本）
- **按月分区**: 历史数据管理，可按月删除旧数据
- **排序键**: `merchant_id` 在最前，商家查询极快（局部性原理）
- **冗余字段**: `merchant_id` 冗余到 order_items，避免 JOIN

#### 2. 物化视图（自动预聚合）

```sql
-- 每日销售汇总（自动更新）
CREATE MATERIALIZED VIEW daily_sales_mv
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (merchant_id, date)
AS SELECT
    merchant_id,
    toDate(created_at) as date,

    sum(amount_total) as total_revenue,
    count() as order_count,
    avg(amount_total) as avg_order_value,
    uniq(customer_email) as unique_customers,

    now() as _updated_at
FROM orders
WHERE status IN ('paid', 'delivered', 'completed')
GROUP BY merchant_id, date;

-- 每小时销售（实时监控）
CREATE MATERIALIZED VIEW hourly_sales_mv
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMMDD(hour)
ORDER BY (merchant_id, hour)
AS SELECT
    merchant_id,
    toStartOfHour(created_at) as hour,

    sum(amount_total) as total_revenue,
    count() as order_count,

    now() as _updated_at
FROM orders
WHERE status IN ('paid', 'delivered', 'completed')
GROUP BY merchant_id, hour;

-- 商品销售排行
CREATE MATERIALIZED VIEW product_stats_mv
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(week_start)
ORDER BY (merchant_id, product_id, week_start)
AS SELECT
    oi.merchant_id,
    oi.product_id,
    p.name as product_name,
    toMonday(o.created_at) as week_start,

    sum(oi.quantity) as total_quantity,
    sum(oi.total) as total_revenue,
    count(DISTINCT o.id) as order_count,

    now() as _updated_at
FROM order_items oi
JOIN orders o ON oi.order_id = o.id
JOIN products p ON oi.product_id = p.id
WHERE o.status IN ('paid', 'delivered', 'completed')
GROUP BY oi.merchant_id, oi.product_id, p.name, week_start;

-- 客户行为分析
CREATE MATERIALIZED VIEW customer_stats_mv
ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(month)
ORDER BY (merchant_id, customer_email, month)
AS SELECT
    merchant_id,
    customer_email,
    toStartOfMonth(created_at) as month,

    count() as order_count,
    sum(amount_total) as total_spent,
    min(created_at) as first_order_date,
    max(created_at) as last_order_date,

    now() as _updated_at
FROM orders
WHERE status IN ('paid', 'delivered', 'completed')
GROUP BY merchant_id, customer_email, month;

-- 商家总览（平台级）
CREATE MATERIALIZED VIEW merchant_overview_mv
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (date, merchant_id)
AS SELECT
    toDate(created_at) as date,
    merchant_id,

    sum(amount_total) as gmv,
    count() as order_count,
    uniq(customer_email) as customer_count,

    now() as _updated_at
FROM orders
WHERE status IN ('paid', 'delivered', 'completed')
GROUP BY date, merchant_id;
```

**查询示例**:
```sql
-- 商家最近 7 天销售（<50ms）
SELECT
    date,
    total_revenue,
    order_count,
    avg_order_value,
    unique_customers
FROM daily_sales_mv
WHERE merchant_id = 'xxx'
  AND date >= today() - 7
ORDER BY date DESC;

-- 平台 GMV Top 10 商家（<100ms）
SELECT
    merchant_id,
    sum(gmv) as total_gmv,
    sum(order_count) as total_orders
FROM merchant_overview_mv
WHERE date >= today() - 30
GROUP BY merchant_id
ORDER BY total_gmv DESC
LIMIT 10;
```

---

### Phase 2: Debezium + Kafka 配置

#### 2.1 PostgreSQL 配置（启用逻辑复制）

```sql
-- postgresql.conf
wal_level = logical
max_wal_senders = 10
max_replication_slots = 10

-- 创建复制用户
CREATE USER debezium_user WITH REPLICATION PASSWORD 'secure_password';
GRANT SELECT ON ALL TABLES IN SCHEMA public TO debezium_user;
GRANT USAGE ON SCHEMA public TO debezium_user;

-- 创建发布（Logical Replication）
CREATE PUBLICATION dbz_publication FOR ALL TABLES;
```

#### 2.2 Debezium Connector 配置

```json
{
  "name": "commerce-postgres-connector",
  "config": {
    "connector.class": "io.debezium.connector.postgresql.PostgresConnector",
    "database.hostname": "commerce-db",
    "database.port": "5432",
    "database.user": "debezium_user",
    "database.password": "secure_password",
    "database.dbname": "commerce",
    "database.server.name": "commerce",
    "table.include.list": "public.orders,public.order_items,public.products,public.merchants",
    "plugin.name": "pgoutput",
    "publication.name": "dbz_publication",
    "slot.name": "debezium_slot",
    "key.converter": "org.apache.kafka.connect.json.JsonConverter",
    "value.converter": "org.apache.kafka.connect.json.JsonConverter",
    "transforms": "route",
    "transforms.route.type": "org.apache.kafka.connect.transforms.RegexRouter",
    "transforms.route.regex": "commerce.public.(.*)",
    "transforms.route.replacement": "commerce.public.$1"
  }
}
```

#### 2.3 Kafka Topics 配置

```bash
# 创建 Topics（10 分区，3 副本）
kafka-topics --create \
  --topic commerce.public.orders \
  --partitions 10 \
  --replication-factor 3 \
  --config retention.ms=604800000  # 7 天

kafka-topics --create \
  --topic commerce.public.order_items \
  --partitions 10 \
  --replication-factor 3

kafka-topics --create \
  --topic commerce.public.products \
  --partitions 10 \
  --replication-factor 3
```

#### 2.4 ClickHouse Kafka Engine

```sql
-- Kafka 消费表（临时表，用于从 Kafka 读取）
CREATE TABLE orders_kafka (
    id UUID,
    merchant_id UUID,
    order_number String,
    -- ... 其他字段 ...
)
ENGINE = Kafka()
SETTINGS
    kafka_broker_list = 'kafka:9092',
    kafka_topic_list = 'commerce.public.orders',
    kafka_group_name = 'clickhouse_consumer',
    kafka_format = 'JSONEachRow',
    kafka_num_consumers = 5;

-- 物化视图：从 Kafka 表写入目标表
CREATE MATERIALIZED VIEW orders_kafka_mv TO orders AS
SELECT
    after.id::UUID as id,
    after.merchant_id::UUID as merchant_id,
    after.order_number as order_number,
    -- ... 解析 Debezium JSON ...
    _offset as _kafka_offset,
    _partition as _kafka_partition,
    now() as _kafka_timestamp
FROM orders_kafka
WHERE op IN ('c', 'u');  -- c=INSERT, u=UPDATE
```

---

### Phase 3: 缓存架构

```
查询请求
  ↓
L1: 内存缓存 (NodeCache, 1 分钟) ← 极热数据
  ↓ miss
L2: Redis 缓存 (5 分钟) ← 热数据
  ↓ miss
L3: ClickHouse 物化视图 (实时) ← 温数据
  ↓ miss
L4: ClickHouse 原始表 (实时) ← 冷数据
```

**实现**:
```typescript
async getSalesData(merchantId: string, days: number) {
  // L1: 内存缓存
  const l1Key = `sales:${merchantId}:${days}`;
  const l1Data = this.memCache.get(l1Key);
  if (l1Data) return l1Data;

  // L2: Redis 缓存
  const l2Data = await this.redis.get(l1Key);
  if (l2Data) {
    this.memCache.set(l1Key, JSON.parse(l2Data));
    return JSON.parse(l2Data);
  }

  // L3: ClickHouse 物化视图（优先）
  const data = await this.clickhouse.query(`
    SELECT * FROM daily_sales_mv
    WHERE merchant_id = {merchantId: UUID}
      AND date >= today() - {days: UInt8}
  `, { merchantId, days });

  // 写入缓存
  await this.redis.set(l1Key, JSON.stringify(data), 'EX', 300);
  this.memCache.set(l1Key, data);

  return data;
}
```

---

## 性能提升

### 查询性能

| 场景 | PostgreSQL | ClickHouse | 提升 |
|------|-----------|-----------|------|
| 最近 7 天销售 | 2-5 秒 | **10-50ms** | **40-500 倍** |
| 90 天趋势分析 | 5-10 秒 | **20-100ms** | **50-500 倍** |
| 商品 Top 100 | 3-8 秒 | **30-150ms** | **20-270 倍** |
| 客户留存分析 | 10-30 秒 | **100-500ms** | **20-300 倍** |

### 数据同步

- **延迟**: <1 秒（Debezium CDC）
- **吞吐**: 100,000 events/s
- **可靠性**: Kafka 持久化 + 重试

### 存储优化

- **压缩比**: 10:1（列式存储）
- **磁盘节省**: 90%
- **查询 I/O**: 减少 95%（只读需要的列）

---

## 替代方案

### 方案 A: PostgreSQL 预聚合表

**已放弃理由**:
- ❌ 扩展性差（商家数 > 100 后性能下降）
- ❌ 查询灵活性差（固定维度）
- ❌ ETL 复杂度高（需要维护多个聚合表）
- ❌ 数据延迟 1 小时（不满足实时性要求）

### 方案 B: TimescaleDB

**已放弃理由**:
- ⚠️ 仍基于 PostgreSQL，扩展性有限
- ⚠️ 主要优化时序数据，不支持复杂多维分析
- ⚠️ 性能提升有限（10-50 倍 vs ClickHouse 100-1000 倍）

### 方案 C: ClickHouse + 定时同步

**已放弃理由**:
- ❌ 数据延迟 5-15 分钟（不满足实时性）
- ❌ 增加 PostgreSQL 负载（定期全表扫描）
- ❌ 无法精确捕获 DELETE 操作

---

## 影响

### 正面影响

1. **性能提升**:
   - 查询速度: **50-1000 倍**
   - 数据延迟: **<1 秒**
   - OLTP 负载: **零影响**

2. **扩展性**:
   - 支持 **无限商家数**
   - 支持 **任意维度查询**
   - 支持 **水平扩展**（未来多节点）

3. **灵活性**:
   - 物化视图自动更新
   - 支持复杂分析（漏斗、留存、同期群）
   - 支持自定义报表

### 负面影响

1. **架构复杂度**:
   - 新增 3 个组件（ClickHouse, Kafka, Debezium）
   - 运维成本增加

2. **实施时间**:
   - Phase 1: 3-4 周 → **5-7 周** (+2-3 周)

3. **学习成本**:
   - 团队需学习 ClickHouse SQL
   - 需学习 Kafka 运维

### 缓解措施

1. **Docker Compose 一键部署**:
   ```bash
   docker-compose up -d
   # 自动启动 ClickHouse, Kafka, Debezium
   ```

2. **完善的监控**:
   - Kafka 消息积压告警
   - ClickHouse 查询慢日志
   - Debezium 同步延迟监控

3. **详细文档**:
   - ClickHouse 查询优化指南
   - Kafka 运维最佳实践
   - 故障排查手册

---

## 实施检查清单

### 基础设施部署
- [ ] ClickHouse 集群部署（单节点 MVP）
- [ ] ZooKeeper 部署（ClickHouse 协调）
- [ ] Kafka 集群部署（3 节点）
- [ ] Debezium Connect 部署

### 数据库配置
- [ ] PostgreSQL 启用逻辑复制
- [ ] 创建 Debezium 复制用户
- [ ] 创建 ClickHouse 数据库和表
- [ ] 创建物化视图

### 数据同步
- [ ] 配置 Debezium Connector
- [ ] 创建 Kafka Topics
- [ ] 配置 ClickHouse Kafka Engine
- [ ] 测试数据同步（INSERT/UPDATE/DELETE）

### bi-backend 集成
- [ ] 安装 ClickHouse Node.js 客户端
- [ ] 实现查询服务（优先物化视图）
- [ ] 实现多层缓存
- [ ] 实现性能监控

### 测试
- [ ] 数据准确性测试（对比 PostgreSQL）
- [ ] 性能基准测试（目标: P99 < 100ms）
- [ ] 负载测试（1000 并发）
- [ ] 故障恢复测试（Kafka 宕机、ClickHouse 重启）

---

## 相关决策

- [ADR-002: 直接数据库访问](./adr-002-direct-db-access.md) - 本决策是对 ADR-002 的重大升级
- 如果未来数据量达到 PB 级，可考虑 ClickHouse 多节点集群

---

## 参考资料

- [ClickHouse 官方文档](https://clickhouse.com/docs)
- [Debezium PostgreSQL Connector](https://debezium.io/documentation/reference/connectors/postgresql.html)
- [Kafka ClickHouse Integration](https://clickhouse.com/docs/en/engines/table-engines/integrations/kafka)
- [专家评审报告](../expert-review.md) - OLTP/OLAP 混用问题

---

**批准者**: Optima BI Team
**实施负责人**: Backend Team
**预计工作量**: 10-14 天（Phase 1）
**风险等级**: 🟡 中等（新技术栈，但收益巨大）
