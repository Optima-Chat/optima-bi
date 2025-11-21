# Optima BI 开发路线图

> 本文档定义了 optima-bi 的开发阶段、里程碑和交付计划

## ⚠️ 重要更新（基于专家评审）

**专家评审结果**: 6.7/10 - 可行但需要重大改进

**关键问题**: OLTP/OLAP 混用导致性能问题（详见 [专家评审报告](./expert-review.md)）

**必须实施（P0）**:
- 🔴 **ClickHouse OLAP 数据库**（列式存储 + 实时同步）
- 🔴 **Debezium CDC + Kafka**（实时数据捕获 + 消息队列）
- 🔴 **ClickHouse 物化视图**（5+ 预聚合视图）
- 🔴 **多层缓存架构**（L1 内存 + L2 Redis + L3 ClickHouse MV）
- 🔴 **性能测试**（50-1000x 提升验证）

**时间影响**: +2-3 周（ClickHouse + CDC 部署）

---

## 📅 总体时间线（修订版）

| 阶段 | 周期 | 核心目标 | 状态 |
|------|------|---------|------|
| **Phase 0** | 1 周 | 文档和规划 | ✅ 已完成 |
| **Phase 1** | 5-7 周 | MVP + ClickHouse + CDC | 🔜 待开始 |
| **Phase 2** | 2 周 | 平台功能 | ⏳ 计划中 |
| **Phase 3** | 1 周 | 测试和部署 | ⏳ 计划中 |

**总计**: **8-10 周**（原计划 6-7 周，增加 2-3 周 ClickHouse 部署）

---

## ✅ Phase 0: 文档和规划（已完成）

**时间**: 已完成
**目标**: 完善技术方案，研究生态系统，制定架构决策

### 交付物
- ✅ 产品需求文档（PRD）
- ✅ 技术设计文档（Tech Design）
- ✅ 研究总结文档（Research Summary）
- ✅ 架构决策记录（5 个 ADR）
- ✅ README 更新

### 关键成果
- 确定技术栈：TypeScript + Fastify + Prisma
- 确定认证方式：OAuth 2.0 Device Flow
- 确定数据访问：直接连接 PostgreSQL（只读）
- 定义输出格式：JSON 默认 + Pretty 选项
- 明确数据模型：7 张核心表，6 个分析维度

---

## 🎯 Phase 1: MVP + ClickHouse + CDC（5-7 周）

**目标**: 实现商家级基础 BI 分析功能，部署 ClickHouse OLAP + CDC 实时同步，支持 Claude Code 集成

**⚠️ 更新说明**: 根据[专家评审](./expert-review.md)和[ADR-006](./architecture/adr-006-clickhouse-olap.md)，采用 ClickHouse + Debezium CDC + Kafka 架构（50-1000x 性能提升）

### Week 1: 项目基础设施

#### 1.1 项目结构搭建
- [ ] 创建 monorepo 结构（packages/bi-cli, packages/bi-backend）
- [ ] 配置 TypeScript、ESLint、Prettier
- [ ] 配置 package.json 和 tsconfig.json
- [ ] 设置 Git hooks（husky + lint-staged）

#### 1.2 bi-backend 基础框架
- [ ] 初始化 Fastify 应用
- [ ] 配置 Prisma（连接 commerce-backend DB）
- [ ] 生成 Prisma schema（`prisma db pull`）
- [ ] 实现认证中间件（调用 user-auth）
- [ ] 实现权限中间件（requireAdmin）
- [ ] 配置 Redis 客户端
- [ ] 配置环境变量和日志（pino）

**预期输出**:
```bash
# 项目结构
optima-bi/
├── packages/
│   ├── bi-cli/
│   │   ├── src/
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── bi-backend/
│       ├── src/
│       ├── prisma/schema.prisma
│       ├── package.json
│       └── tsconfig.json
├── docker-compose.yml
└── package.json (workspace root)
```

#### 1.3 bi-cli 基础框架
- [ ] 初始化 Commander.js CLI
- [ ] 实现配置管理（conf 加密存储）
- [ ] 实现多环境支持（production/stage/development）
- [ ] 实现 HTTP 客户端（axios + 拦截器）
- [ ] 实现输出格式切换（JSON / Pretty）

**预期输出**:
```bash
bi-cli --help
bi-cli config list
bi-cli config set backend-url https://bi-api.optima.chat
```

### Week 2: 认证和核心 API

#### 2.1 OAuth 认证流程（bi-cli）
- [ ] 实现 Device Flow 认证（`auth login`）
  - [ ] 请求 Device Code
  - [ ] 显示授权 URL 和用户代码
  - [ ] 自动打开浏览器
  - [ ] 轮询获取 Token
  - [ ] 加密存储 Token
- [ ] 实现 Token 自动刷新
- [ ] 实现 `auth logout` 命令
- [ ] 实现 `auth whoami` 命令
- [ ] 实现 `auth switch --env` 命令

**测试验证**:
```bash
bi-cli auth login --env development
bi-cli auth whoami
# 输出: merchant@example.com (merchant)
```

#### 2.2 销售分析 API（商家级）
- [ ] **bi-backend**: 实现 `/api/v1/sales` 端点
  - [ ] 查询 orders 表（按 merchant_id 过滤）
  - [ ] 聚合计算（总销售额、订单数、客单价）
  - [ ] 按日期分组
  - [ ] Redis 缓存（5 分钟 TTL）
