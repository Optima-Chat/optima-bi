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
        B -->|执行命令| C[bi-cli<br/>Node.js CLI<br/>TypeScript]
        C -->|sales get| C1[销售数据]
        C -->|customer get| C2[客户数据]
        C -->|inventory get| C3[库存数据]
        C -->|finance get| C4[财务数据]
        C -->|logistics get| C5[物流数据]
        C -->|product get| C6[商品数据]
    end

    subgraph "后端服务层 - 数据查询层"
        C -->|HTTP/REST| D[bi-backend<br/>Fastify<br/>TypeScript]
        D1[OAuth 认证] --> D
        D2[ClickHouse 查询服务] --> D
        D3[多层缓存服务] --> D
        D -->|查询 OLAP| H[ClickHouse<br/>列式存储<br/>物化视图]
    end

    subgraph "数据源层 - OLTP"
        E[commerce-backend<br/>PostgreSQL<br/>OLTP 数据库]
        E -->|复用模型| E1[Order/OrderItem]
        E -->|复用模型| E2[Product/Variant]
        E -->|复用模型| E3[Merchant]
    end

    subgraph "实时同步层 - CDC"
        E -->|WAL 日志| I[Debezium CDC<br/>Change Data Capture]
        I -->|捕获变更| J[Kafka<br/>消息队列<br/>10 分区]
        J -->|流式传输| H
    end

    subgraph "认证层"
        D -->|验证 Token| F[user-auth<br/>OAuth 2.0]
    end

    subgraph "缓存层"
        D -.->|L1/L2 缓存| G[Redis 7+<br/>+ NodeCache]
    end

    style B fill:#f9f,stroke:#333,stroke-width:3px
    style C fill:#bbf,stroke:#333,stroke-width:2px
    style D fill:#bfb,stroke:#333,stroke-width:2px
    style E fill:#fbb,stroke:#333,stroke-width:2px
    style F fill:#ffd,stroke:#333,stroke-width:2px
    style H fill:#fcf,stroke:#333,stroke-width:3px
    style I fill:#fda,stroke:#333,stroke-width:2px
    style J fill:#fda,stroke:#333,stroke-width:2px
```

### 1.2 设计原则

**职责分离**：
- **Claude Code**：负责 AI 分析、洞察生成、建议输出
- **bi-cli**：负责数据获取、结构化输出（TypeScript CLI）
- **bi-backend**：负责数据查询、聚合计算、多层缓存（Fastify + TypeScript）
- **ClickHouse**：OLAP 数据库，负责高性能分析查询（列式存储 + 物化视图）
- **Debezium + Kafka**：CDC 实时同步，负责将 PostgreSQL 数据流式传输到 ClickHouse
- **commerce-backend DB**：OLTP 数据源（PostgreSQL）

**数据流向**：
```
PostgreSQL → Debezium CDC → Kafka → ClickHouse → bi-backend → bi-cli → Claude Code → 商家
  (OLTP)    (变更捕获)   (消息队列) (OLAP)    (查询聚合)  (JSON输出) (AI分析)  (自然语言)
  < 1 秒延迟                        10-50ms 查询
```

**关键设计决策**：
1. **技术栈选择**：全栈 TypeScript（Node.js），统一前后端技术栈
2. **OLAP 分离**：使用 ClickHouse OLAP 数据库进行分析查询，完全隔离 OLTP 数据库（[ADR-006](./architecture/adr-006-clickhouse-olap.md)）
3. **CDC 实时同步**：使用 Debezium CDC + Kafka 实时同步数据（< 1 秒延迟）
4. **物化视图预聚合**：ClickHouse 物化视图自动预聚合数据，查询性能 50-1000 倍提升
5. **多层缓存架构**：L1 内存 + L2 Redis + L3 ClickHouse 物化视图 + L4 ClickHouse 原始表
6. **OAuth 统一**：使用 user-auth 服务进行统一认证

## 2. bi-cli 设计

### 2.1 技术栈
- **语言**：TypeScript + Node.js 18+
- **CLI 框架**：Commander.js 或 oclif
- **HTTP 客户端**：axios 或 ky（支持重试和拦截器）
- **数据验证**：zod（TypeScript-first schema validation）
- **配置管理**：conf（加密存储）+ dotenv
- **测试**：vitest 或 jest

### 2.1.1 OAuth 认证流程

**认证方式：OAuth 2.0 Device Flow**

参考 commerce-cli 的实现，bi-cli 使用 OAuth 2.0 Device Flow 进行认证：

```bash
bi-cli auth login
```

**认证流程**：
1. **请求 Device Code**
   - 调用 `POST https://auth.optima.shop/oauth/device`
   - 获取 `device_code`, `user_code`, `verification_uri`

2. **用户授权**
   - CLI 显示授权 URL 和用户代码
   - 自动打开浏览器，引导用户授权
   - 用户在浏览器中输入代码并登录

3. **轮询获取 Token**
   - CLI 轮询 `POST https://auth.optima.shop/oauth/token`
   - 参数：`grant_type=urn:ietf:params:oauth:grant-type:device_code`
   - 获取 `access_token`, `refresh_token`, `expires_in`

4. **保存 Token**
   - 加密存储到 `~/.optima/bi-cli/config.json`
   - 使用 `conf` 库进行加密存储

5. **自动刷新**
   - Token 过期前自动使用 `refresh_token` 刷新

