# commerce-backend 研究分析

**仓库**: https://github.com/Optima-Chat/commerce-backend

---

## 技术栈

- **Python 3.11 + FastAPI**
- **SQLAlchemy 2.0** (ORM)
- **PostgreSQL 14+**
- **Alembic** (数据库迁移)

---

## 核心功能

- 商品管理（Product, Variant）
- 订单处理（Order, OrderItem）
- 支付集成（Stripe）
- 物流跟踪（EasyShip）
- 商户管理（Merchant, MerchantTransfer）
- 订阅管理（Subscription）

---

## 数据模型（47 个）

### 核心业务模型
```python
Order, OrderItem, Product, Merchant, MerchantTransfer,
Subscription, Review, InventoryLog, OrderStatusHistory
```

### 订单状态枚举（13 个状态）
```python
pending, paid, confirmed, processing, awaiting_shipment,
shipped, in_transit, out_for_delivery, delivered,
completed, cancelled, refunded, failed, returned
```

---

## 关键发现

### 数据隔离
- 商家数据通过 `merchant_id` 字段隔离
- 所有商家相关表都包含 `merchant_id` 外键

### 订单结构
- 订单包含完整的物流和支付信息
- 支持 Stripe 支付（`stripe_payment_intent_id`）
- 包含 UTM 跟踪参数（utm_source, utm_campaign, utm_medium, gclid）

### 财务模型
- 转账记录包含平台手续费（`platform_fee`）
- 商家净收入 = 订单总额 - 平台手续费
- 支持延迟转账（`transfer_delay_days`）

### 地址格式
- 使用 EasyShip 标准地址格式
- 存储为 JSON 字段
- 包含完整的收件人联系信息

---

## 对 optima-bi 的影响

### 数据访问
- bi-backend 需要**只读**访问权限
- 关键表：orders, order_items, products, merchants, merchant_transfers
- 需要通过 `merchant_id` 进行数据隔离

### 查询优化
- 订单表需要索引：`(merchant_id, created_at, status)`
- 商品表需要索引：`(merchant_id, status, created_at)`
- 建议创建预聚合表以提高性能

### 数据类型生成
使用 Prisma 从数据库生成 TypeScript 类型：
```bash
npx prisma db pull --url="postgresql://readonly_user:pass@host:5432/commerce"
npx prisma generate
```

---

**维护者**: Optima BI Team
**最后更新**: 2025-01-21