- [ ] **bi-cli**: 实现 `sales get` 命令
  - [ ] 支持 `--days` 参数
  - [ ] 支持 `--start` / `--end` 参数
  - [ ] JSON 和 Pretty 输出

**测试验证**:
```bash
bi-cli sales get --days 7
# 输出: JSON 格式的销售数据

bi-cli sales get --days 7 --pretty
# 输出: 彩色表格
```

### Week 3: 扩展分析功能

#### 3.1 客户分析（商家级）
- [ ] **bi-backend**: `/api/v1/customers` 端点
  - [ ] 按 customer_email 聚合订单
  - [ ] 计算新客户、复购客户、流失客户
  - [ ] 计算 LTV、复购率
- [ ] **bi-cli**: `customer get` 命令
  - [ ] 支持 `--segment` 参数（new/repeat/churned/vip）
  - [ ] 支持 `--period` 参数

#### 3.2 库存分析（商家级）
- [ ] **bi-backend**: `/api/v1/inventory` 端点
  - [ ] 查询 products 表
  - [ ] 低库存预警（stock_quantity < threshold）
  - [ ] 库存周转率计算
- [ ] **bi-cli**: `inventory get` 命令
  - [ ] 支持 `--status` 参数（low/out/overstock）

#### 3.3 商品分析（商家级）
- [ ] **bi-backend**: `/api/v1/products/top` 端点
  - [ ] 从 order_items 聚合商品销量
  - [ ] 按销售额/销量排序
- [ ] **bi-cli**: `product top` 命令
  - [ ] 支持 `--sort-by` 参数（revenue/quantity）

### Week 3 交付物

**功能清单**:
- ✅ OAuth 2.0 Device Flow 认证
- ✅ 销售分析（商家级）
- ✅ 客户分析（商家级）
- ✅ 库存分析（商家级）
- ✅ 商品分析（商家级）
- ✅ JSON 和 Pretty 双输出模式

**测试验证**:
```bash
# 认证流程
bi-cli auth login --env development
bi-cli auth whoami

# 数据分析
bi-cli sales get --days 30
bi-cli customer get --segment churned
bi-cli inventory get --status low
bi-cli product top --limit 10

# Pretty 模式
bi-cli sales get --days 7 --pretty
```

---

### Week 3.5-4: ClickHouse + CDC 部署（🔴 P0 - 必须）

> **⚠️ 新增周期**: 根据[专家评审](./expert-review.md)和[ADR-006](./architecture/adr-006-clickhouse-olap.md)，采用 ClickHouse OLAP 架构

**目标**: 解决 OLTP/OLAP 混用问题，实现 50-1000 倍性能提升，<1 秒数据延迟

详细方案：[ADR-006: ClickHouse + CDC](./architecture/adr-006-clickhouse-olap.md) | [性能优化指南](./performance-optimization.md)

#### 4.1 部署 ClickHouse 数据库（2-3 天）

- [ ] **ClickHouse 单节点部署**
  ```yaml
  # docker-compose.yml
  clickhouse:
    image: clickhouse/clickhouse-server:latest
    ports:
      - "8123:8123"  # HTTP API
      - "9000:9000"  # Native protocol
    volumes:
      - ./clickhouse/data:/var/lib/clickhouse
      - ./clickhouse/config.xml:/etc/clickhouse-server/config.xml
  ```
- [ ] **创建 ClickHouse 原始数据表**（4 张核心表）
  - orders 表（ReplacingMergeTree）
  - order_items 表（ReplacingMergeTree）
  - products 表（ReplacingMergeTree）
  - customers 表（ReplacingMergeTree）
  ```sql
  CREATE TABLE orders (
    id UUID,
    merchant_id UUID,
    order_number String,
    customer_email String,
    status String,
    amount_total Decimal(10, 2),
    created_at DateTime,
    updated_at DateTime,
    _kafka_offset Int64,
    _kafka_partition Int16
  )
  ENGINE = ReplacingMergeTree(updated_at)
  PARTITION BY toYYYYMM(created_at)
  ORDER BY (merchant_id, created_at, id);
  ```
- [ ] **创建 Kafka Engine 表**（用于消费 Kafka 消息）
  ```sql
  CREATE TABLE orders_kafka (
    -- 相同字段 --
  )
  ENGINE = Kafka()
  SETTINGS
    kafka_broker_list = 'kafka:9092',
    kafka_topic_list = 'commerce.public.orders',
    kafka_group_name = 'clickhouse_consumer',
    kafka_format = 'JSONEachRow';
  ```

#### 4.2 部署 Kafka + Debezium CDC（3-4 天）

- [ ] **Kafka 集群部署**
  ```yaml
  # docker-compose.yml
  zookeeper:
    image: confluentinc/cp-zookeeper:latest
    environment:
      ZOOKEEPER_CLIENT_PORT: 2181

  kafka:
    image: confluentinc/cp-kafka:latest
    depends_on: [zookeeper]
    ports:
      - "9092:9092"
    environment:
      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka:9092
      KAFKA_NUM_PARTITIONS: 10
      KAFKA_LOG_RETENTION_HOURS: 168  # 7 days
  ```