**配置文件结构**：
```json
{
  "tokens": {
    "access_token": "eyJhbG...",
    "refresh_token": "eyJhbG...",
    "expires_in": 3600,
    "expires_at": 1706789400
  },
  "user": {
    "id": "user_123",
    "email": "merchant@example.com",
    "role": "merchant"
  },
  "api_url": "https://bi-api.optima.shop",
  "auth_url": "https://auth.optima.shop"
}
```

**多环境支持**：
```bash
# 默认使用 production 环境
bi-cli auth login

# 使用 stage 环境
bi-cli auth login --env stage

# 使用 development 环境
bi-cli auth login --env development
```

**环境配置**：
- **production**: `auth.optima.shop` / `bi-api.optima.shop`
- **stage**: `auth-stage.optima.shop` / `bi-api-stage.optima.shop`
- **development**: `auth.optima.chat` / `bi-api.optima.chat`

### 2.1.2 输出格式

参考 commerce-cli 的设计，bi-cli 支持两种输出模式：

**JSON 模式（默认，AI 友好）**

适合 Claude Code 和程序化处理，所有命令默认输出结构化 JSON：

```bash
bi-cli sales get --days 7
# 输出标准 JSON 格式
{
  "success": true,
  "data": {
    "metrics": {...},
    "daily": [...]
  },
  "meta": {
    "executionTime": 234,
    "cachedAt": "2024-01-21T10:30:00Z"
  }
}
```

**Pretty 模式（人类可读）**

使用 `--pretty` 或 `--format table` 选项，输出彩色表格：

```bash
bi-cli sales get --days 7 --pretty

┌─────────────────────────────────────────┐
│  销售数据（最近 7 天）                   │
├─────────────────────────────────────────┤
│  总销售额:       $125,680.50            │
│  订单数量:       342                    │
│  客单价:         $367.54                │
│  增长率:         +6.06%                 │
└─────────────────────────────────────────┘

每日趋势:
┌────────────┬────────────┬──────┬──────────┐
│ 日期       │ 销售额     │ 订单 │ 客单价   │
├────────────┼────────────┼──────┼──────────┤
│ 2024-01-15 │ $18,234.50 │  52  │ $350.67  │
│ 2024-01-16 │ $19,120.00 │  54  │ $354.07  │
│ ...        │            │      │          │
└────────────┴────────────┴──────┴──────────┘
```

**统一响应格式**：
```typescript
interface CliResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}
```

**使用场景**：
- **JSON 模式**（默认）：Claude Code、自动化脚本、数据导出
- **Pretty 模式**：终端手动执行、调试、快速查看

### 2.2 命令设计

**角色说明**：
- **商家命令**：自动基于 OAuth token 中的 user_id 查询商家数据
- **平台命令**：需要管理员权限，可查看平台整体或指定商家数据

#### 2.2.1 全局配置
```bash
# 认证（使用 optima CLI 的 OAuth token）
bi-cli auth login  # 使用 optima auth 的配置

# 配置 backend 地址
bi-cli config set backend-url https://bi-api.optima.com

# 查看配置
bi-cli config list

# 查看当前用户角色
bi-cli auth whoami
# 输出: Role: merchant, Merchant ID: merchant_xxx
# 或:   Role: admin, Permissions: [platform:read, ...]
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

#### 2.2.6 报告数据（商家）
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

---

### 2.2.7 平台命令（需管理员权限）

#### 2.2.7.1 平台概览
```bash
# 平台整体概览
bi-cli platform overview [options]

Options:
  --month <month>        月份 (默认: current, 格式: 2024-01)
  --days <number>        最近N天
  --metrics <list>       指标列表 (gmv,orders,merchants,buyers)

示例:
  bi-cli platform overview --month current
  bi-cli platform overview --days 30 --metrics gmv,merchants
```

**输出示例**：
```json
{
  "period": {"start": "2024-01-01", "end": "2024-01-31"},
  "metrics": {
    "gmv": 1250000.00,
    "totalOrders": 5432,
    "activeMerchants": 234,
    "activeBuyers": 3456,
    "averageOrderValue": 230.12
  },
  "growth": {
    "gmvGrowth": 0.15,
    "merchantGrowth": 0.08,
    "buyerGrowth": 0.12
  }
}
```

#### 2.2.7.2 商家分析
```bash
# 商家活跃度分析
bi-cli platform merchants [options]

Options:
  --segment <type>       商家分层 (all,active,sleeping,churned,top)
  --month <month>        月份
  --sort-by <field>      排序字段 (gmv,orders,created_at)
  --limit <number>       返回数量 (默认: 100)

示例:
  bi-cli platform merchants --segment churned --month current
  bi-cli platform merchants --segment top --sort-by gmv --limit 10
```

#### 2.2.7.3 订阅分析
```bash
# 订阅会员分析
bi-cli platform subscription [options]

Options:
  --plan <type>          订阅计划 (all,pro,enterprise)
  --month <month>        月份
  --metrics <list>       指标列表 (mrr,arr,churn,conversion)

示例:
  bi-cli platform subscription --plan pro --month current
  bi-cli platform subscription --metrics mrr,arr,churn
```

#### 2.2.7.4 平台财务
```bash
# 平台收入分析
bi-cli platform revenue [options]

Options:
  --month <month>        月份
  --breakdown            显示收入细分 (交易手续费/订阅)

示例:
  bi-cli platform revenue --month current --breakdown
```

#### 2.2.7.5 指定商家查询（管理员）
```bash
# 查看指定商家的数据（管理员权限）
bi-cli sales get --merchant-id merchant_xxx --days 30
bi-cli customer get --merchant-id merchant_xxx --segment all

