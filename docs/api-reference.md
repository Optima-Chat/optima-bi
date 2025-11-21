# API 参考文档

本文档包含 optima-bi 依赖的所有外部 API 接口。

---

## user-auth API

### 基础信息

| 环境 | Base URL |
|------|----------|
| Production | `https://auth.optima.shop` |
| Stage | `https://auth-stage.optima.shop` |
| Development | `https://auth.optima.chat` |

---

### 1. Token 验证（服务间调用）

**用途**: bi-backend 验证用户 Token

```http
POST /api/v1/auth/verify
Content-Type: application/json
```

**请求体**:
```json
{
  "token": "eyJhbGciOiJSUzI1NiIs...",
  "required_scope": null  // 可选，校验特定权限
}
```

**响应（成功）**:
```json
{
  "valid": true,
  "user_id": "user_abc123",
  "role": "merchant",  // customer | merchant | admin
  "scopes": ["read", "write"],
  "delegated": false,
  "error": null
}
```

**响应（失败）**:
```json
{
  "valid": false,
  "error": "Token expired"
}
```

**错误代码**:
- `Token expired`: Token 已过期
- `Invalid token`: Token 格式错误或签名无效
- `Token blacklisted`: Token 已被撤销

---

### 2. 请求 Device Code

**用途**: bi-cli 开始 Device Flow 认证

```http
POST /oauth/device
Content-Type: application/x-www-form-urlencoded
```

**请求体**:
```
client_id=bi-cli-prod
```

**响应**:
```json
{
  "device_code": "GmRhmhcxhwAzkoEqiMEg_DnyEysNkuNhszIySk9eS",
  "user_code": "WDJB-MJHT",
  "verification_uri": "https://auth.optima.shop/device",
  "verification_uri_complete": "https://auth.optima.shop/device?user_code=WDJB-MJHT",
  "expires_in": 600,      // 10 分钟
  "interval": 5           // 轮询间隔（秒）
}
```

**字段说明**:
- `device_code`: 后续轮询时使用
- `user_code`: 用户在浏览器中输入的代码
- `verification_uri`: 授权页面 URL
- `verification_uri_complete`: 包含 user_code 的完整 URL（可直接打开）
- `expires_in`: Device Code 过期时间（秒）
- `interval`: CLI 轮询间隔（秒）

---

### 3. 轮询获取 Token

**用途**: bi-cli 轮询检查用户是否已授权

```http
POST /oauth/token
Content-Type: application/x-www-form-urlencoded
```

**请求体**:
```
grant_type=urn:ietf:params:oauth:grant-type:device_code
&device_code=GmRhmhcxhwAzkoEqiMEg_DnyEysNkuNhszIySk9eS
&client_id=bi-cli-prod
```

**响应（待授权）**:
```json
{
  "error": "authorization_pending",
  "error_description": "User has not yet authorized"
}
```

**响应（成功）**:
```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIs...",
  "refresh_token": "eyJhbGciOiJSUzI1NiIs...",
  "expires_in": 3600,      // 1 小时
  "token_type": "Bearer"
}
```

**错误代码**:
- `authorization_pending`: 用户尚未授权（继续轮询）
- `slow_down`: 轮询过快，增加间隔
- `expired_token`: Device Code 已过期
- `access_denied`: 用户拒绝授权

---

### 4. 刷新 Access Token

**用途**: bi-cli 刷新过期的 Access Token

```http
POST /oauth/token
Content-Type: application/x-www-form-urlencoded
```

**请求体**:
```
grant_type=refresh_token
&refresh_token=eyJhbGciOiJSUzI1NiIs...
&client_id=bi-cli-prod
```

**响应**:
```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIs...",
  "refresh_token": "eyJhbGciOiJSUzI1NiIs...",
  "expires_in": 3600,
  "token_type": "Bearer"
}
```

---

### 5. 获取当前用户信息

**用途**: bi-cli 验证登录状态并获取用户信息

```http
GET /api/v1/users/me
Authorization: Bearer eyJhbGciOiJSUzI1NiIs...
```

**响应**:
```json
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

## commerce-backend API（参考）

**注意**: bi-backend **不直接调用** commerce-backend API，而是直接访问数据库。以下接口仅供参考，用于理解数据结构。

### 基础信息

| 环境 | Base URL |
|------|----------|
| Production | `https://api.optima.shop` |
| Development | `https://api.optima.chat` |

---

### 商品列表

```http
GET /api/shops/{merchant_id}/products
Authorization: Bearer <token>
Query Parameters:
  - status: active | inactive | archived
  - limit: 100
  - offset: 0
```

**响应**:
```json
{
  "products": [
    {
      "id": "prod_123",
      "merchant_id": "merchant_456",
      "name": "商品A",
      "price": "99.00",
      "currency": "USD",
      "stock_quantity": 10,
      "status": "active",
      "created_at": "2024-01-15T10:30:00Z"
    }
  ],
  "total": 100,
  "page": 1,
  "has_next": true
}
```