- [ ] **Debezium Connector 部署**
  ```yaml
  debezium:
    image: debezium/connect:latest
    depends_on: [kafka, postgres]
    ports:
      - "8083:8083"
    environment:
      BOOTSTRAP_SERVERS: kafka:9092
      CONFIG_STORAGE_TOPIC: debezium_configs
      OFFSET_STORAGE_TOPIC: debezium_offsets
  ```
- [ ] **配置 PostgreSQL Logical Replication**
  ```sql
  -- PostgreSQL 配置
  ALTER SYSTEM SET wal_level = 'logical';
  ALTER SYSTEM SET max_replication_slots = 10;

  -- 创建 Publication
  CREATE PUBLICATION dbz_publication FOR TABLE
    orders, order_items, products, customers;

  -- 创建专用用户
  CREATE USER debezium_user WITH REPLICATION LOGIN PASSWORD 'xxx';
  GRANT SELECT ON ALL TABLES IN SCHEMA public TO debezium_user;
  ```
- [ ] **创建 Debezium Connector**
  ```json
  {
    "name": "commerce-postgres-connector",
    "config": {
      "connector.class": "io.debezium.connector.postgresql.PostgresConnector",
      "database.hostname": "commerce-db",
      "database.port": "5432",
      "database.user": "debezium_user",
      "database.password": "xxx",
      "database.dbname": "commerce",
      "database.server.name": "commerce",
      "table.include.list": "public.orders,public.order_items,public.products",
      "plugin.name": "pgoutput",
      "publication.name": "dbz_publication"
    }
  }
  ```
- [ ] **验证 CDC 流程**
  - [ ] 验证 Kafka Topic 创建（commerce.public.orders）
  - [ ] 验证消息格式
  - [ ] 验证 CDC 延迟 < 1 秒

#### 4.3 创建 ClickHouse 物化视图（2-3 天）

- [ ] **daily_sales_mv**（日销售汇总）
  ```sql
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
  ```
- [ ] **hourly_sales_mv**（小时销售汇总）
- [ ] **product_stats_mv**（商品销售统计）
- [ ] **customer_stats_mv**（客户行为统计）
- [ ] **merchant_overview_mv**（商家概览）
- [ ] **验证物化视图数据质量**
  - [ ] 对比原始表数据一致性
  - [ ] 验证实时更新（< 1 秒）
  - [ ] 性能测试（查询时间 < 50ms）

#### 4.4 实现多层缓存架构（1-2 天）

- [ ] **L1 内存缓存**（node-cache，TTL 1 分钟）
  ```typescript
  const memCache = new NodeCache({ stdTTL: 60 });
  const cached = memCache.get(cacheKey);
  if (cached) return cached;
  ```
- [ ] **L2 Redis 缓存**（ioredis，TTL 5 分钟）
  ```typescript
  const cached = await redis.get(cacheKey);
  if (cached) {
    memCache.set(cacheKey, cached);  // 回填 L1
    return JSON.parse(cached);
  }
  ```
- [ ] **L3 ClickHouse 物化视图**（优先查询）
  ```typescript
  const data = await clickhouse.query(`
    SELECT * FROM daily_sales_mv
    WHERE merchant_id = '${merchantId}'
    AND date >= '${startDate}'
  `);
  ```
- [ ] **L4 ClickHouse 原始表**（fallback，实时数据）
  ```typescript
  // 查询今日数据（物化视图可能有延迟）
  const todayData = await clickhouse.query(`
    SELECT * FROM orders WHERE date = today()
  `);
  ```
- [ ] **实现分布式锁**（防止缓存击穿）
  ```typescript
  const lock = await redis.set(lockKey, '1', 'EX', 10, 'NX');
  if (!lock) {
    await sleep(50);  // 等待其他实例填充缓存
    return await getFromCache(key);
  }
  ```

#### 4.5 bi-backend 集成 ClickHouse（2-3 天）

- [ ] **安装 ClickHouse 客户端**
  ```bash
  npm install @clickhouse/client
  ```
- [ ] **创建 ClickHouse 服务层**
  ```typescript
  // src/services/clickhouse.service.ts
  import { createClient } from '@clickhouse/client';

  const clickhouse = createClient({
    host: process.env.CLICKHOUSE_HOST,
    username: process.env.CLICKHOUSE_USER,
    password: process.env.CLICKHOUSE_PASSWORD,
  });

  export async function getDailySales(merchantId: string, days: number) {
    const result = await clickhouse.query({
      query: `
        SELECT * FROM daily_sales_mv
        WHERE merchant_id = {merchantId:UUID}
        AND date >= today() - {days:UInt32}
        ORDER BY date DESC
      `,
      query_params: { merchantId, days },
      format: 'JSONEachRow',
    });
    return result.json();
  }
  ```
- [ ] **重构查询服务**
  - [ ] 优先查询 ClickHouse 物化视图（历史数据）
  - [ ] 查询 ClickHouse 原始表（今日实时数据）
  - [ ] 合并数据返回
- [ ] **实现缓存集成**（L1+L2+L3+L4）
- [ ] **实现性能监控埋点**
  ```typescript
  logger.info({
    type: 'query_metrics',
    duration,
    cacheHit: 'L2_REDIS',
    dataSource: 'CLICKHOUSE_MV',
    rowCount: data.length
  });
  ```

#### 4.6 性能测试和验证（2-3 天）

