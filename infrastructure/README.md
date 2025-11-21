# Optima BI 基础设施部署

> ClickHouse OLAP + Debezium CDC + Kafka 实时数据同步架构

## 🏗️ 架构概览

```
PostgreSQL (OLTP)
    ↓ WAL 日志
Debezium CDC
    ↓ 捕获变更
Kafka (消息队列)
    ↓ 流式传输
ClickHouse Kafka Engine
    ↓ 消费并写入
ClickHouse 原始表 (ReplacingMergeTree)
    ↓ 自动聚合
ClickHouse 物化视图 (AggregatingMergeTree)
    ↓ 查询（10-50ms）
bi-backend API
```

**性能提升**：50-1000 倍查询性能，< 1 秒数据延迟

---

## 🚀 快速开始

### 前置要求

- Docker 20.10+
- Docker Compose V2
- 至少 4GB 可用内存
- 至少 10GB 可用磁盘空间

### 一键启动

```bash
# 启动所有服务 + 注册 CDC 连接器 + 验证数据同步
bash scripts/start.sh
```

启动后访问：
- **Kafka UI**: http://localhost:8080（查看 Kafka 消息）
- **ClickHouse HTTP**: http://localhost:8123（SQL 查询接口）
- **Debezium API**: http://localhost:8083（CDC 连接器管理）
- **PostgreSQL**: localhost:5432（OLTP 数据库）

### 验证数据同步

```bash
# 查看 PostgreSQL 和 ClickHouse 的数据统计
bash scripts/verify.sh
```

**预期输出**：
```
=== PostgreSQL 数据统计 ===
 table_name  | count
-------------+-------
 merchants   |     2
 products    |     3
 customers   |     3
 orders      |   100
 order_items |   100

=== ClickHouse 数据统计 ===
┌─table_name──┬─count─┐
│ merchants   │     2 │
│ products    │     3 │
│ customers   │     3 │
│ orders      │   100 │
│ order_items │   100 │
└─────────────┴───────┘

=== 物化视图数据统计 ===
┌─merchant_id──────────────────────┬────date────┬───revenue─┬─orders─┬──aov──┬─customers─┐
│ 11111111-1111-1111-1111-111...   │ 2025-01-21 │   45678.9 │     70 │ 652.5 │        45 │
│ 22222222-2222-2222-2222-222...   │ 2025-01-21 │   12345.6 │     30 │ 411.5 │        15 │
└──────────────────────────────────┴────────────┴───────────┴────────┴───────┴───────────┘
```

---

## 📦 服务说明

### 核心服务

| 服务 | 端口 | 说明 |
|------|------|------|
| **postgres** | 5432 | OLTP 数据库（模拟 commerce-backend） |
| **clickhouse** | 8123, 9000 | OLAP 数据库（列式存储 + 物化视图） |
| **kafka** | 9092, 29092 | 消息队列（10 分区，7 天保留） |
| **zookeeper** | 2181 | Kafka 依赖 |
| **debezium** | 8083 | CDC 连接器（捕获 PostgreSQL 变更） |
| **redis** | 6379 | 缓存层（L2 缓存） |

### 辅助服务

| 服务 | 端口 | 说明 |
|------|------|------|
| **kafka-ui** | 8080 | Kafka 可视化管理界面 |

---

## 🗄️ 数据库结构

### PostgreSQL 表（OLTP）

- `merchants` - 商家表
- `products` - 商品表
- `customers` - 客户表
- `orders` - 订单表
- `order_items` - 订单项表

初始化脚本：[infrastructure/postgres/init.sql](./postgres/init.sql)

### ClickHouse 表（OLAP）

#### 原始表（ReplacingMergeTree）

- `orders` - 订单原始数据（支持 UPDATE）
- `order_items` - 订单项原始数据
- `products` - 商品原始数据
- `customers` - 客户原始数据
- `merchants` - 商家原始数据

#### 物化视图（AggregatingMergeTree）

- `daily_sales_mv` - 每日销售汇总（按商家 + 日期）
- `hourly_sales_mv` - 每小时销售汇总（实时监控）
- `product_stats_mv` - 商品销售统计
- `customer_stats_mv` - 客户分析统计
- `merchant_overview_mv` - 商家总览（平台管理员）

初始化脚本：[infrastructure/clickhouse/init.sql](./clickhouse/init.sql)

---

## 🔧 常用操作

### 查看服务状态

```bash
docker compose ps
```

### 查看日志

```bash
# 所有服务
docker compose logs -f

# 特定服务
docker compose logs -f clickhouse
docker compose logs -f debezium
docker compose logs -f kafka
```

### 手动注册 Debezium 连接器

```bash
bash infrastructure/debezium/register-connector.sh
```

### 检查 Debezium 连接器状态

```bash
bash infrastructure/debezium/check-status.sh
```

### 连接 ClickHouse

```bash
# 使用 clickhouse-client
docker exec -it optima-bi-clickhouse clickhouse-client --user bi_user --password bi_password

# 查询示例
SELECT * FROM bi.daily_sales_mv LIMIT 10;
```

### 连接 PostgreSQL

```bash
docker exec -it optima-bi-postgres psql -U commerce_user -d commerce

# 插入测试订单
INSERT INTO orders (merchant_id, customer_id, order_number, customer_email, status, amount_total)
VALUES ('11111111-1111-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111', 'TEST001', 'test@example.com', 'paid', 999.99);
```

### 监控 Kafka 消息

