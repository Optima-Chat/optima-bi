# ADR-001: 选择 TypeScript 而非 Python

**状态**: ✅ 已采纳
**日期**: 2025-01-21
**决策者**: Optima BI Team

---

## 背景

optima-bi 需要选择技术栈实现 bi-cli 和 bi-backend。主要候选方案：

1. **TypeScript** (Node.js)
2. **Python** (与 commerce-backend 技术栈一致)

---

## 决策

**选择 TypeScript** 作为 optima-bi 全栈语言（bi-cli + bi-backend）

### 技术栈
- **Backend**: TypeScript + Fastify + Prisma
- **CLI**: TypeScript + Commander.js + conf
- **数据库**: PostgreSQL (commerce-backend，只读访问)
- **缓存**: Redis 7+
- **运行时**: Node.js 18+

---

## 理由

### 1. 类型安全
- TypeScript 在**编译时**提供完整类型检查
- 减少运行时错误
- IDE 智能提示和重构支持
- Prisma 自动生成类型（从数据库 schema）

```typescript
// 类型安全的查询
const orders: Order[] = await prisma.order.findMany({
  where: { merchantId: 'xxx' }
});

// 编译时检查字段名
orders.forEach(order => {
  console.log(order.amountTotal); // ✅ 正确
  console.log(order.amount);      // ❌ 编译错误
});
```

### 2. 前后端统一
- CLI 和 backend 使用相同语言
- 共享类型定义和业务逻辑
- 统一的构建和测试工具链

```typescript
// shared/types.ts（CLI 和 backend 共享）
export interface SalesResponse {
  total_revenue: number;
  order_count: number;
  avg_order_value: number;
}
```

### 3. Prisma ORM 优势
- TypeScript-first ORM
- 从数据库生成类型（`prisma db pull`）
- 类型安全的查询
- 优秀的开发体验

```bash
# 从 commerce-backend DB 生成类型
npx prisma db pull
npx prisma generate
```

### 4. Fastify 性能
- 比 Express 快 **2 倍**
- 比 FastAPI 性能接近
- 插件生态丰富
- 内置 schema 验证

**性能对比**（req/s）:
- Fastify: ~30,000
- Express: ~15,000
- FastAPI: ~25,000

### 5. 生态成熟
- Node.js 生态丰富
- 工具链成熟：vitest、prettier、eslint、tsx
- 大量现成库：zod、pino、commander

### 6. 参考实现
- **commerce-cli**: 已验证 TypeScript CLI 可行性
- Device Flow 认证
- JSON 输出 + Pretty 模式
- 多环境支持

### 7. 未来扩展
- 如需 Web 界面，可直接复用类型和业务逻辑
- Next.js/React 可无缝集成
- 参考 optima-store 的 TypeScript 实践

---

## 替代方案

### 方案 A: Python + FastAPI

**优势**:
- 与 commerce-backend 技术栈一致
- 团队可能更熟悉 Python
- SQLAlchemy ORM 成熟

**劣势**:
- CLI 和 backend 需要重复定义类型
- 没有编译时类型检查（即使使用 Pydantic）
- 需要学习 Click/Typer（CLI 框架）
- 无法复用 commerce-cli 的经验

**结论**: ❌ 放弃

---

## 影响

### 正面影响

1. **开发效率**:
   - 类型安全减少 bug
   - IDE 智能提示提高生产力
   - 前后端代码复用

2. **代码质量**:
   - 编译时类型检查
   - 统一的代码风格（Prettier + ESLint）
   - 更好的重构支持

3. **性能**:
   - Fastify 性能优秀
   - Prisma 查询优化
   - Node.js 异步 I/O 高效

### 负面影响

1. **技术栈差异**:
   - 与 commerce-backend（Python）技术栈不一致
   - 无法直接复用 SQLAlchemy 模型
   - 需要使用 Prisma 从数据库生成 schema

2. **学习曲线**:
   - 团队需要学习 TypeScript（如果不熟悉）
   - 需要学习 Prisma ORM
   - 需要学习 Fastify 框架

### 缓解措施

1. **数据模型生成**:
   ```bash
   # 从 commerce-backend DB 自动生成 Prisma schema
   npx prisma db pull --url="postgresql://readonly_user:pass@host:5432/commerce"
   npx prisma generate
   ```

2. **参考文档**:
   - 创建 Prisma → SQLAlchemy 对照表
   - 提供代码示例和最佳实践
   - 参考 commerce-cli 的实现

3. **渐进式学习**:
   - TypeScript 可以从 JavaScript 逐步迁移
   - Prisma 文档完善，学习曲线较低
   - Fastify 类似 Express，易于上手

---

## 实施计划

### Phase 1: 项目搭建
- [x] 初始化 TypeScript 项目
- [x] 配置 Prisma 连接 commerce-backend DB
- [x] 生成 Prisma schema 和 TypeScript 类型
- [x] 配置 ESLint + Prettier

### Phase 2: bi-backend 开发
- [ ] 实现 Fastify server
- [ ] 实现认证中间件
- [ ] 实现数据查询接口
- [ ] 实现缓存层

### Phase 3: bi-cli 开发
- [ ] 实现 CLI 框架（Commander.js）
- [ ] 实现 Device Flow 认证
- [ ] 实现命令和输出格式
- [ ] 多环境配置

---

## 相关决策

- [ADR-002: 直接数据库访问](./adr-002-direct-db-access.md) - 需要 Prisma 生成类型
- [ADR-003: OAuth Device Flow](./adr-003-oauth-device-flow.md) - 参考 commerce-cli 实现
- [ADR-004: JSON 输出](./adr-004-json-output.md) - TypeScript 类型安全的 JSON 处理

---

## 参考资料

- [Fastify Benchmarks](https://www.fastify.io/benchmarks/)
- [Prisma vs SQLAlchemy](https://www.prisma.io/docs/concepts/more/comparisons)
- [TypeScript Best Practices](https://www.typescriptlang.org/docs/handbook/declaration-files/do-s-and-don-ts.html)
- [commerce-cli 仓库](https://github.com/Optima-Chat/commerce-cli)

---

**批准者**: Optima BI Team
**实施负责人**: Backend Team
**风险等级**: 🟡 中等（技术栈切换）