- [ ] **基准测试**（Apache Bench）
  ```bash
  ab -n 1000 -c 50 \
    -H "Authorization: Bearer <token>" \
    https://bi-api.optima.chat/api/v1/sales?days=7
  ```
  - 目标: Requests/sec > 100, P50 < 100ms, P99 < 500ms
- [ ] **压力测试**（k6）
  ```bash
  k6 run load-test.js
  # 100 并发 → 200 并发 → 500 并发
  ```
- [ ] **数据规模测试**（千万级订单）
  - 导入 1000 万条历史订单到 ClickHouse
  - 验证查询性能（7 天销售 < 50ms）
  - 验证查询性能（90 天趋势 < 100ms）
  - 验证查询性能（商品 Top 10 < 50ms）
- [ ] **CDC 延迟测试**
  - PostgreSQL INSERT → ClickHouse 延迟 < 1 秒
  - PostgreSQL UPDATE → ClickHouse 延迟 < 1 秒
  - 物化视图更新延迟 < 1 秒
- [ ] **生成性能报告**
  - PostgreSQL 直接查询 vs ClickHouse 对比
  - 缓存命中率统计（目标 > 70%）
  - 查询时间分布（P50/P90/P99）
  - 性能提升倍数（50-1000x）

### Week 3.5-4 交付物

**性能架构**:
- ✅ ClickHouse 单节点部署（Docker Compose）
- ✅ Kafka + Zookeeper 集群
- ✅ Debezium CDC 连接器（PostgreSQL → Kafka）
- ✅ ClickHouse 原始数据表（4 张表，ReplacingMergeTree）
- ✅ ClickHouse 物化视图（5 个预聚合视图，SummingMergeTree）
- ✅ 多层缓存架构（L1 内存 + L2 Redis + L3 ClickHouse MV + L4 原始表）
- ✅ bi-backend ClickHouse 客户端集成
- ✅ 分布式锁（防止缓存击穿）

**性能指标**（必须达到）:
- ✅ API 响应时间 P50 < 100ms（vs 原 2-5s，50-500x 提升）
- ✅ API 响应时间 P99 < 500ms（vs 原 5-10s，20-100x 提升）
- ✅ 缓存命中率 > 70%
- ✅ ClickHouse 查询时间 < 50ms（物化视图）
- ✅ CDC 数据延迟 < 1 秒
- ✅ 性能提升 50-1000 倍

**测试验证**:
```bash
# 性能基准测试
ab -n 1000 -c 50 https://bi-api.optima.chat/api/v1/sales?days=7
# 输出: Requests/sec: 120, P50: 80ms, P99: 450ms

# 查看缓存命中
bi-cli sales get --days 7 --debug
# 输出: Cache hit: L2_REDIS, Duration: 45ms, DataSource: CLICKHOUSE_MV

# 查询 ClickHouse 物化视图
clickhouse-client --query "SELECT * FROM daily_sales_mv WHERE merchant_id='xxx' LIMIT 5"

# 验证 CDC 延迟
# (在 PostgreSQL 插入订单，检查 ClickHouse 同步时间)
```

---

## 🚀 Phase 2: 平台功能（2 周）

**目标**: 实现平台级管理员分析功能，完善错误处理和文档

**⚠️ 更新说明**: ClickHouse + CDC 性能架构已前移至 Phase 1（Week 3.5-4），Phase 2 专注于平台级功能扩展

### Week 5: 平台分析功能

#### 5.1 平台概览（管理员）
- [ ] **bi-backend**: `/api/v1/platform/overview` 端点
  - [ ] 计算平台 GMV
  - [ ] 统计活跃商家数量
  - [ ] 统计订单总量
  - [ ] 同比/环比增长率
- [ ] **bi-cli**: `platform overview` 命令
  - [ ] 需要管理员权限验证
  - [ ] 支持 `--month` 参数

#### 5.2 商家分析（管理员）
- [ ] **bi-backend**: `/api/v1/platform/merchants` 端点
  - [ ] 商家分层（活跃/休眠/流失）
  - [ ] 商家 GMV 排行
  - [ ] 商家增长趋势
- [ ] **bi-cli**: `platform merchants` 命令
  - [ ] 支持 `--segment` 参数（active/sleeping/churned/top）

#### 5.3 订阅分析（管理员）
- [ ] **bi-backend**: `/api/v1/platform/subscription` 端点
  - [ ] 计算 MRR（Monthly Recurring Revenue）
  - [ ] 计算 ARR（Annual Recurring Revenue）
  - [ ] 计算流失率（Churn Rate）
  - [ ] 按计划分组（free/pro/enterprise）
- [ ] **bi-cli**: `platform subscription` 命令
  - [ ] 支持 `--plan` 参数
  - [ ] 支持 `--metrics` 参数（mrr,arr,churn）

#### 5.4 财务分析（管理员）
- [ ] **bi-backend**: `/api/v1/platform/revenue` 端点
  - [ ] 平台手续费收入统计
  - [ ] 订阅收入统计
  - [ ] 转账汇总
- [ ] **bi-cli**: `platform revenue` 命令
  - [ ] 支持 `--breakdown` 选项（细分收入来源）