# 所有商家命令都可以加 --merchant-id 参数来查看指定商家数据
```

### 2.3 配置管理

**配置目录**：`~/.optima/bi-cli/`

**文件结构**：
```
~/.optima/bi-cli/
├── config-prod.json          # Production 环境配置（加密存储）
├── config-stage.json         # Stage 环境配置
├── config-dev.json           # Development 环境配置
└── current-env.json          # 当前激活的环境
```

**配置文件内容**（加密存储，使用 `conf` 库）：
```json
{
  "tokens": {
    "access_token": "eyJhbGciOiJSUzI1NiIs...",
    "refresh_token": "eyJhbGciOiJSUzI1NiIs...",
    "expires_in": 3600,
    "expires_at": 1706789400
  },
  "user": {
    "id": "user_abc123",
    "email": "merchant@example.com",
    "name": "John Doe",
    "role": "merchant"
  },
  "api_url": "https://bi-api.optima.shop",
  "auth_url": "https://auth.optima.shop"
}
```

**配置命令**：
```bash
# 查看当前环境
bi-cli config get env

# 切换环境
bi-cli auth switch --env stage

# 查看所有配置
bi-cli config list

# 设置特定配置项（高级用法）
bi-cli config set api-url https://custom-bi-api.com
```

**自动刷新 Token**：
```typescript
// src/utils/auth.ts
import { getConfig, saveTokens } from './config';
import axios from 'axios';

export async function getValidToken(): Promise<string> {
  const config = getConfig();
  const { tokens } = config;

  // 检查是否过期（提前 5 分钟刷新）
  const now = Math.floor(Date.now() / 1000);
  if (tokens.expires_at - now < 300) {
    // 刷新 Token
    const { data } = await axios.post(
      `${config.auth_url}/oauth/token`,
      {
        grant_type: 'refresh_token',
        refresh_token: tokens.refresh_token,
        client_id: 'bi-cli'
      }
    );

    saveTokens(
      data.access_token,
      data.refresh_token,
      data.expires_in
    );

    return data.access_token;
  }

  return tokens.access_token;
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
- **语言**：TypeScript + Node.js 18+
- **框架**：Fastify 或 Express.js
  - **推荐 Fastify**：更快的性能，内置 schema validation，TypeScript 友好
- **ORM**：Prisma（推荐）或 TypeORM
  - **推荐 Prisma**：类型安全、优秀的 DX、自动生成类型
- **数据库**：PostgreSQL 14+（只读连接到 commerce-backend 数据库）
- **缓存**：Redis 7+ (ioredis 客户端)
- **HTTP 客户端**：axios（用于调用 user-auth）
- **数据验证**：zod（与 Fastify 集成）
- **测试**：vitest（快速、兼容 Vite 生态）
- **部署**：Docker + Docker Compose

### 3.1.1 数据模型定义策略

**方案选择：Prisma（推荐）**

使用 Prisma 从现有 commerce-backend 数据库生成 schema：

```bash
# 1. 从数据库内省生成 Prisma schema
npx prisma db pull --url="postgresql://readonly_user:pass@localhost:5432/commerce"

# 2. 生成 TypeScript 类型
npx prisma generate
```

**生成的 Prisma Schema 示例**：
```prisma
// schema.prisma
model Order {
  id                String   @id @default(uuid())
  merchantId        String   @map("merchant_id")
  orderNumber       String   @unique @map("order_number")
  customerUserId    String?  @map("customer_user_id")
  customerEmail     String   @map("customer_email")
  customerName      String   @map("customer_name")
  status            String   // pending, paid, shipped, delivered, etc.
  subtotal          Decimal  @db.Decimal(10, 2)
  shippingFee       Decimal  @map("shipping_fee") @db.Decimal(10, 2)
  amountTotal       Decimal  @map("amount_total") @db.Decimal(10, 2)
  currency          String
  shippingAddress   Json     @map("shipping_address")
  createdAt         DateTime @default(now()) @map("created_at")
  deliveredAt       DateTime? @map("delivered_at")

  merchant          Merchant @relation(fields: [merchantId], references: [id])
  items             OrderItem[]

  @@map("orders")
  @@index([merchantId, createdAt])
}

model OrderItem {
  id           String  @id @default(uuid())
  orderId      String  @map("order_id")
  productId    String  @map("product_id")
  productName  String  @map("product_name")
  quantity     Int
  price        Decimal @db.Decimal(10, 2)
  total        Decimal @db.Decimal(10, 2)

  order        Order   @relation(fields: [orderId], references: [id])

  @@map("order_items")
}

model Merchant {
  id          String   @id @default(uuid())
  userId      String   @unique @map("user_id")
  name        String
  slug        String?  @unique
  isActive    Boolean  @default(true) @map("is_active")
  createdAt   DateTime @default(now()) @map("created_at")

  orders      Order[]
  products    Product[]

  @@map("merchants")
}

// ... 其他模型
```

**使用 Prisma Client 查询**：
```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  }
});

// 类型安全的查询
const orders = await prisma.order.findMany({
  where: {
    merchantId: 'merchant_123',
    status: 'paid',
    createdAt: {
      gte: new Date('2024-01-01')
    }
  },
  include: {
    items: true,
    merchant: true
  }
});
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
3. bi-backend 使用 Fastify preHandler 或 Express middleware 调用 user-auth 验证 token
4. 验证通过后，根据 user_id 查询 `merchants` 表获取 `merchant_id`
5. 所有 BI 查询都自动限定在该商家的数据范围内

**TypeScript 实现示例**：
```typescript
// src/middleware/auth.ts
import { FastifyRequest, FastifyReply } from 'fastify';
import axios from 'axios';
import { prisma } from '../db';

interface UserInfo {
  userId: string;
  role: 'merchant' | 'admin';
  scopes: string[];
}

declare module 'fastify' {
  interface FastifyRequest {
    user: UserInfo & { merchantId?: string };
  }
}

export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const token = request.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return reply.code(401).send({ error: 'Unauthorized' });
  }

  try {
    // 调用 user-auth 验证 token（POST JSON）
    // API: POST https://auth.optima.shop/api/v1/auth/verify
    const { data } = await axios.post(
      `${process.env.AUTH_BASE_URL}/api/v1/auth/verify`,
      {
        token: token,
        required_scope: null // bi-backend 不需要特定 scope
      }
    );

    // 检查 token 是否有效
    if (!data.valid) {
      return reply.code(401).send({
        error: 'Invalid token',
        detail: data.error
      });
    }

    const userInfo: UserInfo = {
      userId: data.user_id,
      role: data.role, // customer, merchant, admin
      scopes: data.scopes || []
    };

    // 如果是商家，查询 merchant_id
    if (userInfo.role === 'merchant') {
      const merchant = await prisma.merchant.findUnique({
        where: { userId: userInfo.userId },
        select: { id: true }
      });

      if (!merchant) {
        return reply.code(404).send({ error: 'Merchant not found' });
      }

      request.user = { ...userInfo, merchantId: merchant.id };
    } else {
      request.user = userInfo;
    }
  } catch (error: any) {
    console.error('Auth middleware error:', error.message);
    return reply.code(401).send({ error: 'Token verification failed' });
  }
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

