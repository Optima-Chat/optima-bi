# Optima BI - 技术设计文档

## 1. 系统架构

### 1.1 整体架构图

```mermaid
graph TB
    subgraph "交互层 - AI 分析层"
        A[商家用户] -->|自然语言对话| B[Claude Code]
        B -->|AI 数据分析| B1[智能洞察生成]
        B -->|经营建议| B2[决策支持]
    end

    subgraph "CLI 层 - 数据获取层"
        B -->|执行命令| C[bi-cli<br/>Python CLI]
        C -->|sales get| C1[销售数据]
        C -->|customer get| C2[客户数据]
        C -->|inventory get| C3[库存数据]
        C -->|finance get| C4[财务数据]
        C -->|logistics get| C5[物流数据]
        C -->|product get| C6[商品数据]
    end

    subgraph "后端服务层 - 数据查询层"
        C -->|HTTP/REST| D[bi-backend<br/>FastAPI]
        D1[OAuth 认证] --> D
        D2[查询服务] --> D
        D3[聚合计算] --> D
        D4[缓存服务] --> D
    end

    subgraph "数据源层"
        D -->|只读 SQL 查询| E[commerce-backend<br/>PostgreSQL]
        E -->|复用模型| E1[Order/OrderItem]
        E -->|复用模型| E2[Product/Variant]
        E -->|复用模型| E3[Merchant]
        E -->|复用模型| E4[MerchantTransfer]
        E -->|复用模型| E5[Review/Subscription]
    end

    subgraph "认证层"
        D -->|验证 Token| F[user-auth<br/>OAuth 2.0]
    end

    subgraph "缓存层"
        D -.->|查询缓存| G[Redis 7+]
    end

    style B fill:#f9f,stroke:#333,stroke-width:3px
    style C fill:#bbf,stroke:#333,stroke-width:2px
    style D fill:#bfb,stroke:#333,stroke-width:2px
    style E fill:#fbb,stroke:#333,stroke-width:2px
    style F fill:#ffd,stroke:#333,stroke-width:2px
```

### 1.2 设计原则

**职责分离**：
- **Claude Code**：负责 AI 分析、洞察生成、建议输出
- **bi-cli**：负责数据获取、结构化输出（Python CLI）
- **bi-backend**：负责数据查询、聚合计算、缓存（FastAPI）
- **commerce-backend DB**：数据源（只读访问）

**数据流向**：
```
commerce DB → bi-backend → bi-cli → Claude Code → 商家
 (SQL查询)   (聚合计算)   (JSON输出)  (AI分析)    (自然语言)
```

**关键设计决策**：
1. **技术栈统一**：bi-backend 使用 Python + FastAPI，与 commerce-backend 保持一致
2. **直接数据库访问**：bi-backend 直接连接 commerce-backend PostgreSQL（只读），避免 API 调用开销
3. **模型复用**：直接复用 commerce-backend 的 SQLAlchemy 模型定义
4. **无需数据同步**：实时查询源数据库，无需维护聚合表
5. **OAuth 统一**：使用 user-auth 服务进行统一认证
6. **缓存优化**：使用 Redis 缓存查询结果，减少数据库负载

## 2. bi-cli 设计

### 2.1 技术栈
- **语言**：Python 3.11+
- **CLI 框架**：Click 或 Typer（现代化 Python CLI）
- **HTTP 客户端**：httpx（异步支持）
- **数据验证**：Pydantic v2（与 FastAPI 一致）
- **配置管理**：pydantic-settings
- **测试**：pytest

### 2.2 命令设计

#### 2.2.1 全局配置
```bash
# 认证
bi-cli auth login --api-key <key>

# 配置 backend 地址
bi-cli config set backend-url https://bi-api.optima.com

# 查看配置
bi-cli config list
```