#### 5.5 管理员权限扩展
- [ ] 支持 `--merchant-id` 参数查看指定商家数据
  ```bash
  bi-cli sales get --merchant-id merchant_xxx --days 30
  bi-cli customer get --merchant-id merchant_xxx --segment all
  ```

### Week 6: 完善和文档

#### 6.1 分页和过滤
- [ ] 分页支持
  - [ ] 所有列表接口支持 `--limit` 和 `--page` 参数
- [ ] 过滤和排序
  - [ ] 支持 `--sort-by` 和 `--order` 参数

#### 6.2 错误处理和日志
- [ ] 统一错误响应格式
  ```json
  {
    "success": false,
    "error": {
      "code": "UNAUTHORIZED",
      "message": "Invalid token",
      "details": "Token has expired"
    }
  }
  ```
- [ ] 完善日志记录（pino）
  - [ ] 请求日志（API 端点、耗时）
  - [ ] 错误日志（堆栈跟踪）
  - [ ] 缓存命中日志
- [ ] bi-cli 错误处理
  - [ ] 友好的错误提示
  - [ ] 网络超时重试
  - [ ] Token 过期自动刷新

#### 6.3 文档完善
- [ ] 生成 OpenAPI 文档（@fastify/swagger）
- [ ] 创建 API 参考文档
- [ ] 更新 README 的使用示例
- [ ] 创建故障排查指南

### Phase 2 交付物

**功能清单**:
- ✅ 平台分析（GMV、商家、订阅、财务）
- ✅ 管理员权限控制
- ✅ 跨商家查询（`--merchant-id`）
- ✅ 完善的错误处理和日志
- ✅ OpenAPI 文档
- ✅ 分页和过滤支持

**测试验证**:
```bash
# 平台分析（需要 admin 权限）
bi-cli platform overview --month 2024-01
bi-cli platform merchants --segment top --limit 10
bi-cli platform subscription --metrics mrr,arr,churn
bi-cli platform revenue --breakdown

# 管理员跨商家查询
bi-cli sales get --merchant-id merchant_xxx --days 30
```

---

## 🧪 Phase 3: 测试和部署（1 周）

**目标**: 完整测试，部署到生产环境

### Week 7: 测试和部署

#### 7.1 单元测试
- [ ] bi-backend 单元测试
  - [ ] 认证中间件测试
  - [ ] 销售分析服务测试
  - [ ] 客户分析服务测试
  - [ ] 缓存服务测试（L1+L2 缓存）
  - [ ] ClickHouse 服务测试（Mock）
  - [ ] 多层缓存集成测试
- [ ] bi-cli 单元测试
  - [ ] 配置管理测试
  - [ ] 命令解析测试
  - [ ] HTTP 客户端测试
- [ ] 测试覆盖率 > 70%

#### 7.2 集成测试
- [ ] bi-cli → bi-backend 集成测试
- [ ] bi-backend → user-auth 集成测试
- [ ] bi-backend → ClickHouse 集成测试
- [ ] PostgreSQL → Debezium → Kafka → ClickHouse CDC 流程测试
  - [ ] 插入订单 → ClickHouse 同步（< 1 秒）
  - [ ] 更新订单 → ClickHouse 同步（< 1 秒）
  - [ ] 物化视图自动更新
- [ ] 多层缓存集成测试（L1+L2+L3+L4）
- [ ] 端到端流程测试
  - [ ] 登录 → 查询销售 → 输出结果
  - [ ] Token 刷新流程
  - [ ] 多环境切换
  - [ ] 缓存命中和失效测试
  - [ ] ClickHouse 查询性能验证

#### 7.3 性能验收测试
- [ ] 验证性能指标（ClickHouse 架构）
  - [ ] API 响应时间 P50 < 100ms ✅（vs 原 2-5s）
  - [ ] API 响应时间 P99 < 500ms ✅（vs 原 5-10s）
  - [ ] 缓存命中率 > 70% ✅
  - [ ] ClickHouse 查询时间 < 50ms ✅（物化视图）
  - [ ] CDC 数据延迟 < 1 秒 ✅
  - [ ] 性能提升 50-1000 倍 ✅
- [ ] 生成性能测试报告
  - [ ] PostgreSQL 直接查询 vs ClickHouse 对比表
  - [ ] 缓存命中率分析
  - [ ] CDC 延迟监控
- [ ] 优化前后对比分析

#### 7.4 部署准备
- [ ] Docker 镜像构建
  - [ ] bi-backend Dockerfile
  - [ ] Docker Compose 配置（完整栈）
    - bi-backend
    - ClickHouse
    - Kafka + Zookeeper
    - Debezium Connect
    - Redis
- [ ] 环境变量配置
  - [ ] Production 环境配置
  - [ ] Stage 环境配置
  - [ ] Development 环境配置
- [ ] PostgreSQL 准备
  - [ ] 创建只读数据库用户（bi_readonly）
  - [ ] 创建 Debezium 专用用户（debezium_user + REPLICATION）
  - [ ] 配置 Logical Replication（wal_level = logical）
  - [ ] 创建 Publication（dbz_publication）
  - [ ] 验证数据库连接权限
- [ ] ClickHouse 部署
  - [ ] ClickHouse 配置（单节点）
  - [ ] 创建数据库和表
  - [ ] 创建物化视图
  - [ ] 配置访问控制
- [ ] Kafka 部署
  - [ ] Kafka + Zookeeper 配置
  - [ ] Topic 分区和副本配置
  - [ ] 数据保留策略（7 天）
