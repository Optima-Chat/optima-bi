# ADR-002: 直接数据库访问而非 API 调用

**状态**: ⚠️ 需改进（需配合 ADR-006 预聚合表）
**日期**: 2025-01-21
**决策者**: Optima BI Team
**相关 ADR**: [ADR-006: 预聚合表](./adr-006-materialized-views.md)

---

## 背景

bi-backend 需要从 commerce-backend 获取数据进行分析。主要候选方案：

1. **直接访问数据库**（读only）
2. **调用 commerce-backend API**

---

## 决策

**bi-backend 直接连接 commerce-backend PostgreSQL（只读访问）**

### 连接方式
- **数据库**: commerce-backend PostgreSQL
- **访问权限**: 只读用户（`commerce_readonly`）
- **ORM**: Prisma（TypeScript）
- **连接池**: 10-20 连接
- **缓存**: Redis 多层缓存

---

## 理由

### 1. 性能优化
- 避免 HTTP 调用开销（网络延迟）
- SQL 查询更高效（直接查询，无序列化）
- 可以使用复杂的 JOIN 和聚合查询

**性能对比**:
```
直接 SQL 查询:       50-200ms
API 调用（含序列化）: 200-500ms
提升: 2-5 倍
```

### 2. 实时数据
- 无需数据同步
- 零延迟
- 数据一致性保证

### 3. 灵活查询
- 自由组合复杂 SQL 查询
- 满足多维度分析需求
- 支持自定义聚合和统计

```typescript
// 灵活的多维度查询
const salesByCategory = await prisma.$queryRaw`
  SELECT
    p.category,
    DATE(o.created_at) as date,
    SUM(oi.total) as revenue
  FROM order_items oi
  JOIN orders o ON oi.order_id = o.id
  JOIN products p ON oi.product_id = p.id
  WHERE o.merchant_id = ${merchant_id}
  GROUP BY p.category, DATE(o.created_at)
  ORDER BY date DESC
`;
```

### 4. 简化架构
- 减少一层 API 依赖
- 降低系统复杂度
- 减少故障点

---

## 安全措施

### 1. 只读数据库用户

```sql
-- 创建只读用户
CREATE USER commerce_readonly WITH PASSWORD 'secure_password';

-- 授予只读权限
GRANT CONNECT ON DATABASE commerce TO commerce_readonly;
GRANT USAGE ON SCHEMA public TO commerce_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO commerce_readonly;

-- 确保无法修改数据
REVOKE INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public FROM commerce_readonly;

-- 自动授予新表的只读权限
ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT SELECT ON TABLES TO commerce_readonly;
```

### 2. Prisma 防止 SQL 注入

```typescript
// ✅ 安全：参数化查询
const orders = await prisma.$queryRaw`
  SELECT * FROM orders
  WHERE merchant_id = ${merchant_id}
`;

// ❌ 不安全：字符串拼接（Prisma 不允许）
// const orders = await prisma.$queryRawUnsafe(
//   `SELECT * FROM orders WHERE merchant_id = '${merchant_id}'`
// );
```

### 3. 网络隔离
- bi-backend 与 commerce-backend DB 在同一 VPC
- 使用私有网络连接（非公网）
- 防火墙限制只允许 bi-backend IP 访问

---

## 替代方案

### 方案 A: 调用 commerce-backend API

**优势**:
- 符合微服务架构
- 数据访问层统一
- commerce-backend 可以控制数据访问权限

**劣势**:
- 性能较差（网络开销 + 序列化）
- 灵活性差（受限于已有 API）
- 需要为 BI 创建大量新 API
- API 维护成本高

**结论**: ❌ 放弃

---

## 影响

### 正面影响

1. **性能提升**:
   - 查询速度提升 2-5 倍
   - 实时数据，无延迟
   - 支持复杂分析查询

2. **开发效率**:
   - 无需等待 commerce-backend 提供新 API
   - 可以快速迭代 BI 功能
   - 灵活调整查询逻辑

3. **架构简化**:
   - 减少 API 依赖
   - 降低系统复杂度
   - 减少故障点

### 负面影响（⚠️ 重要）

1. **OLTP/OLAP 混用问题**（**专家评审指出**）:
   - 复杂分析查询可能影响 OLTP 性能
   - 商家数增长后压力线性增长
   - 可能导致生产数据库性能下降

2. **数据库耦合**:
   - bi-backend 依赖 commerce-backend 数据库 schema
   - Schema 变更可能影响 bi-backend
   - 需要同步维护 Prisma schema

3. **权限管理**:
   - 需要在 commerce-backend 数据库创建只读用户
   - 需要配置网络访问控制

### 改进方案（必须实施）

**参见 [ADR-006: 预聚合表](./adr-006-materialized-views.md)**

为解决 OLTP/OLAP 混用问题，必须实施以下改进：

1. **创建预聚合表**（P0 - 必须）:
   - `daily_merchant_summary`: 每日商家汇总
   - `weekly_product_summary`: 每周商品汇总
   - `monthly_customer_summary`: 每月客户汇总

2. **ETL 更新策略**:
   - 每小时增量更新
   - 历史数据准确，今日数据延迟最多 1 小时

3. **查询优化**:
   - 优先查询预聚合表
   - 仅在必要时查询原始表
   - 添加数据库索引

4. **多层缓存**:
   - L1: 内存缓存（1 分钟）
   - L2: Redis 缓存（5 分钟）
   - L3: 预聚合表
   - L4: 原始表（fallback）

**性能提升预期**: 2-5s → 50-200ms（**10-100 倍**）

---

## 实施计划

### Phase 1: 基础实施（已完成）
- [x] 创建只读数据库用户
- [x] 配置 Prisma 连接
- [x] 生成 Prisma schema
- [x] 实现基础查询

### Phase 2: 性能优化（必须 - 2 周）
- [ ] 创建预聚合表（ADR-006）
- [ ] 实现 ETL 脚本
- [ ] 添加数据库索引
- [ ] 实现多层缓存
- [ ] 性能测试

---

## 相关决策

- [ADR-001: TypeScript 技术栈](./adr-001-typescript-stack.md) - Prisma ORM
- [ADR-006: 预聚合表](./adr-006-materialized-views.md) - **必须配合实施**

---

## 参考资料

- [PostgreSQL Read-Only User](https://www.postgresql.org/docs/current/sql-grant.html)
- [Prisma Security](https://www.prisma.io/docs/concepts/components/prisma-client/raw-database-access)
- [专家评审报告](../expert-review.md) - OLTP/OLAP 混用问题

---

**批准者**: Optima BI Team
**实施负责人**: Backend Team
**风险等级**: 🔴 高（需配合 ADR-006 实施）
**改进状态**: 进行中（预聚合表设计已完成）