**Prisma 查询示例**：
```typescript
// 销售数据聚合查询
const salesStats = await prisma.order.aggregate({
  where: {
    merchantId: merchant_id,
    status: 'paid',
    createdAt: {
      gte: startDate
    }
  },
  _sum: {
    amountTotal: true
  },
  _count: true,
  _avg: {
    amountTotal: true
  }
});

const result = {
  totalRevenue: salesStats._sum.amountTotal,
  totalOrders: salesStats._count,
  averageOrderValue: salesStats._avg.amountTotal
};

// 商品销售排行（使用 Prisma 原生查询）
const topProducts = await prisma.$queryRaw<Array<{
  productName: string;
  revenue: number;
  quantity: number;
}>>`
  SELECT
    oi.product_name as "productName",
    SUM(oi.total) as revenue,
    SUM(oi.quantity) as quantity
  FROM order_items oi
  JOIN orders o ON oi.order_id = o.id
  WHERE o.merchant_id = ${merchant_id}
    AND o.status = 'paid'
  GROUP BY oi.product_name
  ORDER BY revenue DESC
  LIMIT 10
`;

// 或使用 Prisma 的 groupBy (如果支持)
const topProductsByGroupBy = await prisma.orderItem.groupBy({
  by: ['productName'],
  where: {
    order: {
      merchantId: merchant_id,
      status: 'paid'
    }
  },
  _sum: {
    total: true,
    quantity: true
  },
  orderBy: {
    _sum: {
      total: 'desc'
    }
  },
  take: 10
});
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

### 3.6 查询优化策略与性能架构

> ⚠️ **重要更新**：根据[专家评审](./expert-review.md)（评分 6.7/10），直接在 OLTP 数据库执行复杂分析查询存在严重性能问题。必须实施 **ClickHouse OLAP + CDC 实时同步**架构。

#### 3.6.1 性能问题识别

**OLTP/OLAP 混用风险**：
- ❌ **问题**：直接在 commerce-backend OLTP 数据库执行复杂聚合查询
- ❌ **影响**：2-5 秒查询时间，影响商家业务（订单、支付）
- ❌ **扩展性**：商家数增长后压力线性增长

**示例慢查询**：
```sql
-- ❌ 当前方案（慢：2-5 秒）
SELECT
  DATE(created_at) as date,
  SUM(amount_total) as revenue,
  COUNT(*) as orders
FROM orders
WHERE merchant_id = 'xxx'
  AND created_at >= NOW() - INTERVAL '90 days'
GROUP BY DATE(created_at);
-- 执行时间: 2-5 秒（全表扫描 + 实时聚合）
```

#### 3.6.2 解决方案：ClickHouse OLAP + CDC（🔴 P0 - 必须实施）

**架构设计**（详见 [ADR-006: ClickHouse + CDC](./architecture/adr-006-clickhouse-olap.md)）：

```
PostgreSQL (OLTP)
  ↓ WAL (Write-Ahead Log)
Debezium CDC (Change Data Capture)
  ↓ 捕获变更
Kafka Topics (消息队列，10 分区)
  ↓ 流式传输
ClickHouse Kafka Engine (消费)
  ↓ 写入
ClickHouse Raw Tables (ReplacingMergeTree)
  ↓ 自动聚合
ClickHouse Materialized Views (SummingMergeTree)
  ↓ 查询（< 50ms）
bi-backend
```

**数据流延迟**：**< 1 秒**（PostgreSQL → ClickHouse）

**多层查询架构**：
```
查询请求
  ↓
L1: 内存缓存 (1 分钟) ← 极热数据
  ↓ miss