- [ ] Debezium 部署
  - [ ] Debezium Connect 配置
  - [ ] PostgreSQL Connector 配置
  - [ ] 验证 CDC 流程
- [ ] Redis 部署
  - [ ] Redis 配置
  - [ ] 持久化配置（AOF + RDB）

#### 6.4 部署和验证
- [ ] 部署到 Stage 环境
  - [ ] bi-backend 部署
  - [ ] ClickHouse 部署（单节点）
  - [ ] Kafka + Zookeeper 部署
  - [ ] Debezium Connect 部署
  - [ ] Redis 部署
  - [ ] 验证 API 可访问
  - [ ] 验证认证流程
  - [ ] 验证 CDC 流程（PostgreSQL → ClickHouse）
  - [ ] 验证缓存命中
- [ ] 发布 bi-cli 到 npm（beta 版本）
  ```bash
  npm publish --tag beta @optima-chat/bi-cli
  ```
- [ ] 端到端测试（Stage 环境）
  - [ ] 查询性能验证（< 100ms）
  - [ ] CDC 延迟验证（< 1 秒）
- [ ] 部署到 Production 环境
- [ ] 发布 bi-cli 到 npm（正式版本）

#### 6.5 监控和运维
- [ ] 配置监控告警
  - [ ] API 响应时间监控（< 100ms）
  - [ ] 错误率监控（< 1%）
  - [ ] 缓存命中率监控（> 70%）
  - [ ] ClickHouse 查询时间监控（< 50ms）
  - [ ] CDC 延迟监控（< 1 秒）
  - [ ] Kafka 消费延迟监控
  - [ ] ClickHouse 磁盘使用率
- [ ] 日志聚合和分析
  - [ ] bi-backend 日志（Pino）
  - [ ] ClickHouse 查询日志
  - [ ] Debezium CDC 日志
  - [ ] Kafka 日志
- [ ] 性能监控仪表盘
  - [ ] Grafana + Prometheus 集成
  - [ ] ClickHouse 性能面板
  - [ ] CDC 延迟面板
  - [ ] 缓存命中率面板

### Phase 3 交付物

**质量指标**:
- ✅ 单元测试覆盖率 > 70%
- ✅ 集成测试通过（包括 CDC 流程）
- ✅ API 响应时间 P50 < 100ms, P99 < 500ms
- ✅ ClickHouse 查询时间 < 50ms
- ✅ CDC 延迟 < 1 秒
- ✅ 缓存命中率 > 70%
- ✅ 错误率 < 1%

**部署产物**:
- ✅ bi-backend Docker 镜像
- ✅ ClickHouse Docker 镜像（配置）
- ✅ Kafka + Zookeeper Docker 镜像（配置）
- ✅ Debezium Connect Docker 镜像（配置）
- ✅ Docker Compose 完整栈配置
- ✅ bi-cli npm 包（@optima-chat/bi-cli）
- ✅ 部署文档和运维手册（包括 ClickHouse 运维）
- ✅ 监控仪表盘（Grafana + Prometheus）

---

## 🎯 里程碑和验收标准

### Milestone 1: MVP 完成（Week 3 结束）

**验收标准**:
1. ✅ 商家可以通过 `bi-cli auth login` 完成认证
2. ✅ 商家可以查询销售数据（`bi-cli sales get --days 7`）
3. ✅ 商家可以查询客户数据（`bi-cli customer get --segment churned`）
4. ✅ 商家可以查询库存数据（`bi-cli inventory get --status low`）
5. ✅ 支持 JSON 和 Pretty 两种输出模式
6. ✅ Claude Code 可以调用 bi-cli 并解析 JSON 输出

**演示场景**:
```
商家: "帮我分析最近 7 天的销售情况"
Claude Code: [调用 bi-cli sales get --days 7]
Claude Code: "最近 7 天销售额 12.5 万美元，同比增长 6%。
             订单量 342 单，客单价 367 美元。
             周末销量较高，建议增加库存备货。"
```

### Milestone 2: ClickHouse + CDC 完成（Week 4 结束）

**验收标准**:
1. ✅ ClickHouse 单节点部署完成
2. ✅ Kafka + Debezium CDC 流程打通
3. ✅ ClickHouse 原始表和物化视图创建完成
4. ✅ bi-backend 集成 ClickHouse 查询
5. ✅ API 响应时间 P50 < 100ms, P99 < 500ms
6. ✅ CDC 延迟 < 1 秒
7. ✅ 缓存命中率 > 70%
8. ✅ 性能提升 50-1000 倍验证通过

### Milestone 3: 平台功能完成（Week 6 结束）

**验收标准**:
1. ✅ 管理员可以查询平台 GMV（`bi-cli platform overview`）
2. ✅ 管理员可以分析商家活跃度（`bi-cli platform merchants --segment active`）
3. ✅ 管理员可以查询订阅 MRR（`bi-cli platform subscription --metrics mrr`）
4. ✅ 管理员可以查看指定商家数据（`--merchant-id` 参数）
5. ✅ OpenAPI 文档完成
6. ✅ 错误处理和日志完善

### Milestone 4: 生产部署（Week 7 结束）

