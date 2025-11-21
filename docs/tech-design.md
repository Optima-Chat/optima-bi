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
        B -->|执行命令| C[bi-cli]
        C -->|sales get| C1[销售数据]
        C -->|customer get| C2[客户数据]
        C -->|inventory get| C3[库存数据]
        C -->|trends get| C4[趋势数据]
        C -->|report get| C5[报告数据]
    end

    subgraph "后端服务层 - 数据处理层"
        C -->|HTTP/REST| D[bi-backend]
        D1[数据聚合服务] -->|聚合| D
        D2[数据清洗服务] -->|清洗| D
        D3[指标计算服务] -->|计算| D
        D4[缓存服务] -->|缓存| D
    end

    subgraph "数据源层"
        D -->|API 调用| E[Optima Commerce System]
        E1[Orders API] --> E
        E2[Products API] --> E
        E3[Customers API] --> E
        E4[Inventory API] --> E
    end

    subgraph "存储层"
        D -.->|读写| F[PostgreSQL]
        D -.->|缓存| G[Redis]
    end

    style B fill:#f9f,stroke:#333,stroke-width:3px
    style C fill:#bbf,stroke:#333,stroke-width:2px
    style D fill:#bfb,stroke:#333,stroke-width:2px
    style E fill:#fbb,stroke:#333,stroke-width:2px
```

### 1.2 设计原则

**职责分离**：
- **Claude Code**：负责 AI 分析、洞察生成、建议输出
- **bi-cli**：负责数据获取、结构化输出
- **bi-backend**：负责数据聚合、清洗、基础计算

**数据流向**：
```
Optima Commerce → bi-backend → bi-cli → Claude Code → 商家
   (原始数据)     (结构化数据)  (JSON输出)  (智能分析)   (自然语言)
```

## 2. bi-cli 设计

### 2.1 技术栈
- **语言**：Node.js 18+ (TypeScript)
- **CLI 框架**：Commander.js
- **HTTP 客户端**：axios
- **数据验证**：zod
- **测试**：vitest

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
- **语言**：Node.js 18+ (TypeScript)
- **框架**：Express.js / Fastify
- **ORM**：Prisma
- **数据库**：PostgreSQL 14+
- **缓存**：Redis 7+
- **任务队列**：BullMQ
- **测试**：Jest
- **部署**：Docker + Docker Compose

### 3.2 API 设计

#### 3.2.1 认证
```
POST /api/v1/auth/verify
Headers:
  X-API-Key: <api-key>

Response:
{
  "valid": true,
  "merchantId": "merchant_123",
  "permissions": ["read:sales", "read:customers"]
}
```

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
    participant Cache as Redis Cache
    participant Agg as 数据聚合服务
    participant OC as Optima Commerce

    CLI->>API: GET /api/v1/sales?days=7
    API->>Cache: 检查缓存

    alt 缓存命中
        Cache-->>API: 返回缓存数据
        API-->>CLI: 返回结果
    else 缓存未命中
        API->>Agg: 请求数据聚合
        Agg->>OC: 获取订单数据
        OC-->>Agg: 返回原始数据
        Agg->>Agg: 数据清洗
        Agg->>Agg: 指标计算
        Agg->>Agg: 数据格式化
        Agg-->>API: 返回结构化数据
        API->>Cache: 写入缓存
        API-->>CLI: 返回结果
    end
```

### 3.4 数据模型

#### 3.4.1 聚合数据表

**sales_daily_agg** - 每日销售聚合
```sql
CREATE TABLE sales_daily_agg (
    id SERIAL PRIMARY KEY,
    merchant_id VARCHAR(50) NOT NULL,
    date DATE NOT NULL,
    total_revenue DECIMAL(12, 2) NOT NULL,
    total_orders INT NOT NULL,
    average_order_value DECIMAL(10, 2) NOT NULL,
    total_items INT NOT NULL,
    unique_customers INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(merchant_id, date)
);

CREATE INDEX idx_sales_daily_merchant_date ON sales_daily_agg(merchant_id, date);
```