#### 2.2.2 销售数据
```bash
# 获取销售数据
bi-cli sales get [options]

Options:
  --days <number>        最近N天 (默认: 7)
  --start <date>         开始日期 (YYYY-MM-DD)
  --end <date>           结束日期 (YYYY-MM-DD)
  --metrics <list>       指标列表 (revenue,orders,aov)
  --group-by <field>     分组维度 (day,hour,product,category)
  --format <type>        输出格式 (json,table) (默认: json)

示例:
  bi-cli sales get --days 7 --metrics revenue,orders
  bi-cli sales get --start 2024-01-01 --end 2024-01-31 --group-by day
```

**输出格式**：
```json
{
  "success": true,
  "data": {
    "period": {
      "start": "2024-01-15",
      "end": "2024-01-21",
      "days": 7
    },
    "metrics": {
      "totalRevenue": 125680.50,
      "totalOrders": 342,
      "averageOrderValue": 367.54,
      "previousPeriodRevenue": 118500.00,
      "growthRate": 0.0606
    },
    "daily": [
      {
        "date": "2024-01-15",
        "revenue": 18234.50,
        "orders": 52,
        "aov": 350.67
      }
    ],
    "topProducts": [
      {
        "productId": "prod_123",
        "name": "商品A",
        "revenue": 15600.00,
        "orders": 39,
        "quantity": 45
      }
    ]
  },
  "meta": {
    "executionTime": 234,
    "cachedAt": "2024-01-21T10:30:00Z"
  }
}
```

#### 2.2.3 客户数据
```bash
# 获取客户数据
bi-cli customer get [options]

Options:
  --segment <type>       客户分层 (all,new,repeat,churned,vip)
  --period <days>        统计周期 (默认: 30)
  --metrics <list>       指标列表 (count,revenue,frequency)
  --sort-by <field>      排序字段 (revenue,orders,lastOrder)
  --limit <number>       返回数量限制 (默认: 100)

示例:
  bi-cli customer get --segment churned --period 30
  bi-cli customer get --segment vip --sort-by revenue --limit 20
```

**输出格式**：
```json
{
  "success": true,
  "data": {
    "summary": {
      "totalCustomers": 1234,
      "newCustomers": 156,
      "repeatCustomers": 890,
      "churnedCustomers": 45,
      "repeatRate": 0.72
    },
    "segments": {
      "vip": {
        "count": 89,
        "revenue": 89000.00,
        "averageRevenue": 1000.00
      }
    },
    "customers": [
      {
        "customerId": "cust_456",
        "segment": "vip",
        "totalRevenue": 5600.00,
        "orderCount": 12,
        "lastOrderDate": "2024-01-20",
        "firstOrderDate": "2023-06-15"
      }
    ]
  }
}
```

#### 2.2.4 库存数据
```bash
# 获取库存数据
bi-cli inventory get [options]

Options:
  --status <type>        库存状态 (all,low,out,overstock)
  --threshold <number>   低库存阈值 (默认: 10)
  --category <name>      商品分类筛选
  --sort-by <field>      排序字段 (stock,turnover,sales)

示例:
  bi-cli inventory get --status low --threshold 5
  bi-cli inventory get --category electronics --sort-by turnover
```

**输出格式**：
```json
{
  "success": true,
  "data": {
    "summary": {
      "totalProducts": 456,
      "lowStockProducts": 23,
      "outOfStockProducts": 5,
      "overstockProducts": 12,
      "averageTurnoverRate": 4.5
    },
    "products": [
      {
        "productId": "prod_789",
        "name": "商品B",
        "currentStock": 3,
        "safetyStock": 10,
        "last30DaysSales": 45,
        "turnoverRate": 15.0,
        "status": "low",
        "suggestedReorder": 50
      }
    ]
  }
}
```

#### 2.2.5 趋势数据
```bash
# 获取趋势数据
bi-cli trends get [options]

Options:
  --period <days>        历史周期 (默认: 90)
  --metrics <list>       趋势指标 (revenue,orders,customers)
  --granularity <type>   数据粒度 (day,week,month)
  --forecast <days>      预测天数 (默认: 0)

示例:
  bi-cli trends get --period 90 --metrics revenue,orders
  bi-cli trends get --period 180 --granularity week
```

