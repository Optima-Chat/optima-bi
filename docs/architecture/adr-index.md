# 架构决策记录 (ADR)

> Architecture Decision Records - 记录 optima-bi 的关键技术决策

## 📚 决策索引

| ADR | 标题 | 状态 | 日期 |
|-----|------|------|------|
| [ADR-001](./adr-001-typescript-stack.md) | 选择 TypeScript 而非 Python | ✅ 已采纳 | 2025-01-21 |
| [ADR-002](./adr-002-direct-db-access.md) | 直接数据库访问而非 API 调用 | ⚠️ 需改进 | 2025-01-21 |
| [ADR-003](./adr-003-oauth-device-flow.md) | OAuth 2.0 Device Flow 认证 | ✅ 已采纳 | 2025-01-21 |
| [ADR-004](./adr-004-json-output.md) | JSON 默认输出 + Pretty 选项 | ✅ 已采纳 | 2025-01-21 |
| [ADR-005](./adr-005-multi-env.md) | 多环境支持 | ✅ 已采纳 | 2025-01-21 |
| [ADR-006](./adr-006-clickhouse-olap.md) | ClickHouse + CDC 实时同步 | 🔴 必须采纳 | 2025-01-21 |
| [ADR-007](./adr-007-web-dashboard.md) | Web 可视化界面（Dashboard） | ✅ 已采纳 | 2025-01-21 |

## 📖 如何阅读 ADR

每个 ADR 包含以下部分：
- **状态**: 提议/已采纳/已弃用/被取代
- **背景**: 为什么需要做这个决策
- **决策**: 我们选择了什么方案
- **理由**: 为什么选择这个方案
- **替代方案**: 我们考虑过但放弃的方案
- **影响**: 这个决策的后果和影响
- **相关决策**: 与其他 ADR 的关系

## 🎯 快速导航

### 已采纳的关键决策
- **技术栈**: TypeScript + Fastify + Prisma ([ADR-001](./adr-001-typescript-stack.md))
- **认证方式**: OAuth 2.0 Device Flow ([ADR-003](./adr-003-oauth-device-flow.md))
- **输出格式**: JSON 默认 + Pretty 选项 ([ADR-004](./adr-004-json-output.md))

### 需要改进的决策
- **数据访问**: 直接访问 OLTP 数据库存在性能风险 ([ADR-002](./adr-002-direct-db-access.md))
  - **改进方案**: 引入 ClickHouse OLAP + CDC 实时同步 ([ADR-006](./adr-006-clickhouse-olap.md))

### 待讨论的决策
- ClickHouse 集群化时机（单节点 → 多节点）
- 数据保留策略（历史数据归档方案）
- Web Dashboard 移动端 App（PWA vs React Native）

---

**维护者**: Optima BI Team
**最后更新**: 2025-01-21