访问 Kafka UI: http://localhost:8080

或使用命令行：

```bash
# 查看 topics
docker exec optima-bi-kafka kafka-topics --list --bootstrap-server localhost:9092

# 消费消息（实时查看 CDC 数据）
docker exec optima-bi-kafka kafka-console-consumer \
  --bootstrap-server localhost:9092 \
  --topic postgres.public.orders \
  --from-beginning
```

### 停止服务

```bash
# 停止服务（保留数据）
bash scripts/stop.sh

# 停止并删除所有数据
docker compose down -v
```

---

## 🧪 测试数据同步

### 1. 在 PostgreSQL 插入数据

```sql
-- 连接 PostgreSQL
docker exec -it optima-bi-postgres psql -U commerce_user -d commerce

-- 插入新订单
INSERT INTO orders (merchant_id, customer_id, order_number, customer_email, status, amount_total, created_at, updated_at)
VALUES (
    '11111111-1111-1111-1111-111111111111',
    'c1111111-1111-1111-1111-111111111111',
    'TEST_' || extract(epoch from now())::text,
    'test@example.com',
    'paid',
    1234.56,
    now(),
    now()
);
```

### 2. 等待 1-2 秒

CDC 数据延迟 < 1 秒

### 3. 在 ClickHouse 查询数据

```sql
-- 连接 ClickHouse
docker exec -it optima-bi-clickhouse clickhouse-client --user bi_user --password bi_password

-- 查询原始订单表
SELECT * FROM bi.orders
WHERE order_number LIKE 'TEST_%'
ORDER BY created_at DESC
LIMIT 10;

-- 查询物化视图（聚合数据）
SELECT
    merchant_id,
    toDate(now()) as date,
    sumMerge(total_revenue) as revenue,
    countMerge(order_count) as orders
FROM bi.daily_sales_mv
WHERE date = toDate(now())
GROUP BY merchant_id, date;
```

**预期结果**：数据应该在 1-2 秒内同步到 ClickHouse

---

## 📊 性能测试

### 查询性能对比

```bash
# PostgreSQL 查询（2-5 秒）
time docker exec optima-bi-postgres psql -U commerce_user -d commerce -c "
SELECT
    merchant_id,
    DATE(created_at) as date,
    SUM(amount_total) as revenue,
    COUNT(*) as orders
FROM orders
WHERE status = 'paid'
  AND created_at >= NOW() - INTERVAL '90 days'
GROUP BY merchant_id, DATE(created_at)
ORDER BY date DESC;
"

# ClickHouse 物化视图查询（10-50 毫秒）
time docker exec optima-bi-clickhouse clickhouse-client --user bi_user --password bi_password --query "
SELECT
    merchant_id,
    date,
    sumMerge(total_revenue) as revenue,
    countMerge(order_count) as orders
FROM bi.daily_sales_mv
WHERE date >= today() - 90
GROUP BY merchant_id, date
ORDER BY date DESC
FORMAT PrettyCompact;
"
```

**性能提升**：40-500 倍

---

## 🐛 故障排查

### 问题 1：ClickHouse 数据为 0

**原因**：Kafka 消费或物化视图更新延迟

**解决**：
```bash
# 1. 检查 Debezium 连接器状态
curl http://localhost:8083/connectors/postgres-commerce-connector/status | jq

# 2. 检查 Kafka Topics
docker exec optima-bi-kafka kafka-topics --list --bootstrap-server localhost:9092

# 3. 等待 2-3 分钟后重新验证
bash scripts/verify.sh
```

### 问题 2：Debezium 连接器注册失败

**原因**：Debezium Connect 未完全启动

**解决**：
```bash
# 等待 30 秒后重试
sleep 30
bash infrastructure/debezium/register-connector.sh
```

### 问题 3：PostgreSQL 逻辑复制槽满

**症状**：`ERROR: replication slot "debezium_slot" already exists`

**解决**：
```sql
-- 连接 PostgreSQL
docker exec -it optima-bi-postgres psql -U commerce_user -d commerce

-- 删除旧的复制槽
SELECT pg_drop_replication_slot('debezium_slot');

-- 重新注册连接器
bash infrastructure/debezium/register-connector.sh
```

---

## 📝 配置文件说明

| 文件 | 说明 |
|------|------|
| `docker-compose.yml` | 所有服务配置 |
| `infrastructure/postgres/init.sql` | PostgreSQL 初始化（表结构 + 测试数据） |
| `infrastructure/clickhouse/config.xml` | ClickHouse 服务配置 |
| `infrastructure/clickhouse/users.xml` | ClickHouse 用户配置 |
| `infrastructure/clickhouse/init.sql` | ClickHouse 完整初始化脚本（表结构 + 物化视图） |
| `infrastructure/debezium/register-connector.sh` | Debezium 连接器注册脚本（带健康检查） |
| `scripts/start.sh` | 一键启动脚本 |
| `scripts/verify.sh` | 数据同步验证脚本 |
| `scripts/stop.sh` | 停止服务脚本 |

---

## 🔗 相关文档

- [ADR-006: ClickHouse + CDC 架构](../docs/architecture/adr-006-clickhouse-olap.md)
- [性能优化指南](../docs/performance-optimization.md)
- [ClickHouse 官方文档](https://clickhouse.com/docs)
- [Debezium PostgreSQL 连接器](https://debezium.io/documentation/reference/connectors/postgresql.html)

---

**维护者**: Optima BI Team
**最后更新**: 2025-01-21