#### 2.2.6 报告数据
```bash
# 获取报告数据
bi-cli report get [options]

Options:
  --type <type>          报告类型 (daily,weekly,monthly)
  --date <date>          报告日期 (默认: today)

示例:
  bi-cli report get --type weekly
  bi-cli report get --type monthly --date 2024-01
```

### 2.3 配置文件

**位置**：`~/.optima/bi-cli/config.json`

```json
{
  "backendUrl": "https://bi-api.optima.com",
  "apiKey": "encrypted_api_key",
  "timeout": 30000,
  "cache": {
    "enabled": true,
    "ttl": 300
  },
  "output": {
    "format": "json",
    "colorize": false
  }
}
```

### 2.4 错误处理

**错误格式**：
```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid API key",
    "details": "Please run 'bi-cli auth login' first"
  }
}
```

**错误码**：
- `UNAUTHORIZED`: 认证失败
- `FORBIDDEN`: 权限不足
- `NOT_FOUND`: 资源不存在
- `VALIDATION_ERROR`: 参数验证失败
- `SERVER_ERROR`: 服务器错误
- `TIMEOUT`: 请求超时

## 3. bi-backend 设计

### 3.1 技术栈
- **语言**：Python 3.11+
- **框架**：FastAPI（与 commerce-backend 一致）
- **ORM**：SQLAlchemy 2.0（复用 commerce-backend 模型）
- **数据库**：PostgreSQL 14+（只读连接到 commerce-backend 数据库）
- **缓存**：Redis 7+
- **HTTP 客户端**：httpx（用于调用 user-auth）
- **测试**：pytest（与 commerce-backend 一致）
- **部署**：Docker + Docker Compose

### 3.1.1 模型复用策略
bi-backend 直接复用 commerce-backend 的 SQLAlchemy 模型：
- **方式1**：Git submodule 引用 commerce-backend/src/models
- **方式2**：Python package 依赖（将 commerce-backend models 发布为独立包）
- **方式3**：直接复制模型文件（初期快速开发）

**复用的核心模型**：
```python
from commerce_backend.models import (
    Order, OrderItem,          # 订单数据
    Product,                    # 商品数据
    Merchant,                   # 商户数据
    MerchantTransfer,          # 转账数据
    Subscription,              # 订阅数据
    Review,                    # 评价数据
    InventoryLog,              # 库存日志
    OrderStatusHistory,        # 订单状态历史
)
```

### 3.2 API 设计

#### 3.2.1 认证
使用与 commerce-backend 相同的 OAuth 2.0 认证：
```
GET /api/v1/sales
Headers:
  Authorization: Bearer <oauth_token>

# bi-backend 会调用 user-auth 服务验证 token
# 验证通过后，从 token 中提取 user_id，查询 merchants 表获取 merchant_id
```

**认证流程**：
1. bi-cli 从配置文件读取 OAuth token（商家通过 optima auth login 获得）
2. bi-cli 请求 bi-backend 时携带 `Authorization: Bearer <token>` header
3. bi-backend 使用 FastAPI Dependency 调用 user-auth 验证 token
4. 验证通过后，根据 user_id 查询 `merchants` 表获取 `merchant_id`
5. 所有 BI 查询都自动限定在该商家的数据范围内

#### 3.2.2 销售数据 API
```
GET /api/v1/sales?start=2024-01-01&end=2024-01-31&groupBy=day

Query Parameters:
  - start: 开始日期 (required)
  - end: 结束日期 (required)
  - groupBy: 分组维度 (optional)
  - metrics: 指标列表 (optional)

Response: 同 bi-cli 输出格式
```

#### 3.2.3 客户数据 API
```
GET /api/v1/customers?segment=all&period=30

Query Parameters:
  - segment: 客户分层 (required)
  - period: 统计周期 (optional)
  - sortBy: 排序字段 (optional)
  - limit: 返回数量 (optional)

Response: 同 bi-cli 输出格式
```

#### 3.2.4 库存数据 API
```
GET /api/v1/inventory?status=low&threshold=10

Query Parameters:
  - status: 库存状态 (optional)
  - threshold: 低库存阈值 (optional)
  - category: 分类筛选 (optional)

Response: 同 bi-cli 输出格式
```