**验收标准**:
1. ✅ 完整栈部署到 Production 环境（bi-backend + ClickHouse + Kafka + Debezium）
2. ✅ bi-cli 发布到 npm（@optima-chat/bi-cli@1.0.0）
3. ✅ Stage 环境端到端测试通过（包括 CDC 流程）
4. ✅ Production 环境端到端测试通过
5. ✅ 性能验收测试通过（50-1000x 提升）
6. ✅ 监控和告警配置完成（Grafana + Prometheus）
7. ✅ 文档更新完成（API 参考、部署文档、ClickHouse 运维、故障排查）

---

## 🎨 Phase 4: Web Dashboard（可选 - 3-4 周）

> **说明**: 基于 [ADR-007: Web 可视化界面](./architecture/adr-007-web-dashboard.md)，Web Dashboard 为可选功能，可在 CLI 版本稳定后再启动。

**目标**: 提供 Web 可视化界面，降低使用门槛，支持移动端访问

### Week 8-9: Web Dashboard MVP

#### 8.1 项目搭建（2-3 天）
- [ ] 初始化 Next.js 14 项目（App Router）
  ```bash
  npx create-next-app@latest bi-web --typescript --tailwind --app
  cd bi-web
  ```
- [ ] 安装 shadcn/ui 组件库
  ```bash
  npx shadcn-ui@latest init
  npx shadcn-ui@latest add button card input
  ```
- [ ] 配置 NextAuth.js OAuth 认证
- [ ] 配置 React Query 数据管理
- [ ] 创建布局框架（侧边栏 + 主内容区）

#### 8.2 OAuth 认证集成（2 天）
- [ ] NextAuth.js 配置（OAuth 2.0 Web Flow）
- [ ] 登录页面（/login）
- [ ] Session 管理
- [ ] Token 自动刷新
- [ ] 权限控制（商家 vs 管理员）

#### 8.3 首页概览（3-4 天）
- [ ] 关键指标卡片（GMV、订单数、新客户、转化率）
  - 使用 shadcn/ui Card 组件
  - 支持时间范围切换（今日/本周/本月）
  - 同比/环比显示
- [ ] 销售趋势图（7/30/90 天）
  - 使用 Recharts 折线图
  - 支持时间范围切换
  - Tooltip 交互
- [ ] Top 10 商品列表
  - 使用 shadcn/ui Table 组件
  - 支持排序（按销售额/销量）
  - 点击商品查看详情

#### 8.4 响应式布局（1-2 天）
- [ ] 桌面端布局（三栏：侧边栏 + 主内容 + 详情面板）
- [ ] 平板端布局（两栏：侧边栏可折叠）
- [ ] 移动端布局（单栏 + 底部导航）
- [ ] 深色模式支持（next-themes）

### Week 10: 增强功能

#### 10.1 销售分析页面（2-3 天）
- [ ] /dashboard/sales 路由
- [ ] 时间维度切换（日/周/月/季/年）
- [ ] 同比/环比分析
- [ ] 销售漏斗图（Recharts Funnel）
- [ ] 按商品类别分析（饼图）
- [ ] 数据导出（CSV/Excel）

#### 10.2 客户分析页面（2 天）
- [ ] /dashboard/customers 路由
- [ ] 客户分层（新客/活跃/沉睡/流失）
- [ ] RFM 模型可视化
- [ ] 复购率分析
- [ ] 客户留存曲线
- [ ] 流失预警列表

#### 10.3 库存管理页面（1-2 天）
- [ ] /dashboard/inventory 路由
- [ ] 低库存预警（红色高亮）
- [ ] 库存周转率
- [ ] 滞销商品列表
- [ ] 补货建议

#### 10.4 平台管理员仪表盘（2 天）
- [ ] /admin/dashboard 路由（管理员专用）
- [ ] 平台 GMV 实时大屏
- [ ] 活跃商家数趋势
- [ ] Top 商家排行榜
- [ ] 订阅收入分析（MRR/ARR）
- [ ] 系统健康监控（ClickHouse 性能、CDC 延迟）

### Week 10 交付物

**功能清单**:
- ✅ OAuth 2.0 Web 认证
- ✅ 首页概览（关键指标 + 趋势图 + Top 10）
- ✅ 销售分析页面
- ✅ 客户分析页面
- ✅ 库存管理页面
- ✅ 平台管理员仪表盘
- ✅ 响应式布局（桌面 + 平板 + 移动）
- ✅ 深色模式
- ✅ 数据导出（CSV/Excel）
- ✅ Vercel 生产环境部署

**性能指标**:
- ✅ FCP < 1.5s
- ✅ LCP < 2.5s
- ✅ TTI < 3s
- ✅ Lighthouse Score > 90

**测试验证**:
```bash
# 本地开发
cd packages/bi-web
npm run dev
# 访问 http://localhost:3000

# 部署到 Vercel（自动）
git push origin main
# 自动部署到 https://bi.optima.chat

# 或手动部署
vercel --prod
```

---

### Milestone 5: Web Dashboard MVP 完成（Week 10 结束）

**验收标准**:
1. ✅ 商家可以通过 Web 界面登录（OAuth 2.0）
2. ✅ 商家可以查看销售趋势图（可视化）
3. ✅ 商家可以查看 Top 10 商品列表
4. ✅ 商家可以导出 CSV 报表
5. ✅ 移动端访问体验良好
6. ✅ Lighthouse Score > 90
7. ✅ bi-web 部署到 Vercel Production

