# optima-store 研究分析

**仓库**: https://github.com/Optima-Chat/optima-store

---

## 技术栈

- **Next.js 14** (App Router)
- **React 18 + TypeScript**
- **Tailwind CSS + Headless UI**
- **Zustand** (状态管理)
- **TanStack Query** (服务端状态)

---

## 核心功能

- 商品浏览（支持 variants）
- 购物车和结账
- Stripe 支付集成
- EasyShip 物流跟踪
- AI 导购（MCP Host）
- Google OAuth 登录
- 订单追踪（3-tier guest tracking）

---

## API 集成

### API 端点
- **开发环境**: `http://dev.optima.chat:8280`
- **生产环境**: `https://api.optima.shop`

### 认证方式
- **方法**: Bearer Token
- **存储**: localStorage (`optima-auth`)

---

## 关键类型定义

### 商品变体
```typescript
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
```

### 订单状态（13 个）
```typescript
type OrderStatus =
  | 'pending' | 'paid' | 'confirmed' | 'processing'
  | 'awaiting_shipment' | 'shipped' | 'in_transit'
  | 'out_for_delivery' | 'delivered' | 'completed'
  | 'cancelled' | 'refunded' | 'failed' | 'returned';
```

### 地址格式（EasyShip 标准）
```typescript
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

---

## API 客户端认证

### 获取认证头
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

## 对 optima-bi 的影响

### 订单状态理解
- optima-store 展示的订单状态与 commerce-backend 数据库一致
- bi-cli 需要正确解释这 13 个订单状态
- 可能需要状态分组（如：进行中、已完成、已取消）

### 地址数据格式
- EasyShip 标准地址格式
- 存储为 JSON 字段
- 分析时可能需要按国家/地区聚合

### 商品变体分析
- 商品支持多变体（颜色、尺寸等）
- 销售分析需要考虑变体级别
- SKU 是唯一标识符

### 客户类型识别
- 登录用户：有 `customer_user_id`
- 游客用户：仅有 `customer_email`
- 分析时需要区分这两类客户

---

## 参考数据结构

### 订单示例
```typescript
{
  id: "order_456",
  order_number: "ORD-20240115-001",
  merchant_id: "merchant_123",
  customer_user_id: "user_789", // 或 null（游客）
  customer_email: "buyer@example.com",
  customer_name: "Jane Doe",
  status: "paid",
  subtotal: "99.00",
  shipping_fee: "10.00",
  tax_amount: "5.00",
  amount_total: "114.00",
  currency: "USD",
  shipping_address: {
    line_1: "123 Main St",
    city: "New York",
    state: "NY",
    postal_code: "10001",
    country_alpha2: "US",
    contact_name: "Jane Doe",
    contact_phone: "+1234567890",
    contact_email: "buyer@example.com"
  },
  created_at: "2024-01-15T10:30:00Z"
}
```

---

**维护者**: Optima BI Team
**最后更新**: 2025-01-21