### 3.3 数据处理流程

```mermaid
sequenceDiagram
    participant CLI as bi-cli
    participant API as bi-backend API
    participant Auth as user-auth OAuth
    participant Cache as Redis Cache
    participant DB as commerce DB

    CLI->>API: GET /api/v1/sales?days=7<br/>Authorization: Bearer <token>
    API->>Auth: 验证 OAuth token
    Auth-->>API: user_id + 权限
    API->>DB: 查询 merchants 表（user_id）
    DB-->>API: merchant_id

    API->>Cache: 检查缓存<br/>Key: bi:merchant_123:sales:7d

    alt 缓存命中
        Cache-->>API: 返回缓存数据
        API-->>CLI: 返回结果
    else 缓存未命中
        API->>DB: SELECT * FROM orders<br/>WHERE merchant_id = 'merchant_123'<br/>AND created_at >= NOW() - INTERVAL '7 days'
        DB-->>API: 订单数据
        API->>API: 数据聚合计算<br/>- 总销售额<br/>- 订单数量<br/>- 客单价
        API->>Cache: 写入缓存 (TTL: 5min)
        API-->>CLI: 返回结构化结果
    end
```

### 3.4 数据模型

#### 3.4.1 复用 commerce-backend 数据表

**bi-backend 不创建新表**，直接查询 commerce-backend 的现有表（只读访问）：

**核心数据表**：
```sql
-- 订单数据（来自 commerce-backend）
orders (
    id, merchant_id, order_number,
    customer_user_id, customer_email, customer_name,
    status, -- pending/paid/processing/shipped/delivered/cancelled/refunded
    subtotal, shipping_fee, tax_amount, amount_total, currency,
    product_base_currency, stripe_settlement_currency,
    shipping_address, -- JSON: {country, city, ...}
    utm_source, utm_campaign, gclid,
    created_at, shipped_at, delivered_at,
    delivery_confirmed_at, transfer_status
)

order_items (
    id, order_id, product_id, variant_id,
    product_name, quantity, price, total
)

-- 商品数据
products (
    id, merchant_id, name, sku,
    price, original_price, currency,
    stock_quantity, low_stock_threshold,
    status, -- draft/active/inactive/archived
    tags, -- JSONB
    parent_product_id, variant_attributes, -- 变体支持
    created_at, updated_at
)

-- 商户数据
merchants (
    id, user_id, name, slug,
    stripe_account_id, platform_fee_percentage,
    transfer_delay_days, require_delivery_confirmation,
    created_at
)

-- 转账数据
merchant_transfers (
    id, merchant_id, order_id,
    gross_amount, platform_fee, net_amount,
    status, -- pending/completed/failed
    stripe_transfer_id,
    created_at, completed_at
)

-- 其他相关表
reviews (product_id, merchant_id, rating, comment)
subscriptions (merchant_id, plan, status, started_at)
inventory_logs (product_id, quantity_change, reason)
order_status_history (order_id, from_status, to_status, changed_at)
```

**查询示例**：
```python
# 销售数据查询
orders_query = (
    select(
        func.sum(Order.amount_total).label('total_revenue'),
        func.count(Order.id).label('total_orders'),
        func.avg(Order.amount_total).label('average_order_value')
    )
    .where(Order.merchant_id == merchant_id)
    .where(Order.status == 'paid')
    .where(Order.created_at >= start_date)
)

# 商品销售排行
top_products = (
    select(
        OrderItem.product_name,
        func.sum(OrderItem.total).label('revenue'),
        func.sum(OrderItem.quantity).label('quantity')
    )
    .join(Order)
    .where(Order.merchant_id == merchant_id)
    .where(Order.status == 'paid')
    .group_by(OrderItem.product_name)
    .order_by(desc('revenue'))
    .limit(10)
)
```

### 3.5 缓存策略

**缓存层级**：
1. **L1 - 热点数据缓存** (TTL: 5分钟)
   - 当天数据
   - 最近7天数据
   - 常用查询

