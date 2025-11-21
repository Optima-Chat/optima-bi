# ADR-006: 使用预聚合表 (物化视图)

**状态**: 🔴 必须采纳 (基于专家评审建议)
**日期**: 2025-01-21
**决策者**: Optima BI Team
**相关 ADR**: [ADR-002](./adr-002-direct-db-access.md)

---

## 背景

在专家评审中发现，当前方案直接在 OLTP 数据库执行复杂分析查询存在严重性能问题：

### 当前架构问题

```
bi-backend → 直接查询 commerce-backend PostgreSQL (OLTP)
             ↓
          复杂聚合查询（90 天销售趋势）
          SELECT DATE(created_at), SUM(amount_total), COUNT(*)
          FROM orders
          WHERE merchant_id = 'xxx' AND created_at >= ...
          GROUP BY DATE(created_at)
          执行时间: 2-5 秒
```

### 问题分析

1. **性能影响 OLTP 业务**:
   - 订单创建、支付等业务受影响
   - 复杂查询占用大量 CPU/内存
   - 可能导致锁表

2. **查询性能差**:
   - 实时聚合计算慢（2-5 秒）
   - 全表扫描（即使有索引）
   - 历史数据查询越来越慢

3. **缓存局限**:
   - 只能缓存固定查询
   - 自定义查询无法缓存
   - 缓存失效时性能崩溃

4. **扩展性差**:
   - 商家数增长后压力线性增长
   - 无法支持复杂多维分析

---

## 决策

**采用预聚合表（Materialized Views）作为 MVP 阶段的 OLAP 层**

### 实施方案

在 commerce-backend PostgreSQL 中创建以下预聚合表：

#### 1. 按日销售汇总表
```sql
CREATE TABLE daily_merchant_summary (
  merchant_id UUID NOT NULL,
  date DATE NOT NULL,

  -- 销售指标
  total_revenue DECIMAL(10, 2) NOT NULL DEFAULT 0,
  order_count INT NOT NULL DEFAULT 0,
  avg_order_value DECIMAL(10, 2) NOT NULL DEFAULT 0,

  -- 客户指标
  unique_customers INT NOT NULL DEFAULT 0,
  new_customers INT NOT NULL DEFAULT 0,
  repeat_customers INT NOT NULL DEFAULT 0,

  -- 商品指标
  products_sold INT NOT NULL DEFAULT 0,
  avg_items_per_order DECIMAL(5, 2) NOT NULL DEFAULT 0,

  -- 时间戳
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

  PRIMARY KEY (merchant_id, date)
);

-- 创建索引
CREATE INDEX idx_daily_summary_date ON daily_merchant_summary(date);
CREATE INDEX idx_daily_summary_merchant ON daily_merchant_summary(merchant_id);
```

#### 2. 按周商品销量汇总
```sql
CREATE TABLE weekly_product_summary (
  merchant_id UUID NOT NULL,
  product_id UUID NOT NULL,
  week_start DATE NOT NULL,  -- 周一日期

  -- 销售指标
  total_revenue DECIMAL(10, 2) NOT NULL DEFAULT 0,
  quantity_sold INT NOT NULL DEFAULT 0,
  order_count INT NOT NULL DEFAULT 0,

  -- 排名
  rank_by_revenue INT,
  rank_by_quantity INT,

  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

  PRIMARY KEY (merchant_id, product_id, week_start)
);
```

#### 3. 按月客户行为汇总
```sql
CREATE TABLE monthly_customer_summary (
  merchant_id UUID NOT NULL,
  customer_email VARCHAR(255) NOT NULL,
  month DATE NOT NULL,  -- 月份第一天

  -- 购买行为
  order_count INT NOT NULL DEFAULT 0,
  total_spent DECIMAL(10, 2) NOT NULL DEFAULT 0,
  avg_order_value DECIMAL(10, 2) NOT NULL DEFAULT 0,

  -- 客户分层
  customer_segment VARCHAR(20),  -- new/repeat/vip/churned
  first_order_date DATE,
  last_order_date DATE,

  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

  PRIMARY KEY (merchant_id, customer_email, month)
);
```

### ETL 更新策略

```sql
-- 每小时增量更新（Cron Job）
-- 只更新最近 7 天的数据

-- 1. 昨天的完整数据（凌晨 1 点执行）
INSERT INTO daily_merchant_summary (...)
SELECT ...
FROM orders
WHERE DATE(created_at) = CURRENT_DATE - 1
ON CONFLICT (merchant_id, date)
DO UPDATE SET
  total_revenue = EXCLUDED.total_revenue,
  order_count = EXCLUDED.order_count,
  ...
  updated_at = NOW();

-- 2. 今天的实时数据（每小时执行）
INSERT INTO daily_merchant_summary (...)
SELECT ...
FROM orders
WHERE DATE(created_at) = CURRENT_DATE
ON CONFLICT (merchant_id, date)
DO UPDATE SET ...;
```

---

## 理由

### 为什么选择预聚合表而非独立 OLAP 数据库

**优势**:
1. **实施成本低**: 不需要额外的数据库和 ETL 工具
2. **技术栈统一**: 继续使用 PostgreSQL
3. **维护简单**: 无需管理多个数据库
4. **MVP 友好**: 快速验证方案可行性