L2: Redis 缓存 (5 分钟) ← 热数据
  ↓ miss
L3: ClickHouse 物化视图 (实时) ← 温数据（查询这一层！）
  ↓ miss
L4: ClickHouse 原始表 (实时) ← 冷数据（fallback）
```

**ClickHouse 表设计**：

1. **orders 表**（原始订单数据）
   ```sql
   CREATE TABLE orders (
       id UUID,
       merchant_id UUID,
       order_number String,
       customer_email String,
       status String,
       subtotal Decimal(10, 2),
       amount_total Decimal(10, 2),
       created_at DateTime,
       updated_at DateTime,
       _kafka_offset Int64,
       _kafka_partition Int16,
       _kafka_timestamp DateTime
   )
   ENGINE = ReplacingMergeTree(updated_at)  -- 自动处理 UPDATE
   PARTITION BY toYYYYMM(created_at)        -- 按月分区
   ORDER BY (merchant_id, created_at, id);  -- 排序键

   -- 分区裁剪：查询单个月份只扫描一个分区
   -- 主键索引：merchant_id 快速定位
   ```

2. **daily_sales_mv**（日销售物化视图）
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

3. **hourly_sales_mv**（小时销售物化视图）
4. **product_stats_mv**（商品销售统计）
5. **customer_stats_mv**（客户行为统计）
6. **merchant_overview_mv**（商家概览）

完整表结构详见 [ADR-006](./architecture/adr-006-clickhouse-olap.md)。

**查询示例（优化后）**：
```sql
-- ✅ 查询 ClickHouse 物化视图（快：10-50ms）
SELECT date, total_revenue, order_count
FROM daily_sales_mv
WHERE merchant_id = 'xxx'
  AND date >= today() - 90
ORDER BY date DESC;
-- 执行时间: 10-50ms（列式存储 + 预聚合 + 分区裁剪）
```

**性能提升**：**50-1000 倍**（2-5s → 10-50ms）

#### 3.6.3 CDC 实时同步策略

**Debezium CDC 配置**：
```json
{
  "name": "commerce-postgres-connector",
  "config": {
    "connector.class": "io.debezium.connector.postgresql.PostgresConnector",
    "database.hostname": "commerce-db",
    "database.port": "5432",
    "database.user": "debezium_user",
    "database.dbname": "commerce",
    "database.server.name": "commerce",
    "table.include.list": "public.orders,public.order_items,public.products",
    "plugin.name": "pgoutput",
    "publication.name": "dbz_publication",
    "slot.name": "debezium_slot"
  }
}
```

**Kafka Topics**：
- `commerce.public.orders` - 订单变更
- `commerce.public.order_items` - 订单明细变更
- `commerce.public.products` - 商品变更
- **分区数**：10（提高并行度）
- **保留时长**：7 天

**ClickHouse Kafka Engine**：
```sql
CREATE TABLE orders_kafka (
    -- 与 orders 表相同字段 --
)
ENGINE = Kafka()
SETTINGS
    kafka_broker_list = 'kafka:9092',
    kafka_topic_list = 'commerce.public.orders',
    kafka_group_name = 'clickhouse_consumer',
    kafka_format = 'JSONEachRow',
    kafka_num_consumers = 4;  -- 并行消费

-- 物化视图：将 Kafka 数据写入 orders 表
CREATE MATERIALIZED VIEW orders_consumer TO orders AS
SELECT * FROM orders_kafka;
```

**数据一致性**：
- **延迟**：< 1 秒（PostgreSQL INSERT/UPDATE → ClickHouse）
- **保证**：最终一致性（ReplacingMergeTree 自动去重）
- **顺序**：基于 `updated_at` 字段保证最新版本

#### 3.6.4 ClickHouse 优化策略

```sql
-- 1. ClickHouse 原始表主键（自动索引）
-- ORDER BY (merchant_id, created_at, id)
-- 支持快速查询：WHERE merchant_id = 'xxx' AND created_at >= '2024-01-01'

-- 2. ClickHouse 分区裁剪
-- PARTITION BY toYYYYMM(created_at)
-- 查询单月数据只扫描一个分区（10-100x 加速）

-- 3. ClickHouse 物化视图自动更新
-- 新数据写入 orders 表 → 自动触发物化视图更新（< 1 秒）

-- 4. ClickHouse 存储压缩
-- 列式存储 + LZ4 压缩 → 10:1 压缩比
-- 1 亿行订单 ≈ 10GB 存储
```

完整优化清单详见 [性能优化指南](./performance-optimization.md)。

### 3.7 多层缓存架构（P0 - 必须）

#### 3.7.1 缓存层级

```typescript
// src/services/cache.service.ts
import NodeCache from 'node-cache';
import { Redis } from 'ioredis';

export class CacheService {
  private memCache: NodeCache;  // L1: 内存缓存
  private redis: Redis;          // L2: Redis 缓存

  constructor() {
    this.memCache = new NodeCache({ stdTTL: 60 });  // 1 分钟
    this.redis = new Redis(process.env.REDIS_URL);
  }

  async get<T>(key: string): Promise<T | null> {
    // L1: 内存缓存（极热数据）
    const memData = this.memCache.get<T>(key);
    if (memData) {
      logger.debug({ cache: 'L1_HIT', key });
      return memData;
    }

    // L2: Redis 缓存（热数据）
    const redisData = await this.redis.get(key);
    if (redisData) {
      const data = JSON.parse(redisData) as T;
      this.memCache.set(key, data);  // 回填 L1
      logger.debug({ cache: 'L2_HIT', key });
      return data;
    }

    logger.debug({ cache: 'MISS', key });
    return null;  // L3/L4: 查询数据库
  }

