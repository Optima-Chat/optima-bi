# ADR-008: 数据权限隔离（Row-Level Security）

**状态**: ✅ 已采纳
**日期**: 2025-01-21
**决策者**: Optima BI Team

---

## 背景

Optima BI 需要支持多租户数据隔离：
- **商家用户**：只能查看自己商店的数据（orders, customers, products 等）
- **平台管理员**：可以查看所有商家的聚合数据和排行榜

**安全风险**：
- 商家 A 不能看到商家 B 的销售数据
- 商家不能看到平台级别的敏感数据（总 GMV、商家流失率等）
- API 被绕过时，数据库层需要有保护机制吗？

**关键问题**：在哪一层实现权限控制？

---

## 决策

**采纳方案**：**应用层权限过滤**（bi-backend）

### 实现方式

#### 1. JWT Token 携带权限信息

```typescript
// JWT Payload 结构
interface JWTPayload {
  userId: string;
  merchantId?: string;  // 商家用户有 merchantId，管理员没有
  role: 'merchant' | 'admin';
  scope: string[];      // ['read:analytics', 'read:platform']
}
```

#### 2. bi-backend 中间件验证

```typescript
// middleware/auth.ts
import { FastifyRequest } from 'fastify';

export async function verifyToken(request: FastifyRequest) {
  const token = request.headers.authorization?.replace('Bearer ', '');
  const payload = await jwt.verify(token, JWT_SECRET);

  request.user = {
    userId: payload.userId,
    merchantId: payload.merchantId,
    role: payload.role,
    scope: payload.scope,
  };
}

// 商家权限检查
export function requireMerchant(request: FastifyRequest) {
  if (!request.user.merchantId) {
    throw new Error('Merchant only');
  }
}

// 管理员权限检查
export function requireAdmin(request: FastifyRequest) {
  if (request.user.role !== 'admin') {
    throw new Error('Admin only');
  }
}
```

#### 3. 查询时自动注入 WHERE 条件

```typescript
// services/SalesService.ts
class SalesService {
  async getDailySales(userId: string, merchantId: string, days: number) {
    // 商家查询：自动加 WHERE merchant_id
    const query = `
      SELECT
        date,
        total_revenue,
        order_count,
        avg_order_value
      FROM daily_sales_mv
      WHERE merchant_id = {merchantId:UUID}
        AND date >= today() - {days:UInt32}
      ORDER BY date DESC
    `;

    return await clickhouse.query({
      query,
      query_params: { merchantId, days },
    });
  }

  async getPlatformGMV(userId: string, role: string) {
    // 管理员查询：检查 role
    if (role !== 'admin') {
      throw new Error('Admin only');
    }

    const query = `
      SELECT
        date,
        sum(total_revenue) as platform_gmv,
        sum(order_count) as total_orders
      FROM daily_sales_mv
      WHERE date >= today() - 30
      GROUP BY date
      ORDER BY date DESC
    `;

    return await clickhouse.query({ query });
  }
}
```

#### 4. API 路由设计

```typescript
// routes/sales.ts
app.get('/api/sales/daily', {
  preHandler: [verifyToken, requireMerchant],
  handler: async (request, reply) => {
    const { merchantId } = request.user;
    const { days = 7 } = request.query;

    const data = await salesService.getDailySales(
      request.user.userId,
      merchantId,  // 自动注入商家 ID
      days
    );

    return { data };
  }
});

app.get('/api/platform/gmv', {
  preHandler: [verifyToken, requireAdmin],
  handler: async (request, reply) => {
    const data = await salesService.getPlatformGMV(
      request.user.userId,
      request.user.role
    );

    return { data };
  }
});
```

---

## 理由

### 为什么选择应用层过滤？

**优势**：
1. ✅ **实现简单**：只需在查询时加 `WHERE merchant_id = ?`
2. ✅ **灵活性高**：可以实现复杂的权限逻辑（如子账号、只读权限）
3. ✅ **易于调试**：所有权限逻辑都在 TypeScript 代码中
4. ✅ **性能优秀**：ClickHouse 的 `merchant_id` 是 Sorting Key，过滤很快
5. ✅ **易于测试**：单元测试可以 mock 不同的 user context

**劣势**：
- ⚠️ 需要在每个查询都加 WHERE 条件（可通过 ORM 或 Query Builder 统一处理）
- ⚠️ 如果代码有 bug 漏掉 WHERE，可能导致数据泄露

### 防御措施

#### 1. 统一 Query Builder

```typescript
// utils/queryBuilder.ts
class SecureQueryBuilder {
  private merchantId?: string;
  private role: string;

  constructor(user: User) {
    this.merchantId = user.merchantId;
    this.role = user.role;
  }

  // 商家查询：自动加 WHERE merchant_id
  buildMerchantQuery(table: string, conditions: string = '') {
    if (!this.merchantId) {
      throw new Error('merchantId required');
    }

    const whereClause = conditions
      ? `WHERE merchant_id = '${this.merchantId}' AND (${conditions})`
      : `WHERE merchant_id = '${this.merchantId}'`;

    return `SELECT * FROM ${table} ${whereClause}`;
  }

  // 管理员查询：检查权限
  buildAdminQuery(table: string, conditions: string = '') {
    if (this.role !== 'admin') {
      throw new Error('Admin only');
    }

    return `SELECT * FROM ${table} ${conditions ? 'WHERE ' + conditions : ''}`;
  }
}

// 使用示例
const qb = new SecureQueryBuilder(request.user);
const query = qb.buildMerchantQuery('daily_sales_mv', 'date >= today() - 7');
// 自动生成：SELECT * FROM daily_sales_mv WHERE merchant_id = 'xxx' AND (date >= today() - 7)
```