2. **L2 - 历史数据缓存** (TTL: 1小时)
   - 历史月度数据
   - 趋势数据

**缓存 Key 设计**：
```
bi:{merchantId}:{type}:{params_hash}

示例:
bi:merchant_123:sales:7d_revenue_orders
bi:merchant_123:customers:30d_all
```

**缓存失效策略**：
- 时间过期自动失效
- 数据更新时主动失效
- 定时任务批量更新

### 3.6 查询优化策略

**无需数据同步**：
- bi-backend 直接查询 commerce-backend 数据库
- 所有查询都是实时的，无延迟
- 通过 Redis 缓存提升性能

**优化方式**：
1. **利用现有索引**：
   ```sql
   -- commerce-backend 已有的索引
   CREATE INDEX idx_orders_merchant_created ON orders(merchant_id, created_at);
   CREATE INDEX idx_orders_status ON orders(status);
   CREATE INDEX idx_order_items_product ON order_items(product_id);
   ```

2. **只读副本**（可选）：
   - 如果查询压力大，可使用 PostgreSQL 读写分离
   - bi-backend 连接到只读副本，不影响主库性能

3. **物化视图**（Phase 2）：
   - 对于复杂聚合查询，可创建物化视图
   - 例如：每日销售汇总、商品销售排行
   ```sql
   CREATE MATERIALIZED VIEW daily_sales_summary AS
   SELECT
       merchant_id,
       date_trunc('day', created_at) as date,
       sum(amount_total) as revenue,
       count(*) as order_count
   FROM orders
   WHERE status = 'paid'
   GROUP BY merchant_id, date;

   -- 每小时刷新一次
   REFRESH MATERIALIZED VIEW daily_sales_summary;
   ```

### 3.7 性能优化

**查询优化**：
- 使用索引加速查询
- 数据分区（按月份分区）
- 只查询必要字段
- 预聚合常用维度

**计算优化**：
- 异步任务处理重计算
- 分批处理大量数据
- 使用数据库聚合函数

**缓存优化**：
- 缓存穿透保护
- 缓存预热
- 智能缓存失效

## 4. Claude Code 集成

### 4.1 全局配置

**CLAUDE.md 配置**：
```markdown
## Optima BI CLI

**全局可用** - 为商家提供数据智能分析能力。

**常见需求映射**：
- "分析最近7天销售" → `bi-cli sales get --days 7`
- "有多少客户流失了" → `bi-cli customer get --segment churned`
- "哪些商品需要补货" → `bi-cli inventory get --status low`
- "生成本周报告" → `bi-cli report get --type weekly`

使用 `bi-cli --help` 查看所有命令。
```

### 4.2 对话流程

```mermaid
sequenceDiagram
    participant M as 商家
    participant CC as Claude Code
    participant CLI as bi-cli
    participant BE as bi-backend

    M->>CC: "帮我分析最近7天的销售情况"
    CC->>CC: 理解意图：销售分析
    CC->>CLI: bi-cli sales get --days 7
    CLI->>BE: GET /api/v1/sales?days=7
    BE-->>CLI: 返回结构化数据
    CLI-->>CC: JSON 格式数据
    CC->>CC: AI 分析数据
    CC->>CC: 生成洞察和建议
    CC-->>M: 自然语言呈现结果：<br/>"最近7天销售额12.5万，增长6%..."
```

### 4.3 Prompt 优化

**系统 Prompt 建议**：
```
当商家询问数据分析时：
1. 识别需求类型（销售/客户/库存/趋势）
2. 调用对应 bi-cli 命令获取数据
3. 分析数据趋势和异常
4. 生成简洁的洞察
5. 提供可行的建议

输出格式：
- 关键指标概览
- 趋势分析（同比/环比）
- 发现的问题或机会
- 具体建议

避免：
- 罗列原始数据
- 过度技术术语
- 模糊建议
```

## 5. 部署架构

### 5.1 Docker Compose