  async set<T>(key: string, data: T, ttl: number = 300): Promise<void> {
    this.memCache.set(key, data);
    await this.redis.set(key, JSON.stringify(data), 'EX', ttl);
  }
}
```

#### 3.7.2 防止缓存击穿（分布式锁）

```typescript
async getSalesDataWithLock(merchantId: string, days: number) {
  const cacheKey = `sales:${merchantId}:${days}`;
  const lockKey = `lock:${cacheKey}`;

  // 尝试获取缓存
  let data = await this.cacheService.get(cacheKey);
  if (data) return data;

  // 获取分布式锁（防止并发查询数据库）
  const lock = await this.redis.set(lockKey, '1', 'EX', 10, 'NX');

  if (lock) {
    try {
      // 获取锁成功，查询数据库
      data = await this.querySalesFromDB(merchantId, days);
      await this.cacheService.set(cacheKey, data, 300);
      return data;
    } finally {
      await this.redis.del(lockKey);
    }
  } else {
    // 获取锁失败，等待后重试
    await sleep(50);
    return this.getSalesDataWithLock(merchantId, days);
  }
}
```

#### 3.7.3 查询优先级

```typescript
import { createClient } from '@clickhouse/client';

const clickhouse = createClient({
  host: process.env.CLICKHOUSE_HOST,
  username: process.env.CLICKHOUSE_USER,
  password: process.env.CLICKHOUSE_PASSWORD,
});

async getSalesData(merchantId: string, days: number) {
  // L1/L2 缓存
  const cacheKey = `sales:${merchantId}:${days}`;
  const cached = await this.cacheService.get(cacheKey);
  if (cached) {
    logger.debug({ cache: 'L1_or_L2_HIT', key: cacheKey });
    return cached;
  }

  // L3: 优先查询 ClickHouse 物化视图（预聚合数据）
  const result = await clickhouse.query({
    query: `
      SELECT
        date,
        total_revenue,
        order_count,
        avg_order_value,
        unique_customers
      FROM daily_sales_mv
      WHERE merchant_id = {merchantId:UUID}
        AND date >= today() - {days:UInt32}
      ORDER BY date DESC
    `,
    query_params: { merchantId, days },
    format: 'JSONEachRow',
  });

  const data = await result.json();

  // 缓存 5 分钟
  await this.cacheService.set(cacheKey, data, 300);
  logger.debug({
    dataSource: 'CLICKHOUSE_MV',
    merchantId,
    days,
    rowCount: data.length
  });

  return data;
}

// 如果需要实时数据（今日订单），查询 L4: ClickHouse 原始表
async getTodaySalesData(merchantId: string) {
  const result = await clickhouse.query({
    query: `
      SELECT
        sum(amount_total) as total_revenue,
        count() as order_count,
        avg(amount_total) as avg_order_value,
        uniq(customer_email) as unique_customers
      FROM orders
      WHERE merchant_id = {merchantId:UUID}
        AND toDate(created_at) = today()
        AND status IN ('paid', 'delivered', 'completed')
    `,
    query_params: { merchantId },
    format: 'JSONEachRow',
  });

  return await result.json();
}
```

### 3.8 性能监控与告警

**关键指标**（详见 [性能优化指南](./performance-optimization.md)）：

| 指标 | 目标 | 警告阈值 | 严重阈值 |
|------|------|---------|---------|
| API 响应时间 (P50) | < 100ms | > 200ms | > 500ms |
| API 响应时间 (P99) | < 500ms | > 1s | > 2s |
| 缓存命中率 | > 70% | < 50% | < 30% |
| ClickHouse 查询时间 | < 50ms | > 100ms | > 200ms |
| CDC 数据延迟 | < 1s | > 3s | > 10s |
| Kafka 消费延迟 | < 500ms | > 2s | > 5s |

**监控实现**：
```typescript
// src/middleware/metrics.ts
export async function metricsMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const start = Date.now();

  reply.addHook('onSend', async () => {
    const duration = Date.now() - start;

    logger.info({
      type: 'api_metrics',
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      duration,
      merchantId: request.user?.merchantId,
      dataSource: request.dataSource,  // 'CLICKHOUSE_MV' | 'CLICKHOUSE_RAW' | 'CACHE'
      cacheHit: request.cacheHit,      // 'L1' | 'L2' | null
    });

    // 慢查询告警（ClickHouse 架构下阈值更低）
    if (duration > 500) {
      logger.warn({
        type: 'slow_query',
        duration,
        url: request.url,
        dataSource: request.dataSource,
      });
    }

    // ClickHouse 查询时间监控
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
    // 查询 PostgreSQL 最新订单时间
    const pgLatest = await prisma.order.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true }
    });

    // 查询 ClickHouse 最新订单时间
    const chResult = await clickhouse.query({
      query: `SELECT max(created_at) as latest FROM orders`,
      format: 'JSONEachRow',
    });
    const chLatest = await chResult.json();

    // 计算延迟
    const latency = pgLatest.createdAt - chLatest[0].latest;

    logger.info({
      type: 'cdc_latency',
      latency_ms: latency,
      pg_latest: pgLatest.createdAt,
      ch_latest: chLatest[0].latest,
    });

    // 延迟告警
    if (latency > 3000) {
      logger.warn({
        type: 'cdc_latency_alert',
        latency_ms: latency,
      });
    }
  }

  // Kafka 消费延迟监控
  async monitorKafkaLag() {
    // 使用 Kafka Admin API 查询消费者组延迟
    // (具体实现取决于 Kafka 客户端库)
  }
}
```

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
```typescript
// 使用 pino 记录结构化日志
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: { colorize: true }
  }
});