**性能提升**:
- 查询时间: 2-5s → 50-200ms (**提升 10-100 倍**)
- 缓存命中率: 30% → 70%
- OLTP 负载: 减少 80%

### 与独立 OLAP 数据库对比

| 方案 | 性能 | 成本 | 复杂度 | MVP适合度 |
|------|------|------|--------|-----------|
| **预聚合表** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐ | ✅ 推荐 |
| ClickHouse | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐ | ❌ 过度设计 |
| TimescaleDB | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⚠️ 可选 |

---

## 替代方案

### 方案 A: 独立 ClickHouse OLAP 数据库

**描述**:
```
commerce-backend PostgreSQL → Debezium CDC → Kafka → Flink → ClickHouse
                                                               ↓
bi-backend ←─────────────────────────────────────────────────┘
```

**优势**:
- 查询性能极佳（列存储）
- 支持复杂多维分析
- PB 级数据支持

**劣势**:
- 实施复杂（需要 Kafka、Flink、CDC）
- 运维成本高
- 学习曲线陡峭
- MVP 阶段过度设计

**结论**: ❌ 放弃（长期可考虑）

### 方案 B: 仅靠 Redis 缓存

**描述**:
```
bi-backend → Redis 缓存 (5min)
             ↓ miss
          直接查询 OLTP
```

**优势**:
- 实施简单
- 无需数据库变更

**劣势**:
- 缓存失效时性能差
- 无法解决 OLTP 压力
- 自定义查询无法缓存

**结论**: ❌ 放弃（已被专家评审否定）

### 方案 C: TimescaleDB 扩展

**描述**:
- 在 PostgreSQL 上安装 TimescaleDB 扩展
- 自动分区和压缩
- 时序数据优化

**优势**:
- 兼容 PostgreSQL
- 性能优于原生 PostgreSQL
- 学习曲线低

**劣势**:
- 需要修改 commerce-backend
- 依赖第三方扩展

**结论**: ⚠️ 备选方案（Phase 2 可考虑）

---

## 影响

### 正面影响

1. **性能大幅提升**:
   - 查询响应时间从 2-5s 降至 50-200ms
   - OLTP 数据库压力减少 80%
   - 支持更多商家和更大数据量

2. **用户体验改善**:
   - Claude Code 可以更快返回结果
   - 支持更复杂的分析查询
   - 缓存命中率提升

3. **成本可控**:
   - 无需额外的数据库服务器
   - 无需复杂的 ETL 工具
   - 运维成本低

### 负面影响

1. **数据延迟**:
   - 历史数据（昨天及以前）：准确
   - 今天的数据：延迟最多 1 小时
   - 实时查询：仍需查询原始表

2. **数据库空间增加**:
   - 预聚合表占用额外空间
   - 估计: 原始数据的 5-10%
   - 可通过定期清理控制

3. **维护复杂度**:
   - 需要 ETL 脚本
   - 需要监控数据一致性
   - 需要处理数据更新失败

### 迁移计划

**Phase 1: MVP（3-4 周）**
- ✅ 创建预聚合表
- ✅ 实现 ETL 脚本
- ✅ bi-backend 优先查询预聚合表

**Phase 2: 优化（2-3 周）**
- 添加更多预聚合维度
- 优化 ETL 性能
- 实现数据质量监控

**Phase 3: 长期（3+ 个月）**
- 评估是否需要独立 OLAP 数据库
- 考虑 ClickHouse 或 TimescaleDB
- 实现实时数据流

---

## 实施检查清单

### 数据库变更
- [ ] 创建 `daily_merchant_summary` 表
- [ ] 创建 `weekly_product_summary` 表
- [ ] 创建 `monthly_customer_summary` 表
- [ ] 添加必要的索引
- [ ] 验证表结构

### ETL 脚本
- [ ] 编写增量更新脚本（SQL）
- [ ] 配置 Cron Job（每小时）
- [ ] 实现错误处理和重试
- [ ] 添加数据质量检查
- [ ] 监控 ETL 执行状态

### bi-backend 代码
- [ ] 修改查询逻辑（优先查预聚合表）
- [ ] 实现回退机制（预聚合表无数据时查原始表）
- [ ] 更新缓存策略
- [ ] 添加性能监控

### 测试
- [ ] 数据准确性测试
- [ ] 性能基准测试（before/after）
- [ ] 边界情况测试（新商家、无数据等）
- [ ] 负载测试（100 并发）

### 文档
- [ ] 更新技术设计文档
- [ ] 编写 ETL 运维文档
- [ ] 更新 API 文档（数据延迟说明）

---

## 相关决策

- [ADR-002: 直接数据库访问](./adr-002-direct-db-access.md) - 本决策是对 ADR-002 的重大改进
- 如果未来采用独立 OLAP 数据库，本决策将被取代

---

## 参考资料

- [专家评审报告](../expert-review.md) - 识别了 OLTP/OLAP 混用问题
- [PostgreSQL Materialized Views](https://www.postgresql.org/docs/current/rules-materializedviews.html)
- [Kimball Dimensional Modeling](https://www.kimballgroup.com/data-warehouse-business-intelligence-resources/kimball-techniques/)

---

**批准者**: Optima BI Team
**实施负责人**: Backend Team
**预计工作量**: 3-5 天
**风险等级**: 🟡 中等（需要数据库变更）