#### 2. 代码审查检查清单

- [ ] 所有商家查询都通过 `SecureQueryBuilder.buildMerchantQuery()`
- [ ] 所有管理员查询都检查了 `role === 'admin'`
- [ ] 没有直接拼接 SQL（防止 SQL 注入）
- [ ] 单元测试覆盖了权限绕过场景

#### 3. 审计日志

```typescript
// 记录所有数据访问
logger.info('data_access', {
  userId: request.user.userId,
  merchantId: request.user.merchantId,
  role: request.user.role,
  resource: 'daily_sales',
  query: sanitizedQuery,
  timestamp: new Date(),
});
```

---

## 替代方案（已放弃）

### 方案 B: ClickHouse Row Policy

```sql
-- 为每个商家创建 ClickHouse 用户
CREATE USER merchant_abc123 IDENTIFIED BY 'secure_password';

-- 创建行级策略
CREATE ROW POLICY merchant_abc123_policy ON daily_sales_mv
  FOR SELECT
  USING merchant_id = 'abc123'
  TO merchant_abc123;

GRANT SELECT ON database.daily_sales_mv TO merchant_abc123;
```

**优势**：
- ✅ 数据库层面保护，即使应用层有 bug 也无法绕过
- ✅ 多个应用共享同一数据库时，权限统一管理

**劣势**：
- ❌ **管理复杂**：需要为每个商家创建 ClickHouse 用户（可能有成千上万商家）
- ❌ **连接池困难**：每个商家需要独立连接，无法共享连接池
- ❌ **动态权限困难**：新增商家需要执行 DDL（`CREATE USER`）
- ❌ **性能开销**：每个请求需要切换 ClickHouse 用户

**结论**：适合用户数量少（< 100）的场景，不适合多租户 SaaS。

### 方案 C: PostgreSQL RLS + ClickHouse 视图

```sql
-- PostgreSQL 开启 RLS
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY merchant_isolation ON orders
  FOR SELECT
  USING (merchant_id = current_setting('app.current_merchant_id')::uuid);

-- ClickHouse 通过 PostgreSQL 查询（慢）
CREATE TABLE orders_from_pg
ENGINE = PostgreSQL('postgres:5432', 'database', 'orders', 'user', 'password');
```

**劣势**：
- ❌ 破坏了 ClickHouse OLAP 架构，性能大幅下降
- ❌ PostgreSQL RLS 在高并发下性能较差
- ❌ 增加复杂性

**结论**：违背了 ADR-006 的设计初衷（OLAP/OLTP 分离）。

---

## 影响

### 正面影响
1. **简单可靠**：应用层过滤逻辑清晰，易于理解和维护
2. **灵活性高**：可以轻松实现复杂权限（子账号、部门隔离、只读权限）
3. **性能优秀**：ClickHouse Sorting Key 包含 `merchant_id`，过滤几乎无性能损失
4. **易于扩展**：未来可以加权限缓存、权限继承等高级功能

### 负面影响
1. **代码规范要求高**：开发者必须记得加 WHERE 条件（通过 Query Builder 缓解）
2. **安全风险**：应用层 bug 可能导致数据泄露（通过代码审查和测试缓解）

### 风险缓解
- **统一 Query Builder**：强制所有查询通过 `SecureQueryBuilder`
- **单元测试**：测试覆盖权限绕过场景
- **代码审查**：每个 PR 必须检查权限过滤
- **审计日志**：记录所有数据访问，便于事后审计

---

## 未来优化（可选）

### 1. 权限缓存

```typescript
// 缓存商家权限信息（5 分钟）
const merchantPermissions = await redis.get(`merchant:${merchantId}:permissions`);
```

### 2. 细粒度权限

```typescript
// 子账号权限
{
  merchantId: 'abc123',
  role: 'staff',
  permissions: ['read:sales', 'read:customers'],  // 不能看财务数据
}
```

### 3. 数据脱敏

```typescript
// 子账号看到的客户邮箱脱敏
const email = hasPermission('read:customer_pii')
  ? 'customer@example.com'
  : 'cu***@example.com';
```

---

## 相关决策

- [ADR-003: OAuth 2.0 Device Flow](./adr-003-oauth-device-flow.md) - JWT Token 格式和认证流程
- [ADR-006: ClickHouse + CDC](./adr-006-clickhouse-olap.md) - ClickHouse Sorting Key 设计

---

## 参考资料

- [PostgreSQL Row-Level Security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [ClickHouse Row Policies](https://clickhouse.com/docs/en/operations/access-rights#row-policy-management)
- [Multi-Tenant Data Isolation Patterns](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)

---

**维护者**: Optima BI Team
**最后更新**: 2025-01-21