**customer_segment_agg** - 客户分层聚合
```sql
CREATE TABLE customer_segment_agg (
    id SERIAL PRIMARY KEY,
    merchant_id VARCHAR(50) NOT NULL,
    customer_id VARCHAR(50) NOT NULL,
    segment VARCHAR(20) NOT NULL, -- new, repeat, churned, vip
    total_revenue DECIMAL(12, 2) NOT NULL,
    order_count INT NOT NULL,
    first_order_date DATE,
    last_order_date DATE,
    calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(merchant_id, customer_id)
);

CREATE INDEX idx_customer_segment_merchant ON customer_segment_agg(merchant_id, segment);
```

**inventory_snapshot** - 库存快照
```sql
CREATE TABLE inventory_snapshot (
    id SERIAL PRIMARY KEY,
    merchant_id VARCHAR(50) NOT NULL,
    product_id VARCHAR(50) NOT NULL,
    current_stock INT NOT NULL,
    safety_stock INT NOT NULL,
    last_30days_sales INT NOT NULL,
    turnover_rate DECIMAL(8, 2),
    status VARCHAR(20), -- low, out, overstock, normal
    snapshot_date DATE NOT NULL,
    UNIQUE(merchant_id, product_id, snapshot_date)
);
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

### 3.6 数据同步

**同步任务**：
```mermaid
graph LR
    A[定时任务] -->|每5分钟| B[增量同步]
    A -->|每天凌晨| C[全量聚合]
    B --> D[更新缓存]
    C --> E[重建聚合表]
```

**同步策略**：
- **实时数据**：通过 API 实时查询
- **聚合数据**：定时任务增量计算
- **历史数据**：每日全量聚合

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
    build: ./bi-backend
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgresql://user:pass@postgres:5432/optima_bi
      REDIS_URL: redis://redis:6379
      OPTIMA_API_URL: https://api.optima.com
    depends_on:
      - postgres
      - redis

  postgres:
    image: postgres:14
    volumes:
      - postgres_data:/var/lib/postgresql/data
    environment:
      POSTGRES_DB: optima_bi
      POSTGRES_USER: user
      POSTGRES_PASSWORD: pass

  redis:
    image: redis:7
    volumes:
      - redis_data:/data

  worker:
    build: ./bi-backend
    command: npm run worker
    environment:
      DATABASE_URL: postgresql://user:pass@postgres:5432/optima_bi
      REDIS_URL: redis://redis:6379
    depends_on:
      - postgres
      - redis

volumes:
  postgres_data:
  redis_data:
```

### 5.2 环境变量

**bi-backend .env**：
```env
NODE_ENV=production
PORT=3000

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/optima_bi

# Redis
REDIS_URL=redis://localhost:6379

# Optima Commerce
OPTIMA_API_URL=https://api.optima.com
OPTIMA_API_KEY=your_api_key

# Cache
CACHE_TTL=300
CACHE_MAX_SIZE=1000

# Rate Limiting
RATE_LIMIT_WINDOW=60000
RATE_LIMIT_MAX=100
```

## 6. 监控与日志

### 6.1 监控指标
- API 响应时间
- 缓存命中率
- 数据库查询性能
- 队列任务处理速度
- 错误率

### 6.2 日志规范
```typescript
// 结构化日志
logger.info('sales_query', {
  merchantId: 'merchant_123',
  period: '7d',
  executionTime: 234,
  cacheHit: true
});

logger.error('api_error', {
  endpoint: '/api/v1/sales',
  error: 'Database connection failed',
  stack: error.stack
});
```

## 7. 安全设计

### 7.1 认证授权
- API Key 认证
- 商家数据隔离
- 权限验证

### 7.2 数据安全
- 敏感数据加密存储
- API 传输使用 HTTPS
- SQL 注入防护
- 请求频率限制

### 7.3 隐私保护
- 客户信息脱敏
- 数据访问审计
- GDPR 合规

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
- TypeScript strict mode
- ESLint + Prettier
- Git commit 规范

### 9.2 API 规范
- RESTful 设计
- 统一响应格式
- 错误码标准化

### 9.3 文档规范
- API 文档（OpenAPI）
- CLI 命令文档
- 架构决策记录（ADR）

## 10. 附录

### 10.1 技术选型理由

**为什么选择 Node.js**：
- 与 Optima 现有技术栈一致
- 异步 I/O 适合数据密集型应用
- 丰富的生态系统

**为什么选择 PostgreSQL**：
- 强大的聚合查询能力
- 支持 JSON 数据类型
- 成熟的分区和索引功能

**为什么选择 Redis**：
- 高性能缓存
- 支持复杂数据结构
- 持久化能力

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