```yaml
version: '3.8'

services:
  bi-backend:
    build: ./packages/bi-backend
    ports:
      - "8281:8000"
    environment:
      # 连接到 commerce-backend 数据库（只读）
      DATABASE_URL: postgresql://commerce_readonly:pass@commerce-db:5432/commerce

      # Redis 缓存
      REDIS_URL: redis://redis:6379/2

      # OAuth 认证服务
      AUTH_BASE_URL: https://auth.optima.chat
      AUTH_CLIENT_ID: bi-backend-client
      AUTH_CLIENT_SECRET: ${AUTH_CLIENT_SECRET}

      # 应用配置
      APP_ENV: production
      LOG_LEVEL: info
    depends_on:
      - redis
    # 注意：不需要独立的 postgres，直接连接 commerce-backend 的数据库

  redis:
    image: redis:7-alpine
    ports:
      - "6380:6379"
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes

volumes:
  redis_data:
```

**说明**：
- bi-backend 连接到 commerce-backend 的 PostgreSQL（只读用户）
- 使用独立的 Redis 实例进行缓存
- 不需要独立的数据库，避免数据同步问题

### 5.2 环境变量

**bi-backend .env**：
```env
# Application
APP_ENV=production
PORT=8000
LOG_LEVEL=info

# Database (只读连接到 commerce-backend)
DATABASE_URL=postgresql://commerce_readonly:readonly_pass@localhost:8282/commerce
DB_POOL_SIZE=10
DB_MAX_OVERFLOW=20

# Redis
REDIS_URL=redis://localhost:6380/2
CACHE_TTL=300

# OAuth Authentication (user-auth service)
AUTH_BASE_URL=https://auth.optima.chat
AUTH_CLIENT_ID=bi-backend-client
AUTH_CLIENT_SECRET=your_secret_here

# Rate Limiting
RATE_LIMIT_WINDOW=60
RATE_LIMIT_MAX=100

# CORS
CORS_ORIGINS=["https://app.optima.chat", "http://localhost:3000"]
```

**数据库只读用户创建**：
```sql
-- 在 commerce-backend PostgreSQL 中创建只读用户
CREATE USER commerce_readonly WITH PASSWORD 'readonly_pass';
GRANT CONNECT ON DATABASE commerce TO commerce_readonly;
GRANT USAGE ON SCHEMA public TO commerce_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO commerce_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO commerce_readonly;
```

## 6. 监控与日志

### 6.1 监控指标
- API 响应时间
- 缓存命中率
- 数据库查询性能
- 队列任务处理速度
- 错误率

### 6.2 日志规范
```python
# 使用 structlog 记录结构化日志
logger.info(
    "sales_query",
    merchant_id="merchant_123",
    period="7d",
    execution_time_ms=234,
    cache_hit=True
)

logger.error(
    "api_error",
    endpoint="/api/v1/sales",
    error="Database connection failed",
    exc_info=True
)
```

## 7. 安全设计

### 7.1 认证授权
- **OAuth 2.0 认证**：使用 user-auth 服务统一认证
- **商家数据隔离**：自动基于 merchant_id 过滤数据
- **只读权限**：数据库用户只有 SELECT 权限，无法修改数据
- **Token 验证**：每个请求都验证 OAuth token 有效性

### 7.2 数据安全
- **HTTPS 传输**：所有 API 调用使用 HTTPS
- **SQL 注入防护**：使用 SQLAlchemy ORM，参数化查询
- **请求频率限制**：防止 API 滥用（slowapi 库）
- **只读访问**：bi-backend 无法修改 commerce 数据，降低风险

### 7.3 隐私保护
- **客户信息脱敏**：
  - 邮箱部分隐藏：`user****@example.com`
  - 手机号部分隐藏：`138****5678`
- **数据访问审计**：记录所有 BI 查询日志
- **GDPR 合规**：遵循数据访问最小化原则

## 8. 测试策略

### 8.1 单元测试
- bi-cli 命令测试
- bi-backend API 测试
- 数据处理逻辑测试