logger.info({
  event: 'sales_query',
  merchantId: 'merchant_123',
  period: '7d',
  executionTimeMs: 234,
  cacheHit: true
});

logger.error({
  event: 'api_error',
  endpoint: '/api/v1/sales',
  error: 'Database connection failed',
  stack: error.stack
});
```

## 7. 安全设计

### 7.1 认证授权

#### 7.1.1 角色定义
```typescript
enum UserRole {
  MERCHANT = 'merchant',  // 商家角色
  ADMIN = 'admin'         // 平台管理员
}

interface CurrentUser {
  userId: string;
  role: UserRole;
  merchantId?: string;
  permissions: string[];
}
```

#### 7.1.2 权限矩阵

| 功能模块 | 商家 (merchant) | 管理员 (admin) |
|---------|----------------|---------------|
| 查看自己店铺数据 | ✅ | ✅ |
| 查看其他商家数据 | ❌ | ✅ |
| 查看平台整体数据 | ❌ | ✅ |
| 商家分析（platform merchants） | ❌ | ✅ |
| 订阅分析（platform subscription） | ❌ | ✅ |
| 平台财务（platform revenue） | ❌ | ✅ |

#### 7.1.3 认证流程（已在 3.2.1 中提供 TypeScript 实现）

参见上文 3.2.1 节的 TypeScript authMiddleware 实现。

#### 7.1.4 数据隔离（Row-Level Security）

**设计方案**：应用层权限过滤（bi-backend 中间件）

详细设计参见：[ADR-008: 数据权限隔离](./architecture/adr-008-row-level-security.md)

##### 统一 Query Builder

```typescript
// src/utils/queryBuilder.ts
import { User } from '../types';

export class SecureQueryBuilder {
  private merchantId?: string;
  private role: string;

  constructor(user: User) {
    this.merchantId = user.merchantId;
    this.role = user.role;
  }

  /**
   * 商家查询：自动注入 WHERE merchant_id = ?
   */
  buildMerchantQuery(table: string, conditions: string = ''): string {
    if (!this.merchantId) {
      throw new Error('merchantId required for merchant query');
    }

    const whereClause = conditions
      ? `WHERE merchant_id = '${this.merchantId}' AND (${conditions})`
      : `WHERE merchant_id = '${this.merchantId}'`;

    return `SELECT * FROM ${table} ${whereClause}`;
  }

  /**
   * 管理员查询：验证权限
   */
  buildAdminQuery(table: string, conditions: string = ''): string {
    if (this.role !== 'admin') {
      throw new Error('Admin role required');
    }

    return `SELECT * FROM ${table} ${conditions ? 'WHERE ' + conditions : ''}`;
  }
}
```

##### 路由实现（ClickHouse）

```typescript
// src/routes/sales.ts
import { FastifyInstance } from 'fastify';
import { clickhouse } from '../db/clickhouse';
import { authMiddleware } from '../middleware/auth';
import { requireAdmin } from '../middleware/permissions';
import { SecureQueryBuilder } from '../utils/queryBuilder';

export async function salesRoutes(app: FastifyInstance) {
  // 商家查询销售数据（自动过滤）
  app.get('/api/v1/sales/daily', {
    preHandler: authMiddleware
  }, async (request, reply) => {
    const { days = 7 } = request.query as { days?: number };
    const qb = new SecureQueryBuilder(request.user);

    // 查询 ClickHouse 物化视图（自动加 WHERE merchant_id）
    const query = `
      SELECT
        date,
        total_revenue,
        order_count,
        avg_order_value,
        unique_customers
      FROM daily_sales_mv
      WHERE merchant_id = {merchantId:UUID}
        AND date >= today() - {days:UInt32}
      ORDER BY date DESC
    `;

    const result = await clickhouse.query({
      query,
      query_params: {
        merchantId: request.user.merchantId,
        days
      },
      format: 'JSONEachRow'
    });

    return { data: await result.json() };
  });

  // 平台查询 GMV（需要管理员权限）
  app.get('/api/v1/platform/gmv', {
    preHandler: [authMiddleware, requireAdmin]
  }, async (request, reply) => {
    const qb = new SecureQueryBuilder(request.user);
    const { days = 30 } = request.query as { days?: number };

    // 管理员查询：不过滤 merchant_id，聚合所有商家
    const query = `
      SELECT
        date,
        sum(total_revenue) as platform_gmv,
        sum(order_count) as total_orders,
        avg(avg_order_value) as avg_order_value
      FROM daily_sales_mv
      WHERE date >= today() - {days:UInt32}
      GROUP BY date
      ORDER BY date DESC
    `;

    const result = await clickhouse.query({
      query,
      query_params: { days },
      format: 'JSONEachRow'
    });

    return { data: await result.json() };
  });

  // 管理员查看指定商家数据
  app.get('/api/v1/sales/merchant/:merchantId', {
    preHandler: [authMiddleware, requireAdmin]
  }, async (request, reply) => {
    const { merchantId } = request.params as { merchantId: string };
    const { days = 7 } = request.query as { days?: number };

    // 管理员可以查询任意商家数据
    const query = `
      SELECT * FROM daily_sales_mv
      WHERE merchant_id = {merchantId:UUID}
        AND date >= today() - {days:UInt32}
      ORDER BY date DESC
    `;

    const result = await clickhouse.query({
      query,
      query_params: { merchantId, days },
      format: 'JSONEachRow'
    });

    return { data: await result.json() };
  });
}
```

##### 审计日志

```typescript
// src/middleware/audit.ts
import { FastifyRequest } from 'fastify';
import { logger } from '../utils/logger';

