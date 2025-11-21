# Optima BI - 研究总结与架构决策

> 本文档总结了对 Optima Commerce 生态系统的研究发现，以及对 optima-bi 设计的关键影响

## 📚 目录

- [已研究的 Repo](#已研究的-repo)
- [技术栈对比](#技术栈对比)
- [认证体系](#认证体系)
- [数据模型分析](#数据模型分析)
- [架构决策记录](#架构决策记录)
- [关键 API 接口](#关键-api-接口)
- [BI 分析维度设计](#bi-分析维度设计)

---

## 已研究的 Repo

### 1. commerce-backend
**仓库**: https://github.com/Optima-Chat/commerce-backend

**技术栈**:
- Python 3.11 + FastAPI
- SQLAlchemy 2.0 (ORM)
- PostgreSQL 14+
- Alembic (数据库迁移)

**核心功能**:
- 商品管理（Product, Variant）
- 订单处理（Order, OrderItem）
- 支付集成（Stripe）
- 物流跟踪（EasyShip）
- 商户管理（Merchant, MerchantTransfer）
- 订阅管理（Subscription）

**数据模型**（47 个）:
```python
# 核心业务模型
Order, OrderItem, Product, Merchant, MerchantTransfer,
Subscription, Review, InventoryLog, OrderStatusHistory

# 订单状态枚举（13 个状态）
pending, paid, confirmed, processing, awaiting_shipment,
shipped, in_transit, out_for_delivery, delivered,
completed, cancelled, refunded, failed, returned
```

**关键发现**:
- 商家数据通过 `merchant_id` 隔离
- 订单包含完整的物流和支付信息
- 支持 Stripe 支付（`stripe_payment_intent_id`）
- 转账记录包含平台手续费（`platform_fee`）

---

### 2. user-auth
**仓库**: https://github.com/Optima-Chat/user-auth

**技术栈**:
- Python 3.11 + FastAPI
- PostgreSQL + Redis
- JWT (RS256) + BCrypt
- OAuth 2.0 (4 种授权流程)

**核心功能**:
- OAuth 2.0 标准认证
- Device Flow（CLI 工具专用）
- 第三方登录（Google/GitHub/Apple）
- 角色权限管理
- Token 黑名单（Redis）
- 委托令牌（Delegated Tokens）

**用户角色**:
```python
class UserRole(str, Enum):
    CUSTOMER = "customer"  # 买家
    MERCHANT = "merchant"  # 商家
    ADMIN = "admin"        # 平台管理员
```

**关键 API**:
| 端点 | 方法 | 用途 |
|------|------|------|
| `/api/v1/auth/verify` | POST | Token 验证（服务间调用） |
| `/oauth/device` | POST | 请求 Device Code |
| `/oauth/token` | POST | 获取/刷新 Token |
| `/oauth/authorize/{provider}` | GET | 第三方登录授权 |
| `/users/me` | GET | 获取当前用户信息 |

**Token 验证请求**:
```typescript
POST /api/v1/auth/verify
Content-Type: application/json

{
  "token": "eyJhbGciOiJSUzI1NiIs...",
  "required_scope": null  // 可选
}
```

**Token 验证响应**:
```typescript
{
  "valid": true,
  "user_id": "user_abc123",
  "role": "merchant",  // customer | merchant | admin
  "scopes": ["read", "write"],
  "delegated": false,
  "error": null
}
```

---

### 3. commerce-cli
**仓库**: https://github.com/Optima-Chat/commerce-cli

**技术栈**:
- TypeScript + Node.js 18+
- Commander.js (CLI 框架)
- conf (配置加密存储)
- axios (HTTP 客户端)
- chalk (彩色输出)

**核心特性**:
- ✅ OAuth 2.0 Device Flow 认证
- ✅ JSON 默认输出（AI 友好）
- ✅ `--pretty` 选项（彩色表格）
- ✅ 多环境支持（production/stage/development）
- ✅ Token 自动刷新
- ✅ 16 个功能模块，95+ 命令

**配置目录**:
```
~/.optima/commerce-cli/
├── config-prod.json      # Production 环境（加密）
├── config-stage.json     # Stage 环境
├── config-dev.json       # Development 环境
└── current-env.json      # 当前激活环境
```

**配置文件格式**:
```json
{
  "tokens": {
    "access_token": "eyJhbGci...",
    "refresh_token": "eyJhbGci...",
    "expires_in": 3600,
    "expires_at": 1706789400
  },
  "user": {
    "id": "user_abc123",
    "email": "merchant@example.com",
    "name": "John Doe",
    "role": "merchant"
  },
  "api_url": "https://api.optima.shop",
  "auth_url": "https://auth.optima.shop"
}
```

**Device Flow 认证流程**:
```typescript
// 1. 请求 Device Code
POST /oauth/device
Body: { client_id: "commerce-cli-xxx" }
Response: {
  device_code: "xxx",
  user_code: "ABCD-1234",
  verification_uri: "https://auth.optima.shop/device",
  verification_uri_complete: "https://auth.optima.shop/device?user_code=ABCD-1234",
  expires_in: 600,
  interval: 5
}

// 2. 用户在浏览器中授权

// 3. 轮询获取 Token
POST /oauth/token
Body: {
  grant_type: "urn:ietf:params:oauth:grant-type:device_code",
  device_code: "xxx",
  client_id: "commerce-cli-xxx"
}
Response: {
  access_token: "eyJhbGci...",
  refresh_token: "eyJhbGci...",
  expires_in: 3600,
  token_type: "Bearer"
}
```

**输出格式设计**:
```bash
# JSON 模式（默认，AI 友好）
$ commerce product list --limit 2
{
  "success": true,
  "data": {
    "products": [...],
    "total": 2
  }
}

# Pretty 模式（人类可读）
$ commerce product list --limit 2 --pretty
┌────────────────────────────────────┐
│  商品列表                           │
├────────────────────────────────────┤
│  总数: 2                           │
└────────────────────────────────────┘
┌──────┬──────────┬───────┬───────┐
│ ID   │ 名称     │ 价格  │ 库存  │
├──────┼──────────┼───────┼───────┤
│ p123 │ 商品A    │ $99   │ 10    │
│ p456 │ 商品B    │ $199  │ 5     │
└──────┴──────────┴───────┴───────┘
```

**环境配置**:
```typescript
const ENV_CONFIG = {
  production: {
    authUrl: 'https://auth.optima.shop',
    apiUrl: 'https://api.optima.shop',
    clientId: 'optima-cli-cwkbnadr',
  },
  stage: {
    authUrl: 'https://auth-stage.optima.shop',
    apiUrl: 'https://api-stage.optima.shop',
    clientId: 'optima-cli-c5ljkuwx',
  },
  development: {
    authUrl: 'https://auth.optima.chat',
    apiUrl: 'https://api.optima.chat',
    clientId: 'optima-cli-q1hiavyg',
  },
};
```

---

### 4. optima-store
**仓库**: https://github.com/Optima-Chat/optima-store

**技术栈**:
- Next.js 14 (App Router)
- React 18 + TypeScript
- Tailwind CSS + Headless UI
- Zustand (状态管理)
- TanStack Query (服务端状态)

**核心功能**:
- 商品浏览（支持 variants）
- 购物车和结账
- Stripe 支付集成
- EasyShip 物流跟踪
- AI 导购（MCP Host）
- Google OAuth 登录
- 订单追踪（3-tier guest tracking）

**API 集成**:
- **开发环境**: `http://dev.optima.chat:8280`
- **生产环境**: `https://api.optima.shop`
- **认证**: Bearer Token (存储在 localStorage)

**关键类型定义**:
```typescript
// 商品变体
interface ProductVariant {
  id: string;
  sku: string;
  name?: string;
  price: string;
  currency?: string;
  stock_quantity: number;
  variant_attributes: Record<string, string>; // { color: "red", size: "M" }
  available: boolean;
}

// 订单状态（13 个）
type OrderStatus =
  | 'pending' | 'paid' | 'confirmed' | 'processing'
  | 'awaiting_shipment' | 'shipped' | 'in_transit'
  | 'out_for_delivery' | 'delivered' | 'completed'
  | 'cancelled' | 'refunded' | 'failed' | 'returned';

// 地址格式（EasyShip 标准）
interface Address {
  line_1: string;                 // 必需，≤35字符
  line_2?: string;                // 可选，≤35字符
  city: string;                   // 必需，≤200字符
  state?: string;                 // 可选，≤200字符
  postal_code: string;            // 必需，≤20字符
  country_alpha2: string;         // 必需，2字符 ISO
  contact_name: string;           // 必需，≤50字符
  contact_phone: string;          // 必需，≤20字符
  contact_email: string;          // 必需，≤50字符
}
```

**API 客户端认证**:
```typescript
// src/lib/api-client.ts
private getAuthHeaders(): Record<string, string> {
  if (typeof window !== 'undefined') {
    try {
      const authState = localStorage.getItem('optima-auth');
      if (authState) {
        const { state } = JSON.parse(authState);
        if (state?.accessToken) {
          return {
            'Authorization': `Bearer ${state.accessToken}`,
          };
        }
      }
    } catch (error) {
      console.warn('Failed to get auth headers:', error);
    }
  }
  return {};
}
```

---

## 技术栈对比

| 模块 | 后端框架 | 前端/CLI | 数据库 | 认证方式 | 配置存储 |
|------|----------|----------|--------|----------|----------|
| **commerce-backend** | FastAPI (Python) | - | PostgreSQL | user-auth | .env |
| **user-auth** | FastAPI (Python) | Next.js (Admin) | PostgreSQL + Redis | OAuth 2.0 | .env |
| **optima-store** | - | Next.js 14 (React) | - | Google OAuth | localStorage |
| **commerce-cli** | - | TypeScript CLI | - | Device Flow | conf (加密) |
| **optima-bi** | **Fastify (TypeScript)** | **TypeScript CLI** | **PostgreSQL (只读)** | **Device Flow** | **conf (加密)** |

**关键决策**:
- ✅ **bi-backend**: 使用 **TypeScript + Fastify**（而非 Python + FastAPI）
  - 原因：全栈类型安全，前后端统一，Prisma ORM 优秀
- ✅ **bi-cli**: 参考 **commerce-cli** 的认证和输出设计
  - OAuth 2.0 Device Flow
  - JSON 默认输出 + `--pretty` 选项
  - 多环境支持
- ✅ **数据访问**: 直接连接 **commerce-backend PostgreSQL**（只读）
  - 避免 API 调用开销
  - 实时数据，无延迟
  - 使用 Prisma 从数据库生成类型

---

## 认证体系

### 认证流程对比

| 用户类型 | 认证方式 | 使用场景 | Token 存储 |
|---------|---------|---------|-----------|
| **买家** | Google OAuth | optima-store | localStorage |
| **买家** | Email OTP | optima-store | localStorage |
| **商家** | OAuth Device Flow | commerce-cli | ~/.optima/commerce-cli/config.json |
| **管理员** | OAuth Device Flow | commerce-cli | ~/.optima/commerce-cli/config.json |
| **BI 用户** | **OAuth Device Flow** | **bi-cli** | **~/.optima/bi-cli/config.json** |

### 统一认证端点

**user-auth 服务**:
- **开发环境**: `https://auth.optima.chat`
- **Stage 环境**: `https://auth-stage.optima.shop`
- **生产环境**: `https://auth.optima.shop`

**Token 验证流程**（bi-backend → user-auth）:
```mermaid
sequenceDiagram
    participant CLI as bi-cli
    participant Backend as bi-backend
    participant Auth as user-auth
    participant DB as commerce DB

    CLI->>Backend: GET /api/v1/sales<br/>Authorization: Bearer <token>
    Backend->>Auth: POST /api/v1/auth/verify<br/>{token, required_scope}
    Auth-->>Backend: {valid, user_id, role, scopes}

    alt role == merchant
        Backend->>DB: SELECT id FROM merchants<br/>WHERE user_id = ?
        DB-->>Backend: merchant_id
    end

    Backend->>DB: SELECT * FROM orders<br/>WHERE merchant_id = ?
    DB-->>Backend: orders data
    Backend-->>CLI: JSON response
```

### bi-backend 认证中间件

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
    // 调用 user-auth 验证 token
    const { data } = await axios.post(
      `${process.env.AUTH_BASE_URL}/api/v1/auth/verify`,
      { token, required_scope: null }
    );

    if (!data.valid) {
      return reply.code(401).send({
        error: 'Invalid token',
        detail: data.error
      });
    }

    const userInfo: UserInfo = {
      userId: data.user_id,
      role: data.role,
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

---

## 数据模型分析

### commerce-backend 核心表结构

基于 commerce-backend 的 SQLAlchemy 模型，以下是 BI 系统需要分析的核心表：

#### 1. orders 表
```sql
CREATE TABLE orders (
    id UUID PRIMARY KEY,
    merchant_id UUID NOT NULL,
    order_number VARCHAR(50) UNIQUE NOT NULL,
    customer_user_id UUID,
    customer_email VARCHAR(255) NOT NULL,
    customer_name VARCHAR(100) NOT NULL,

    -- 订单状态（13个状态）
    status VARCHAR(50) NOT NULL,  -- pending/paid/processing/shipped/delivered...

    -- 金额信息
    subtotal DECIMAL(10, 2) NOT NULL,
    shipping_fee DECIMAL(10, 2) NOT NULL,
    tax_amount DECIMAL(10, 2),
    amount_total DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',

    -- 支付信息
    stripe_payment_intent_id VARCHAR(255),

    -- 物流信息
    tracking_number VARCHAR(100),
    carrier VARCHAR(100),
    tracking_url TEXT,

    -- 地址信息（JSON）
    shipping_address JSON NOT NULL,

    -- UTM 跟踪
    utm_source VARCHAR(100),
    utm_campaign VARCHAR(100),
    utm_medium VARCHAR(100),
    gclid VARCHAR(255),

    -- 时间戳
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    shipped_at TIMESTAMP,
    delivered_at TIMESTAMP,

    -- 转账状态
    transfer_status VARCHAR(50),  -- pending/completed/failed

    FOREIGN KEY (merchant_id) REFERENCES merchants(id),
    INDEX idx_merchant_created (merchant_id, created_at),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at)
);
```

#### 2. order_items 表
```sql
CREATE TABLE order_items (
    id UUID PRIMARY KEY,
    order_id UUID NOT NULL,
    product_id UUID NOT NULL,
    variant_id UUID,
    product_name VARCHAR(255) NOT NULL,
    sku VARCHAR(100),
    quantity INT NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    total DECIMAL(10, 2) NOT NULL,

    -- 变体属性（JSON）
    variant_attributes JSON,

    FOREIGN KEY (order_id) REFERENCES orders(id),
    FOREIGN KEY (product_id) REFERENCES products(id),
    INDEX idx_order (order_id),
    INDEX idx_product (product_id)
);
```

#### 3. products 表
```sql
CREATE TABLE products (
    id UUID PRIMARY KEY,
    merchant_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    handle VARCHAR(255),  -- URL友好标识符
    description TEXT,

    -- 价格信息
    price DECIMAL(10, 2) NOT NULL,
    original_price DECIMAL(10, 2),
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',

    -- 库存信息
    stock_quantity INT NOT NULL DEFAULT 0,
    track_inventory BOOLEAN NOT NULL DEFAULT TRUE,
    low_stock_threshold INT,

    -- 分类和状态
    category VARCHAR(100),
    status VARCHAR(50) NOT NULL,  -- active/inactive/archived

    -- SKU 和 Stripe
    sku VARCHAR(100),
    stripe_product_id VARCHAR(255),
    stripe_price_id VARCHAR(255),

    -- 物理属性（用于运费计算）
    weight DECIMAL(10, 3),  -- kg
    length DECIMAL(10, 2),  -- cm
    width DECIMAL(10, 2),
    height DECIMAL(10, 2),

    -- 变体支持
    variant_count INT DEFAULT 0,

    -- 评价数据
    rating DECIMAL(3, 2),  -- 0-5
    review_count INT DEFAULT 0,

    -- 时间戳
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,

    FOREIGN KEY (merchant_id) REFERENCES merchants(id),
    INDEX idx_merchant (merchant_id),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at)
);
```

#### 4. merchants 表
```sql
CREATE TABLE merchants (
    id UUID PRIMARY KEY,
    user_id UUID UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE,
    description TEXT,
    logo_url TEXT,
    banner_url TEXT,

    -- Stripe 配置
    stripe_account_id VARCHAR(255),
    platform_fee_percentage DECIMAL(5, 2) DEFAULT 5.00,
    transfer_delay_days INT DEFAULT 7,

    -- 地址信息（从 shipping config）
    origin_country_alpha2 VARCHAR(2),
    origin_city VARCHAR(200),
    origin_postal_code VARCHAR(20),
    contact_name VARCHAR(50),
    contact_phone VARCHAR(20),
    contact_email VARCHAR(50),
    company_name VARCHAR(50),

    -- 状态
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    -- 时间戳
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,

    FOREIGN KEY (user_id) REFERENCES users(id),
    INDEX idx_user (user_id),
    INDEX idx_active (is_active)
);
```

#### 5. merchant_transfers 表
```sql
CREATE TABLE merchant_transfers (
    id UUID PRIMARY KEY,
    merchant_id UUID NOT NULL,
    order_id UUID NOT NULL,

    -- 金额信息
    gross_amount DECIMAL(10, 2) NOT NULL,      -- 订单总额
    platform_fee DECIMAL(10, 2) NOT NULL,      -- 平台手续费
    net_amount DECIMAL(10, 2) NOT NULL,        -- 商家净收入
    currency VARCHAR(3) NOT NULL,

    -- 转账状态
    status VARCHAR(50) NOT NULL,  -- pending/completed/failed

    -- Stripe 信息
    stripe_transfer_id VARCHAR(255),
    stripe_payout_id VARCHAR(255),

    -- 时间戳
    created_at TIMESTAMP NOT NULL,
    completed_at TIMESTAMP,

    FOREIGN KEY (merchant_id) REFERENCES merchants(id),
    FOREIGN KEY (order_id) REFERENCES orders(id),
    INDEX idx_merchant (merchant_id),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at)
);
```

#### 6. subscriptions 表
```sql
CREATE TABLE subscriptions (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    merchant_id UUID,

    -- 订阅计划
    plan VARCHAR(50) NOT NULL,  -- free/pro/enterprise
    status VARCHAR(50) NOT NULL,  -- active/cancelled/expired

    -- 时间信息
    started_at TIMESTAMP NOT NULL,
    expires_at TIMESTAMP,
    cancelled_at TIMESTAMP,

    -- 支付信息
    stripe_subscription_id VARCHAR(255),
    stripe_customer_id VARCHAR(255),

    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (merchant_id) REFERENCES merchants(id),
    INDEX idx_merchant (merchant_id),
    INDEX idx_status (status)
);
```

#### 7. reviews 表
```sql
CREATE TABLE reviews (
    id UUID PRIMARY KEY,
    product_id UUID NOT NULL,
    merchant_id UUID NOT NULL,
    order_id UUID,
    customer_user_id UUID,

    -- 评价内容
    rating INT NOT NULL,  -- 1-5
    comment TEXT,

    -- 状态
    status VARCHAR(50) NOT NULL,  -- pending/approved/rejected

    -- 时间戳
    created_at TIMESTAMP NOT NULL,

    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (merchant_id) REFERENCES merchants(id),
    INDEX idx_product (product_id),
    INDEX idx_merchant (merchant_id)
);
```

### Prisma Schema 生成

bi-backend 使用 Prisma 从 commerce-backend 数据库生成类型：

```bash
# 1. 从数据库内省生成 Prisma schema
npx prisma db pull --url="postgresql://readonly_user:pass@localhost:5432/commerce"

# 2. 生成 TypeScript 类型
npx prisma generate
```

生成的 schema 示例：
```prisma
// prisma/schema.prisma
model Order {
  id                String   @id @default(uuid())
  merchantId        String   @map("merchant_id")
  orderNumber       String   @unique @map("order_number")
  customerEmail     String   @map("customer_email")
  customerName      String   @map("customer_name")
  status            String
  subtotal          Decimal  @db.Decimal(10, 2)
  shippingFee       Decimal  @map("shipping_fee") @db.Decimal(10, 2)
  amountTotal       Decimal  @map("amount_total") @db.Decimal(10, 2)
  currency          String
  createdAt         DateTime @default(now()) @map("created_at")

  merchant          Merchant @relation(fields: [merchantId], references: [id])
  items             OrderItem[]

  @@map("orders")
  @@index([merchantId, createdAt])
}
```

---

## 架构决策记录

### ADR-001: 选择 TypeScript 而非 Python

**决策**: optima-bi 全栈使用 TypeScript（bi-cli + bi-backend）

**理由**:
1. **类型安全**: TypeScript 在编译时提供完整类型检查，减少运行时错误
2. **前后端统一**: CLI 和 backend 使用相同语言，便于代码复用和类型共享
3. **Prisma ORM**: TypeScript-first ORM，自动生成类型，开发体验优秀
4. **Fastify 性能**: 比 Express 快 2 倍，比 FastAPI 性能接近
5. **生态成熟**: Node.js 生态丰富，工具链成熟（vitest、prettier、eslint）
6. **未来扩展**: 如需 Web 界面，可直接复用类型和业务逻辑

**替代方案**:
- ~~Python + FastAPI~~：与 commerce-backend 技术栈一致，但需重复定义类型

**影响**:
- 需要从数据库生成 Prisma schema（`prisma db pull`）
- 无法直接复用 commerce-backend 的 SQLAlchemy 模型

---

### ADR-002: 直接数据库访问而非 API 调用

**决策**: bi-backend 直接连接 commerce-backend PostgreSQL（只读）

**理由**:
1. **性能优化**: 避免 HTTP 调用开销，SQL 查询更高效
2. **实时数据**: 无需数据同步，无延迟
3. **灵活查询**: 自由组合复杂 SQL 查询，满足多维度分析
4. **简化架构**: 减少一层 API 依赖，降低系统复杂度

**安全措施**:
- 使用 **只读数据库用户**（`commerce_readonly`）
- 无法修改 commerce 数据
- 所有查询通过 Prisma ORM，防止 SQL 注入

**替代方案**:
- ~~调用 commerce-backend API~~：增加网络开销，性能较差

**影响**:
- 需要在 commerce-backend 数据库创建只读用户
- bi-backend 部署需要配置数据库连接

---

### ADR-003: OAuth 2.0 Device Flow 认证

**决策**: bi-cli 使用 OAuth 2.0 Device Flow 进行认证

**理由**:
1. **CLI 友好**: 专为无浏览器设备设计，体验流畅
2. **安全性高**: 无需在 CLI 中输入密码，在浏览器中完成授权
3. **统一认证**: 复用 user-auth 服务，无需单独实现
4. **参考实现**: commerce-cli 已验证可行性

**流程**:
1. CLI 请求 Device Code
2. 显示授权 URL 和用户代码
3. 自动打开浏览器
4. 用户在浏览器中登录授权
5. CLI 轮询获取 Token
6. 加密存储到本地配置文件

**替代方案**:
- ~~用户名密码~~：不安全，需要在 CLI 中输入密码
- ~~API Key~~：管理复杂，无法识别用户身份

---

### ADR-004: JSON 默认输出 + Pretty 选项

**决策**: bi-cli 默认输出 JSON 格式，支持 `--pretty` 选项

**理由**:
1. **AI 友好**: Claude Code 可直接解析 JSON，无需额外处理
2. **可编程**: 脚本和自动化工具可轻松处理 JSON 输出
3. **向后兼容**: 参考 commerce-cli 的设计，保持一致性
4. **灵活切换**: `--pretty` 选项提供彩色表格输出，满足手动调试需求

**输出格式**:
```typescript
interface CliResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}
```

**替代方案**:
- ~~默认表格输出~~：不适合 AI 解析，需要 `--json` 选项反转

---

### ADR-005: 多环境支持（production/stage/development）

**决策**: bi-cli 支持 3 个独立环境，配置文件隔离

**理由**:
1. **环境隔离**: 避免误操作影响生产数据
2. **灵活切换**: `bi-cli auth login --env stage` 快速切换环境
3. **参考实现**: commerce-cli 已验证可行性

**环境配置**:
```typescript
const ENV_CONFIG = {
  production: {
    authUrl: 'https://auth.optima.shop',
    apiUrl: 'https://bi-api.optima.shop',
    clientId: 'bi-cli-prod',
    configFile: 'config-prod.json',
  },
  stage: {
    authUrl: 'https://auth-stage.optima.shop',
    apiUrl: 'https://bi-api-stage.optima.shop',
    clientId: 'bi-cli-stage',
    configFile: 'config-stage.json',
  },
  development: {
    authUrl: 'https://auth.optima.chat',
    apiUrl: 'https://bi-api.optima.chat',
    clientId: 'bi-cli-dev',
    configFile: 'config-dev.json',
  },
};
```

---

## 关键 API 接口

### user-auth API

#### 1. Token 验证（bi-backend 使用）
```http
POST /api/v1/auth/verify
Content-Type: application/json

Request:
{
  "token": "eyJhbGciOiJSUzI1NiIs...",
  "required_scope": null
}

Response (Success):
{
  "valid": true,
  "user_id": "user_abc123",
  "role": "merchant",
  "scopes": ["read", "write"],
  "delegated": false,
  "error": null
}

Response (Failed):
{
  "valid": false,
  "error": "Token expired"
}
```

#### 2. Device Flow - 请求 Device Code（bi-cli 使用）
```http
POST /oauth/device
Content-Type: application/x-www-form-urlencoded

Request:
client_id=bi-cli-prod

Response:
{
  "device_code": "GmRhmhcxhwAzkoEqiMEg_DnyEysNkuNhszIySk9eS",
  "user_code": "WDJB-MJHT",
  "verification_uri": "https://auth.optima.shop/device",
  "verification_uri_complete": "https://auth.optima.shop/device?user_code=WDJB-MJHT",
  "expires_in": 600,
  "interval": 5
}
```

#### 3. Device Flow - 轮询获取 Token（bi-cli 使用）
```http
POST /oauth/token
Content-Type: application/x-www-form-urlencoded

Request:
grant_type=urn:ietf:params:oauth:grant-type:device_code
&device_code=GmRhmhcxhwAzkoEqiMEg_DnyEysNkuNhszIySk9eS
&client_id=bi-cli-prod

Response (Pending):
{
  "error": "authorization_pending",
  "error_description": "User has not yet authorized"
}

Response (Success):
{
  "access_token": "eyJhbGciOiJSUzI1NiIs...",
  "refresh_token": "eyJhbGciOiJSUzI1NiIs...",
  "expires_in": 3600,
  "token_type": "Bearer"
}
```

#### 4. 刷新 Token
```http
POST /oauth/token
Content-Type: application/x-www-form-urlencoded

Request:
grant_type=refresh_token
&refresh_token=eyJhbGciOiJSUzI1NiIs...
&client_id=bi-cli-prod

Response:
{
  "access_token": "eyJhbGciOiJSUzI1NiIs...",
  "refresh_token": "eyJhbGciOiJSUzI1NiIs...",
  "expires_in": 3600,
  "token_type": "Bearer"
}
```

#### 5. 获取当前用户信息
```http
GET /api/v1/users/me
Authorization: Bearer eyJhbGciOiJSUzI1NiIs...

Response:
{
  "id": "user_abc123",
  "email": "merchant@example.com",
  "name": "John Doe",
  "role": "merchant",
  "is_active": true,
  "created_at": "2024-01-15T10:30:00Z"
}
```

---

### commerce-backend API（参考，bi-backend 不直接调用）

#### 商品列表
```http
GET /api/shops/{merchant_id}/products
Authorization: Bearer <token>

Response:
{
  "products": [
    {
      "id": "prod_123",
      "name": "商品A",
      "price": "99.00",
      "currency": "USD",
      "stock_quantity": 10,
      "status": "active"
    }
  ],
  "total": 100,
  "page": 1,
  "has_next": true
}
```

#### 订单列表
```http
GET /api/orders?merchant_id={merchant_id}&status=paid&limit=100
Authorization: Bearer <token>

Response:
{
  "orders": [
    {
      "id": "order_456",
      "order_number": "ORD-20240115-001",
      "customer_email": "buyer@example.com",
      "status": "paid",
      "amount_total": "299.00",
      "created_at": "2024-01-15T10:30:00Z"
    }
  ]
}
```

---

## BI 分析维度设计

基于 commerce-backend 的数据模型，设计以下分析维度：

### 1. 销售分析（商家级）

**数据来源**: `orders`, `order_items`

**关键指标**:
- 总销售额（GMV）
- 订单数量
- 客单价（AOV）
- 同比/环比增长率
- 按日期/产品/分类聚合

**SQL 示例**（Prisma）:
```typescript
// 销售概览
const salesStats = await prisma.order.aggregate({
  where: {
    merchantId: merchant_id,
    status: 'paid',
    createdAt: { gte: startDate, lte: endDate }
  },
  _sum: { amountTotal: true },
  _count: true,
  _avg: { amountTotal: true }
});

// 按日期聚合
const dailySales = await prisma.$queryRaw`
  SELECT
    DATE(created_at) as date,
    SUM(amount_total) as revenue,
    COUNT(*) as orders,
    AVG(amount_total) as aov
  FROM orders
  WHERE merchant_id = ${merchant_id}
    AND status = 'paid'
    AND created_at >= ${startDate}
  GROUP BY DATE(created_at)
  ORDER BY date ASC
`;
```

---

### 2. 商品分析（商家级）

**数据来源**: `products`, `order_items`

**关键指标**:
- 商品销量排行
- 库存周转率
- 低库存预警
- 商品评分和评价数

**SQL 示例**:
```typescript
// 商品销售排行
const topProducts = await prisma.$queryRaw`
  SELECT
    oi.product_id,
    p.name as product_name,
    SUM(oi.quantity) as total_quantity,
    SUM(oi.total) as total_revenue,
    COUNT(DISTINCT oi.order_id) as order_count
  FROM order_items oi
  JOIN orders o ON oi.order_id = o.id
  JOIN products p ON oi.product_id = p.id
  WHERE o.merchant_id = ${merchant_id}
    AND o.status = 'paid'
  GROUP BY oi.product_id, p.name
  ORDER BY total_revenue DESC
  LIMIT 10
`;
```

---

### 3. 客户分析（商家级）

**数据来源**: `orders`（通过 `customer_email` 聚合）

**关键指标**:
- 新客户 vs 复购客户
- 客户生命周期价值（LTV）
- 复购率
- 流失客户识别

**客户分层**:
- 新客户：首次购买 < 30 天
- 活跃客户：最近 90 天有购买
- 流失客户：90 天以上无购买
- VIP 客户：累计消费 > $1000

**SQL 示例**:
```typescript
// 客户复购分析
const customerStats = await prisma.$queryRaw`
  SELECT
    customer_email,
    COUNT(*) as order_count,
    SUM(amount_total) as total_spent,
    MIN(created_at) as first_order_date,
    MAX(created_at) as last_order_date
  FROM orders
  WHERE merchant_id = ${merchant_id}
    AND status IN ('paid', 'delivered')
  GROUP BY customer_email
  HAVING COUNT(*) > 1
  ORDER BY total_spent DESC
`;
```

---

### 4. 财务分析（商家级）

**数据来源**: `merchant_transfers`, `orders`

**关键指标**:
- 总收入（Gross Revenue）
- 平台手续费
- 净收入（Net Revenue）
- 待转账金额
- 已转账金额

**SQL 示例**:
```typescript
// 财务汇总
const financialStats = await prisma.merchantTransfer.aggregate({
  where: {
    merchantId: merchant_id,
    createdAt: { gte: startDate, lte: endDate }
  },
  _sum: {
    grossAmount: true,
    platformFee: true,
    netAmount: true
  }
});

// 按状态分组
const transfersByStatus = await prisma.merchantTransfer.groupBy({
  by: ['status'],
  where: { merchantId: merchant_id },
  _sum: { netAmount: true },
  _count: true
});
```

---

### 5. 物流分析（商家级）

**数据来源**: `orders`

**关键指标**:
- 平均发货时长
- 平均配送时长
- 物流异常率
- 按承运商统计

**SQL 示例**:
```typescript
// 物流时效分析
const shippingStats = await prisma.$queryRaw`
  SELECT
    AVG(EXTRACT(EPOCH FROM (shipped_at - created_at)) / 3600) as avg_ship_hours,
    AVG(EXTRACT(EPOCH FROM (delivered_at - shipped_at)) / 86400) as avg_delivery_days,
    COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_deliveries
  FROM orders
  WHERE merchant_id = ${merchant_id}
    AND created_at >= ${startDate}
    AND shipped_at IS NOT NULL
`;
```

---

### 6. 平台分析（管理员级）

**数据来源**: `orders`, `merchants`, `subscriptions`

**关键指标**:
- 平台 GMV
- 活跃商家数量
- 订阅收入（MRR/ARR）
- 平台手续费收入
- 商家增长趋势

**SQL 示例**:
```typescript
// 平台 GMV 概览
const platformGMV = await prisma.order.aggregate({
  where: {
    status: 'paid',
    createdAt: { gte: startDate, lte: endDate }
  },
  _sum: { amountTotal: true },
  _count: true
});

// 活跃商家统计
const activeMerchants = await prisma.$queryRaw`
  SELECT
    DATE_TRUNC('month', o.created_at) as month,
    COUNT(DISTINCT o.merchant_id) as active_merchants
  FROM orders o
  WHERE o.status = 'paid'
    AND o.created_at >= ${startDate}
  GROUP BY month
  ORDER BY month
`;

// 订阅分析（MRR）
const subscriptionMRR = await prisma.subscription.aggregate({
  where: {
    status: 'active',
    plan: { in: ['pro', 'enterprise'] }
  },
  _count: true
});
```

---

## 总结

### 关键设计原则

1. **职责分离**:
   - **Claude Code**: AI 分析和洞察生成
   - **bi-cli**: 数据获取和结构化输出
   - **bi-backend**: 数据查询和聚合计算
   - **commerce-backend DB**: 数据源（只读访问）

2. **AI 优先**:
   - JSON 默认输出
   - 统一响应格式
   - 完整的错误信息

3. **安全可靠**:
   - OAuth 2.0 认证
   - 只读数据库用户
   - Token 加密存储
   - 角色权限隔离

4. **性能优化**:
   - 直接数据库访问
   - Redis 缓存
   - Prisma 查询优化
   - 索引支持

5. **可扩展性**:
   - 类型安全（TypeScript）
   - 模块化设计
   - 多环境支持
   - 灵活的查询接口

### 下一步

1. ✅ 完成技术方案设计
2. ⏭️ 创建项目结构
3. ⏭️ 实现 bi-backend 核心功能
4. ⏭️ 实现 bi-cli 命令
5. ⏭️ 集成测试
6. ⏭️ 部署上线

---

**文档版本**: v1.0
**最后更新**: 2025-01-21
**维护者**: Optima BI Team