### 8.2 集成测试
- bi-cli + bi-backend 集成
- bi-backend + Optima Commerce 集成
- 端到端数据流测试

### 8.3 性能测试
- 压力测试（并发请求）
- 大数据量测试
- 缓存效果验证

## 9. 开发规范

### 9.1 代码规范
- **Python**：遵循 PEP 8 规范
- **Linting**：ruff（现代化的 Python linter）
- **Formatting**：black（代码格式化）
- **Type Checking**：mypy（类型检查）
- **Git Commit**：Conventional Commits 规范

### 9.2 API 规范
- RESTful 设计
- 统一响应格式（Pydantic models）
- 错误码标准化
- OpenAPI 自动生成（FastAPI 内置）

### 9.3 文档规范
- **API 文档**：FastAPI 自动生成（/docs）
- **CLI 命令文档**：`bi-cli --help`
- **架构决策记录**（ADR）：docs/adr/

### 9.4 项目结构
```
optima-bi/
├── packages/
│   ├── bi-cli/              # Python CLI 工具
│   │   ├── bi_cli/
│   │   │   ├── __init__.py
│   │   │   ├── cli.py       # Click/Typer CLI 入口
│   │   │   ├── commands/    # 各个命令实现
│   │   │   ├── client.py    # HTTP 客户端
│   │   │   └── config.py    # 配置管理
│   │   ├── tests/
│   │   ├── pyproject.toml
│   │   └── README.md
│   │
│   └── bi-backend/          # FastAPI 后端服务
│       ├── src/
│       │   ├── api/         # API 路由
│       │   │   ├── sales.py
│       │   │   ├── customers.py
│       │   │   ├── inventory.py
│       │   │   ├── finance.py
│       │   │   └── logistics.py
│       │   ├── services/    # 业务逻辑
│       │   │   ├── sales_service.py
│       │   │   ├── customer_service.py
│       │   │   └── cache_service.py
│       │   ├── models/      # 复用 commerce-backend 模型
│       │   │   └── __init__.py
│       │   ├── schemas/     # Pydantic schemas
│       │   ├── middleware/  # OAuth 认证等
│       │   └── core/        # 配置、数据库连接
│       ├── tests/
│       ├── pyproject.toml
│       ├── Dockerfile
│       └── README.md
├── docs/                    # 文档
├── docker-compose.yml
└── README.md
```

## 10. 附录

### 10.1 技术选型理由

**为什么选择 Python + FastAPI**：
- **技术栈统一**：与 commerce-backend 保持一致，便于团队协作
- **模型复用**：直接复用 commerce-backend 的 SQLAlchemy 模型
- **开发效率**：FastAPI 提供自动 API 文档、数据验证
- **性能优异**：FastAPI 基于 Starlette 和 Pydantic，性能接近 Node.js
- **类型安全**：Python 3.11+ 类型提示 + Pydantic 验证

**为什么直接连接数据库而非 API**：
- **性能更优**：避免 HTTP 调用开销，SQL 查询更高效
- **无需同步**：实时数据，无延迟
- **灵活查询**：可以自由组合 SQL 查询，满足复杂分析需求
- **简化架构**：减少一层 API 调用，降低系统复杂度

**为什么选择 PostgreSQL**：
- **已有基础**：commerce-backend 使用 PostgreSQL
- **强大的聚合查询**：GROUP BY、窗口函数、CTE
- **支持 JSON/JSONB**：原生支持 JSON 数据查询
- **成熟的分区和索引**：优化大数据量查询

**为什么选择 Redis**：
- **高性能缓存**：亚毫秒级响应
- **灵活的数据结构**：String、Hash、Set、Sorted Set
- **TTL 支持**：自动过期清理

### 10.2 扩展性考虑

**水平扩展**：
- bi-backend 无状态设计，可多实例部署
- 数据库读写分离
- Redis 集群

**垂直扩展**：
- 数据分区
- 索引优化
- 查询优化

### 10.3 未来规划

**Phase 2+**：
- 实时数据流处理
- 自定义指标配置
- 数据可视化导出
- 多维度钻取分析
- A/B 测试分析