export async function auditMiddleware(request: FastifyRequest) {
  logger.info('data_access', {
    userId: request.user.userId,
    merchantId: request.user.merchantId,
    role: request.user.role,
    resource: request.routerPath,
    method: request.method,
    query: request.query,
    timestamp: new Date().toISOString(),
  });
}
```

#### 7.1.5 权限验证中间件
```typescript
// src/middleware/permissions.ts
import { FastifyRequest, FastifyReply } from 'fastify';
import { UserRole } from '../types';

/**
 * 要求管理员权限
 */
export async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply
) {
  if (request.user.role !== UserRole.ADMIN) {
    return reply.code(403).send({
      error: 'Admin role required'
    });
  }
}

/**
 * 要求特定权限
 */
export function requirePermission(permission: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user.permissions.includes(permission)) {
      return reply.code(403).send({
        error: `Permission '${permission}' required`
      });
    }
  };
}

/**
 * 使用示例
 */
app.get('/api/v1/admin/merchants', {
  preHandler: [authMiddleware, requireAdmin]
}, async (request, reply) => {
  // 只有管理员能访问
});

app.get('/api/v1/sensitive-data', {
  preHandler: [authMiddleware, requirePermission('data:read:sensitive')]
}, async (request, reply) => {
  // 需要特定权限
});
```

### 7.2 数据安全
- **HTTPS 传输**：所有 API 调用使用 HTTPS
- **SQL 注入防护**：使用 Prisma ORM，自动参数化查询
- **请求频率限制**：防止 API 滥用（@fastify/rate-limit）
- **只读访问**：bi-backend 使用只读数据库用户，无法修改 commerce 数据

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
- **TypeScript**：Strict mode 开启
- **Linting**：ESLint + @typescript-eslint
- **Formatting**：Prettier
- **Type Checking**：TypeScript 编译器 (tsc)
- **Git Commit**：Conventional Commits 规范

### 9.2 API 规范
- RESTful 设计
- 统一响应格式（zod schemas）
- 错误码标准化
- OpenAPI 自动生成（@fastify/swagger）

### 9.3 文档规范
- **API 文档**：Swagger/OpenAPI（/docs）
- **CLI 命令文档**：`bi-cli --help`
- **架构决策记录**（ADR）：docs/adr/

### 9.4 项目结构
```
optima-bi/
├── packages/
│   ├── bi-cli/              # TypeScript CLI 工具
│   │   ├── src/
│   │   │   ├── index.ts     # CLI 入口
│   │   │   ├── commands/    # 各个命令实现
│   │   │   │   ├── sales.ts
│   │   │   │   ├── customer.ts
│   │   │   │   ├── platform.ts
│   │   │   │   └── auth.ts
│   │   │   ├── client/      # HTTP 客户端
│   │   │   │   └── api-client.ts
│   │   │   ├── config/      # 配置管理
│   │   │   │   └── config.ts
│   │   │   └── types/       # TypeScript 类型
│   │   ├── tests/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── README.md
│   │
│   └── bi-backend/          # Fastify 后端服务
│       ├── src/
│       │   ├── routes/      # API 路由
│       │   │   ├── sales.ts
│       │   │   ├── customers.ts
│       │   │   ├── inventory.ts
│       │   │   ├── finance.ts
│       │   │   ├── logistics.ts
│       │   │   └── platform.ts
│       │   ├── services/    # 业务逻辑
│       │   │   ├── sales.service.ts
│       │   │   ├── customer.service.ts
│       │   │   └── cache.service.ts
│       │   ├── middleware/  # 中间件
│       │   │   ├── auth.ts
│       │   │   └── permissions.ts
│       │   ├── types/       # TypeScript 类型
│       │   │   └── index.ts
│       │   ├── db/          # 数据库配置
│       │   │   └── prisma.ts
│       │   ├── utils/       # 工具函数
│       │   └── app.ts       # Fastify 应用
│       ├── prisma/
│       │   └── schema.prisma  # Prisma schema
│       ├── tests/
│       ├── package.json
│       ├── tsconfig.json
│       ├── Dockerfile
│       └── README.md
├── docs/                    # 文档
├── docker-compose.yml
└── README.md
```

## 10. 附录

### 10.1 技术选型理由

**为什么选择 TypeScript + Fastify**：
- **全栈类型安全**：TypeScript 在编译时提供完整的类型检查，减少运行时错误
- **前后端统一**：未来如需 Web 界面，可共享类型定义和业务逻辑
- **现代生态**：Node.js 生态丰富，工具链成熟（vitest、prettier、eslint）
- **开发效率**：Fastify 提供自动 schema validation、插件系统、自动 API 文档（@fastify/swagger）
- **性能优异**：Fastify 是最快的 Node.js 框架之一，比 Express 快约 2 倍
- **Prisma ORM**：类型安全的 ORM，自动生成 TypeScript 类型，优秀的开发体验

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