---

### 订单列表

```http
GET /api/orders
Authorization: Bearer <token>
Query Parameters:
  - merchant_id: string (required)
  - status: pending | paid | shipped | delivered | cancelled
  - limit: 100
  - offset: 0
```

**响应**:
```json
{
  "orders": [
    {
      "id": "order_456",
      "order_number": "ORD-20240115-001",
      "merchant_id": "merchant_123",
      "customer_email": "buyer@example.com",
      "customer_name": "Jane Doe",
      "status": "paid",
      "subtotal": "99.00",
      "shipping_fee": "10.00",
      "tax_amount": "5.00",
      "amount_total": "114.00",
      "currency": "USD",
      "created_at": "2024-01-15T10:30:00Z",
      "updated_at": "2024-01-15T10:35:00Z"
    }
  ],
  "total": 50,
  "page": 1,
  "has_next": false
}
```

---

## bi-backend API（内部）

### 基础信息

| 环境 | Base URL |
|------|----------|
| Production | `https://bi-api.optima.shop` |
| Stage | `https://bi-api-stage.optima.shop` |
| Development | `https://bi-api.optima.chat` |

**认证**: Bearer Token（通过 user-auth 获取）

---

### 统一响应格式

所有 bi-backend API 使用以下响应格式：

```typescript
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}
```

**成功响应**:
```json
{
  "success": true,
  "data": {
    "revenue": 12500.00,
    "orders": 150
  }
}
```

**错误响应**:
```json
{
  "success": false,
  "error": "Unauthorized",
  "message": "Invalid token"
}
```

---

### 1. 销售分析

```http
GET /api/v1/sales
Authorization: Bearer <token>
Query Parameters:
  - days: number (default: 7)
  - merchant_id: string (admin only)
```

**响应**:
```json
{
  "success": true,
  "data": {
    "total_revenue": 12500.00,
    "order_count": 150,
    "avg_order_value": 83.33,
    "period": {
      "start": "2024-01-08",
      "end": "2024-01-15"
    },
    "daily_breakdown": [
      {
        "date": "2024-01-15",
        "revenue": 2000.00,
        "orders": 25
      }
    ]
  }
}
```

---

### 2. 商品排行

```http
GET /api/v1/products/top
Authorization: Bearer <token>
Query Parameters:
  - days: number (default: 30)
  - limit: number (default: 10)
  - merchant_id: string (admin only)
```

**响应**:
```json
{
  "success": true,
  "data": {
    "products": [
      {
        "product_id": "prod_123",
        "product_name": "商品A",
        "quantity_sold": 50,
        "revenue": 4950.00,
        "order_count": 45
      }
    ]
  }
}
```

---

### 3. 客户分析

```http
GET /api/v1/customers
Authorization: Bearer <token>
Query Parameters:
  - days: number (default: 90)
  - merchant_id: string (admin only)
```

**响应**:
```json
{
  "success": true,
  "data": {
    "total_customers": 500,
    "new_customers": 50,
    "repeat_customers": 150,
    "repeat_rate": 0.30,
    "top_customers": [
      {
        "customer_email": "vip@example.com",
        "order_count": 10,
        "total_spent": 5000.00,
        "first_order_date": "2023-01-01",
        "last_order_date": "2024-01-15"
      }
    ]
  }
}
```

---

### 4. 财务报表

```http
GET /api/v1/financial
Authorization: Bearer <token>
Query Parameters:
  - month: string (YYYY-MM, default: current month)
  - merchant_id: string (admin only)
```

**响应**:
```json
{
  "success": true,
  "data": {
    "gross_revenue": 50000.00,
    "platform_fee": 2500.00,
    "net_revenue": 47500.00,
    "pending_transfers": 5000.00,
    "completed_transfers": 42500.00,
    "transfer_count": 150
  }
}
```

---

### 5. 平台总览（管理员）

```http
GET /api/v1/platform/overview
Authorization: Bearer <token>
Query Parameters:
  - month: string (YYYY-MM, default: current month)
```

**响应**:
```json
{
  "success": true,
  "data": {
    "platform_gmv": 500000.00,
    "total_orders": 5000,
    "active_merchants": 50,
    "new_merchants": 5,
    "platform_revenue": 25000.00,
    "subscription_mrr": 10000.00
  }
}
```

---

## 错误代码

| 状态码 | 错误类型 | 说明 |
|--------|----------|------|
| 400 | Bad Request | 请求参数错误 |
| 401 | Unauthorized | Token 无效或已过期 |
| 403 | Forbidden | 权限不足 |
| 404 | Not Found | 资源不存在 |
| 429 | Too Many Requests | 请求过于频繁 |
| 500 | Internal Server Error | 服务器内部错误 |

---

**维护者**: Optima BI Team
**最后更新**: 2025-01-21