**演示场景**:
```
商家打开 https://bi.optima.chat
  ↓ 登录（OAuth 2.0）
首页仪表盘
  - 今日 GMV: ¥125,000（↑ 6% vs 昨日）
  - 今日订单数: 342 单
  - 今日新客户: 58 人
  - [折线图] 最近 7 天销售趋势
  - [表格] Top 10 商品
  ↓ 点击"销售分析"
销售分析页面
  - [柱状图] 每日销售对比
  - [饼图] 按类别销售占比
  - [导出 CSV] 下载销售报表
```

---

## 📊 工作量估算

| 阶段 | 开发 | 测试 | 文档 | 总计 |
|------|-----|------|------|------|
| Phase 0 | - | - | 40h | 40h |
| Phase 1 (基础 MVP) | 80h | 10h | 10h | 100h |
| Phase 1 (ClickHouse + CDC) | 80h | 20h | 10h | 110h |
| Phase 2 | 60h | 15h | 5h | 80h |
| Phase 3 | 20h | 25h | 15h | 60h |
| **Phase 4 (Web Dashboard)** | **80h** | **15h** | **10h** | **105h** |
| **总计（含 Web）** | **320h** | **85h** | **90h** | **495h** |
| **总计（不含 Web）** | **240h** | **70h** | **80h** | **390h** |

**假设**:
- 1 人全职开发
- 每周工作 40 小时
- **不含 Web Dashboard**: 约 **8-10 周**（CLI + ClickHouse + CDC）
- **含 Web Dashboard**: 约 **11-13 周**（CLI + ClickHouse + CDC + Web）

**ClickHouse 额外工作量**:
- ClickHouse 部署和配置: 20h
- Kafka + Debezium 部署: 30h
- 物化视图设计: 15h
- bi-backend 集成: 15h
- CDC 流程测试: 15h
- 性能测试和验证: 15h
- **总计**: 110h（约 2.5-3 周）

**Web Dashboard 额外工作量**（可选）:
- Next.js 项目搭建 + shadcn/ui: 15h
- OAuth 认证集成（NextAuth.js）: 10h
- 首页概览（指标卡片 + 趋势图）: 20h
- 销售/客户/库存分析页面: 25h
- 平台管理员仪表盘: 10h
- 响应式布局 + 深色模式: 10h
- 性能优化 + 测试: 15h
- **总计**: 105h（约 2.5-3 周）

---

## 🚧 风险和缓解措施

### 技术风险

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| commerce-backend DB 架构变更 | 高 | 中 | 使用 Debezium CDC 自动捕获变更，ClickHouse 表定期同步 schema |
| user-auth API 变更 | 高 | 低 | 编写适配层，隔离外部依赖 |
| ClickHouse 性能不达标 | 中 | 低 | 提前性能测试，优化物化视图查询，增加分区和索引 |
| CDC 延迟过高（> 1 秒） | 中 | 中 | 优化 Kafka 分区数（10 分区），监控 Debezium 性能 |
| PostgreSQL Logical Replication 权限不足 | 高 | 中 | 提前与 DBA 确认权限（REPLICATION + SELECT），创建专用用户 |
| Kafka 消息堆积 | 中 | 中 | 配置 Kafka 保留策略（7 天），监控消费延迟 |
| ClickHouse 存储空间不足 | 中 | 低 | 配置数据保留策略（90 天），定期归档历史数据 |

### 进度风险

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| 需求变更 | 中 | 中 | 敏捷迭代，优先 MVP 功能 |
| ClickHouse + CDC 部署复杂度高 | 高 | 中 | 提前技术调研，使用 Docker Compose 简化部署，预留 2-3 周缓冲 |
| Debezium CDC 调试困难 | 中 | 中 | 阅读官方文档，参考社区案例，监控日志排查 |
| 集成测试困难 | 低 | 低 | 使用 Docker Compose 模拟完整环境（含 ClickHouse + Kafka + Debezium） |

---

## 📝 下一步行动

### 立即开始（本周）

1. **确认开发计划**
   - [ ] Review 本路线图
   - [ ] 评估时间和资源
   - [ ] 确认优先级

2. **搭建项目基础设施**
   - [ ] 创建 monorepo 结构
   - [ ] 配置 TypeScript、ESLint、Prettier
   - [ ] 初始化 bi-backend（Fastify + Prisma）
   - [ ] 初始化 bi-cli（Commander.js）

3. **连接 commerce-backend 数据库**
   - [ ] 获取只读数据库连接信息
   - [ ] 使用 Prisma 生成 schema
   - [ ] 验证数据库连接

**本周目标**: 完成 Phase 1 Week 1 的所有任务

---

## 🎯 成功标准

**MVP 成功标准**:
1. 商家可以通过自然语言（Claude Code）查询销售数据
2. 输出格式友好，AI 可解析
3. 认证安全可靠（OAuth 2.0）
4. 性能满足需求（< 2s 响应）

**最终成功标准**:
1. 商家和管理员日活使用
2. Claude Code 集成顺畅
3. 系统稳定运行（99.9% 可用性）
4. 用户满意度高（NPS > 8）

---

**路线图版本**: v1.0
**创建日期**: 2025-01-21
**维护者**: Optima BI Team
