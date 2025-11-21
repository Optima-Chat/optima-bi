# 数据模型参考

本文档描述 commerce-backend PostgreSQL 数据库中 optima-bi 需要访问的核心表结构。

---

## 1. orders 表

**用途**: 订单主表，包含订单的所有核心信息

```sql
CREATE TABLE orders (
    id UUID PRIMARY KEY,
    merchant_id UUID NOT NULL,
    order_number VARCHAR(50) UNIQUE NOT NULL,
    customer_user_id UUID,                -- 登录用户 ID（可为空，游客购买）
    customer_email VARCHAR(255) NOT NULL,
    customer_name VARCHAR(100) NOT NULL,

    -- 订单状态（13个状态）
    status VARCHAR(50) NOT NULL,
    -- pending, paid, confirmed, processing, awaiting_shipment,
    -- shipped, in_transit, out_for_delivery, delivered,
    -- completed, cancelled, refunded, failed, returned

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

### 订单状态说明

| 状态 | 含义 | 分组 |
|------|------|------|
| `pending` | 待支付 | 进行中 |
| `paid` | 已支付 | 进行中 |
| `confirmed` | 已确认 | 进行中 |
| `processing` | 处理中 | 进行中 |
| `awaiting_shipment` | 待发货 | 进行中 |
| `shipped` | 已发货 | 进行中 |
| `in_transit` | 运输中 | 进行中 |
| `out_for_delivery` | 派送中 | 进行中 |
| `delivered` | 已送达 | 已完成 |
| `completed` | 已完成 | 已完成 |
| `cancelled` | 已取消 | 已取消 |
| `refunded` | 已退款 | 已取消 |
| `failed` | 失败 | 已取消 |
| `returned` | 已退货 | 已取消 |

### shipping_address JSON 格式

```json
{
  "line_1": "123 Main St",
  "line_2": "Apt 4B",
  "city": "New York",
  "state": "NY",
  "postal_code": "10001",
  "country_alpha2": "US",
  "contact_name": "Jane Doe",
  "contact_phone": "+1234567890",
  "contact_email": "buyer@example.com"
}
```

---

## 2. order_items 表

**用途**: 订单明细，记录订单中的每个商品

```sql
CREATE TABLE order_items (
    id UUID PRIMARY KEY,
    order_id UUID NOT NULL,
    product_id UUID NOT NULL,
    variant_id UUID,                     -- 商品变体 ID（可选）
    product_name VARCHAR(255) NOT NULL,
    sku VARCHAR(100),
    quantity INT NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    total DECIMAL(10, 2) NOT NULL,

    -- 变体属性（JSON）
    variant_attributes JSON,
    -- 示例: {"color": "red", "size": "M"}

    FOREIGN KEY (order_id) REFERENCES orders(id),
    FOREIGN KEY (product_id) REFERENCES products(id),
    INDEX idx_order (order_id),
    INDEX idx_product (product_id)
);
```

### variant_attributes JSON 示例

```json
{
  "color": "red",
  "size": "M",
  "material": "cotton"
}
```

---

## 3. products 表

**用途**: 商品主表

```sql
CREATE TABLE products (
    id UUID PRIMARY KEY,
    merchant_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    handle VARCHAR(255),              -- URL友好标识符
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
    weight DECIMAL(10, 3),        -- kg
    length DECIMAL(10, 2),        -- cm
    width DECIMAL(10, 2),
    height DECIMAL(10, 2),

    -- 变体支持
    variant_count INT DEFAULT 0,

    -- 评价数据
    rating DECIMAL(3, 2),         -- 0-5
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

---

## 4. merchants 表

**用途**: 商家主表

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

---

## 5. merchant_transfers 表

**用途**: 商家转账记录

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

### 金额计算公式

```
net_amount = gross_amount - platform_fee
platform_fee = gross_amount × platform_fee_percentage
```

**示例**:
- 订单总额（gross_amount）: $100.00
- 平台费率（platform_fee_percentage）: 5%
- 平台手续费（platform_fee）: $5.00
- 商家净收入（net_amount）: $95.00

---

## 6. subscriptions 表

**用途**: 订阅管理

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

### 订阅计划

| 计划 | 月费 | 功能 |
|------|------|------|
| `free` | $0 | 基础功能 |
| `pro` | $29 | 高级分析 |
| `enterprise` | $99 | 全部功能 + 优先支持 |

---

## 7. reviews 表

**用途**: 商品评价

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

---

## Prisma Schema 生成

bi-backend 使用 Prisma 从数据库生成 TypeScript 类型：

```bash
# 1. 从数据库内省生成 Prisma schema
npx prisma db pull --url="postgresql://readonly_user:pass@host:5432/commerce"

# 2. 生成 TypeScript 类型
npx prisma generate
```

### 生成的 Prisma Schema 示例

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

model OrderItem {
  id                String   @id @default(uuid())
  orderId           String   @map("order_id")
  productId         String   @map("product_id")
  productName       String   @map("product_name")
  quantity          Int
  price             Decimal  @db.Decimal(10, 2)
  total             Decimal  @db.Decimal(10, 2)

  order             Order    @relation(fields: [orderId], references: [id])

  @@map("order_items")
}
```

---

## 常用查询示例

### 销售分析
```typescript
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
```

### 商品销售排行
```typescript
const topProducts = await prisma.$queryRaw`
  SELECT
    oi.product_id,
    p.name as product_name,
    SUM(oi.quantity) as total_quantity,
    SUM(oi.total) as total_revenue
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

### 客户分析
```typescript
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

**维护者**: Optima BI Team
**最后更新**: 2025-01-21
