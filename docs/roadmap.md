# Optima BI 开发路线图

> 本文档定义了 optima-bi 的开发阶段、里程碑和交付计划

## 📅 总体时间线

| 阶段 | 周期 | 核心目标 | 状态 |
|------|------|---------|------|
| **Phase 0** | 1 周 | 文档和规划 | ✅ 已完成 |
| **Phase 1** | 2-3 周 | MVP 核心功能 | 🔜 待开始 |
| **Phase 2** | 2 周 | 平台功能和优化 | ⏳ 计划中 |
| **Phase 3** | 1 周 | 测试和部署 | ⏳ 计划中 |

---

## ✅ Phase 0: 文档和规划（已完成）

**时间**: 已完成
**目标**: 完善技术方案，研究生态系统，制定架构决策

### 交付物
- ✅ 产品需求文档（PRD）
- ✅ 技术设计文档（Tech Design）
- ✅ 研究总结文档（Research Summary）
- ✅ 架构决策记录（5 个 ADR）
- ✅ README 更新

### 关键成果
- 确定技术栈：TypeScript + Fastify + Prisma
- 确定认证方式：OAuth 2.0 Device Flow
- 确定数据访问：直接连接 PostgreSQL（只读）
- 定义输出格式：JSON 默认 + Pretty 选项
- 明确数据模型：7 张核心表，6 个分析维度

---

## 🎯 Phase 1: MVP 核心功能（2-3 周）

**目标**: 实现商家级基础 BI 分析功能，支持 Claude Code 集成

### Week 1: 项目基础设施

#### 1.1 项目结构搭建
- [ ] 创建 monorepo 结构（packages/bi-cli, packages/bi-backend）
- [ ] 配置 TypeScript、ESLint、Prettier
- [ ] 配置 package.json 和 tsconfig.json
- [ ] 设置 Git hooks（husky + lint-staged）

#### 1.2 bi-backend 基础框架
- [ ] 初始化 Fastify 应用
- [ ] 配置 Prisma（连接 commerce-backend DB）
- [ ] 生成 Prisma schema（`prisma db pull`）
- [ ] 实现认证中间件（调用 user-auth）
- [ ] 实现权限中间件（requireAdmin）
- [ ] 配置 Redis 客户端
- [ ] 配置环境变量和日志（pino）

**预期输出**:
```bash
# 项目结构
optima-bi/
├── packages/
│   ├── bi-cli/
│   │   ├── src/
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── bi-backend/
│       ├── src/
│       ├── prisma/schema.prisma
│       ├── package.json
│       └── tsconfig.json
├── docker-compose.yml
└── package.json (workspace root)
```

#### 1.3 bi-cli 基础框架
- [ ] 初始化 Commander.js CLI
- [ ] 实现配置管理（conf 加密存储）
- [ ] 实现多环境支持（production/stage/development）
- [ ] 实现 HTTP 客户端（axios + 拦截器）
- [ ] 实现输出格式切换（JSON / Pretty）

**预期输出**:
```bash
bi-cli --help
bi-cli config list
bi-cli config set backend-url https://bi-api.optima.chat
```

### Week 2: 认证和核心 API

#### 2.1 OAuth 认证流程（bi-cli）
- [ ] 实现 Device Flow 认证（`auth login`）
  - [ ] 请求 Device Code
  - [ ] 显示授权 URL 和用户代码
  - [ ] 自动打开浏览器
  - [ ] 轮询获取 Token
  - [ ] 加密存储 Token
- [ ] 实现 Token 自动刷新
- [ ] 实现 `auth logout` 命令
- [ ] 实现 `auth whoami` 命令
- [ ] 实现 `auth switch --env` 命令

**测试验证**:
```bash
bi-cli auth login --env development
bi-cli auth whoami
# 输出: merchant@example.com (merchant)
```

#### 2.2 销售分析 API（商家级）
- [ ] **bi-backend**: 实现 `/api/v1/sales` 端点
  - [ ] 查询 orders 表（按 merchant_id 过滤）
  - [ ] 聚合计算（总销售额、订单数、客单价）
  - [ ] 按日期分组
  - [ ] Redis 缓存（5 分钟 TTL）
- [ ] **bi-cli**: 实现 `sales get` 命令
  - [ ] 支持 `--days` 参数
  - [ ] 支持 `--start` / `--end` 参数
  - [ ] JSON 和 Pretty 输出

**测试验证**:
```bash
bi-cli sales get --days 7
# 输出: JSON 格式的销售数据

bi-cli sales get --days 7 --pretty
# 输出: 彩色表格
```

### Week 3: 扩展分析功能

#### 3.1 客户分析（商家级）
- [ ] **bi-backend**: `/api/v1/customers` 端点
  - [ ] 按 customer_email 聚合订单
  - [ ] 计算新客户、复购客户、流失客户
  - [ ] 计算 LTV、复购率
- [ ] **bi-cli**: `customer get` 命令
  - [ ] 支持 `--segment` 参数（new/repeat/churned/vip）
  - [ ] 支持 `--period` 参数

#### 3.2 库存分析（商家级）
- [ ] **bi-backend**: `/api/v1/inventory` 端点
  - [ ] 查询 products 表
  - [ ] 低库存预警（stock_quantity < threshold）
  - [ ] 库存周转率计算
- [ ] **bi-cli**: `inventory get` 命令
  - [ ] 支持 `--status` 参数（low/out/overstock）

#### 3.3 商品分析（商家级）
- [ ] **bi-backend**: `/api/v1/products/top` 端点
  - [ ] 从 order_items 聚合商品销量
  - [ ] 按销售额/销量排序
- [ ] **bi-cli**: `product top` 命令
  - [ ] 支持 `--sort-by` 参数（revenue/quantity）

### Week 3 交付物

**功能清单**:
- ✅ OAuth 2.0 Device Flow 认证
- ✅ 销售分析（商家级）
- ✅ 客户分析（商家级）
- ✅ 库存分析（商家级）
- ✅ 商品分析（商家级）
- ✅ JSON 和 Pretty 双输出模式

**测试验证**:
```bash
# 认证流程
bi-cli auth login --env development
bi-cli auth whoami

# 数据分析
bi-cli sales get --days 30
bi-cli customer get --segment churned
bi-cli inventory get --status low
bi-cli product top --limit 10

# Pretty 模式
bi-cli sales get --days 7 --pretty
```

---

## 🚀 Phase 2: 平台功能和优化（2 周）

**目标**: 实现平台级分析，性能优化，完善错误处理

### Week 4: 平台分析功能

#### 4.1 平台概览（管理员）
- [ ] **bi-backend**: `/api/v1/platform/overview` 端点
  - [ ] 计算平台 GMV
  - [ ] 统计活跃商家数量
  - [ ] 统计订单总量
  - [ ] 同比/环比增长率
- [ ] **bi-cli**: `platform overview` 命令
  - [ ] 需要管理员权限验证
  - [ ] 支持 `--month` 参数

#### 4.2 商家分析（管理员）
- [ ] **bi-backend**: `/api/v1/platform/merchants` 端点
  - [ ] 商家分层（活跃/休眠/流失）
  - [ ] 商家 GMV 排行
  - [ ] 商家增长趋势
- [ ] **bi-cli**: `platform merchants` 命令
  - [ ] 支持 `--segment` 参数（active/sleeping/churned/top）

#### 4.3 订阅分析（管理员）
- [ ] **bi-backend**: `/api/v1/platform/subscription` 端点
  - [ ] 计算 MRR（Monthly Recurring Revenue）
  - [ ] 计算 ARR（Annual Recurring Revenue）
  - [ ] 计算流失率（Churn Rate）
  - [ ] 按计划分组（free/pro/enterprise）
- [ ] **bi-cli**: `platform subscription` 命令
  - [ ] 支持 `--plan` 参数
  - [ ] 支持 `--metrics` 参数（mrr,arr,churn）

#### 4.4 财务分析（管理员）
- [ ] **bi-backend**: `/api/v1/platform/revenue` 端点
  - [ ] 平台手续费收入统计
  - [ ] 订阅收入统计
  - [ ] 转账汇总
- [ ] **bi-cli**: `platform revenue` 命令
  - [ ] 支持 `--breakdown` 选项（细分收入来源）

#### 4.5 管理员权限扩展
- [ ] 支持 `--merchant-id` 参数查看指定商家数据
  ```bash
  bi-cli sales get --merchant-id merchant_xxx --days 30
  bi-cli customer get --merchant-id merchant_xxx --segment all
  ```

### Week 5: 性能优化和完善

#### 5.1 性能优化
- [ ] 实现智能缓存策略
  - [ ] L1 缓存：热点数据（5 分钟 TTL）
  - [ ] L2 缓存：历史数据（1 小时 TTL）
- [ ] 数据库查询优化
  - [ ] 添加必要的索引
  - [ ] 优化 SQL 查询（使用 EXPLAIN 分析）
- [ ] 分页支持
  - [ ] 所有列表接口支持 `--limit` 和 `--page` 参数

#### 5.2 错误处理和日志
- [ ] 统一错误响应格式
  ```json
  {
    "success": false,
    "error": {
      "code": "UNAUTHORIZED",
      "message": "Invalid token",
      "details": "Token has expired"
    }
  }
  ```
- [ ] 完善日志记录（pino）
  - [ ] 请求日志（API 端点、耗时）
  - [ ] 错误日志（堆栈跟踪）
  - [ ] 缓存命中日志
- [ ] bi-cli 错误处理
  - [ ] 友好的错误提示
  - [ ] 网络超时重试
  - [ ] Token 过期自动刷新

#### 5.3 文档完善
- [ ] 生成 OpenAPI 文档（@fastify/swagger）
- [ ] 创建 API 参考文档
- [ ] 更新 README 的使用示例
- [ ] 创建故障排查指南

### Phase 2 交付物

**功能清单**:
- ✅ 平台分析（GMV、商家、订阅、财务）
- ✅ 管理员权限控制
- ✅ 性能优化（缓存、分页、索引）
- ✅ 完善的错误处理和日志
- ✅ OpenAPI 文档

**性能指标**:
- API 响应时间 < 500ms（缓存命中）
- API 响应时间 < 2s（数据库查询）
- 缓存命中率 > 60%

---

## 🧪 Phase 3: 测试和部署（1 周）

**目标**: 完整测试，部署到生产环境

### Week 6: 测试和部署

#### 6.1 单元测试
- [ ] bi-backend 单元测试
  - [ ] 认证中间件测试
  - [ ] 销售分析服务测试
  - [ ] 客户分析服务测试
  - [ ] 缓存服务测试
- [ ] bi-cli 单元测试
  - [ ] 配置管理测试
  - [ ] 命令解析测试
  - [ ] HTTP 客户端测试
- [ ] 测试覆盖率 > 70%

#### 6.2 集成测试
- [ ] bi-cli → bi-backend 集成测试
- [ ] bi-backend → user-auth 集成测试
- [ ] bi-backend → commerce-backend DB 集成测试
- [ ] 端到端流程测试
  - [ ] 登录 → 查询销售 → 输出结果
  - [ ] Token 刷新流程
  - [ ] 多环境切换

#### 6.3 部署准备
- [ ] Docker 镜像构建
  - [ ] bi-backend Dockerfile
  - [ ] Docker Compose 配置
- [ ] 环境变量配置
  - [ ] Production 环境配置
  - [ ] Stage 环境配置
  - [ ] Development 环境配置
- [ ] 数据库准备
  - [ ] 创建只读数据库用户
  - [ ] 验证数据库连接权限
- [ ] Redis 部署
  - [ ] Redis 配置
  - [ ] 持久化配置

#### 6.4 部署和验证
- [ ] 部署到 Stage 环境
  - [ ] bi-backend 部署
  - [ ] 验证 API 可访问
  - [ ] 验证认证流程
- [ ] 发布 bi-cli 到 npm（beta 版本）
  ```bash
  npm publish --tag beta @optima-chat/bi-cli
  ```
- [ ] 端到端测试（Stage 环境）
- [ ] 部署到 Production 环境
- [ ] 发布 bi-cli 到 npm（正式版本）

#### 6.5 监控和运维
- [ ] 配置监控告警
  - [ ] API 响应时间监控
  - [ ] 错误率监控
  - [ ] 缓存命中率监控
- [ ] 日志聚合和分析
- [ ] 性能监控仪表盘

### Phase 3 交付物

**质量指标**:
- ✅ 单元测试覆盖率 > 70%
- ✅ 集成测试通过
- ✅ API 响应时间 < 2s
- ✅ 错误率 < 1%

**部署产物**:
- ✅ bi-backend Docker 镜像
- ✅ bi-cli npm 包（@optima-chat/bi-cli）
- ✅ 部署文档和运维手册
- ✅ 监控仪表盘

---

## 🎯 里程碑和验收标准

### Milestone 1: MVP 完成（Week 3 结束）

**验收标准**:
1. ✅ 商家可以通过 `bi-cli auth login` 完成认证
2. ✅ 商家可以查询销售数据（`bi-cli sales get --days 7`）
3. ✅ 商家可以查询客户数据（`bi-cli customer get --segment churned`）
4. ✅ 商家可以查询库存数据（`bi-cli inventory get --status low`）
5. ✅ 支持 JSON 和 Pretty 两种输出模式
6. ✅ Claude Code 可以调用 bi-cli 并解析 JSON 输出

**演示场景**:
```
商家: "帮我分析最近 7 天的销售情况"
Claude Code: [调用 bi-cli sales get --days 7]
Claude Code: "最近 7 天销售额 12.5 万美元，同比增长 6%。
             订单量 342 单，客单价 367 美元。
             周末销量较高，建议增加库存备货。"
```

### Milestone 2: 平台功能完成（Week 5 结束）

**验收标准**:
1. ✅ 管理员可以查询平台 GMV（`bi-cli platform overview`）
2. ✅ 管理员可以分析商家活跃度（`bi-cli platform merchants --segment active`）
3. ✅ 管理员可以查询订阅 MRR（`bi-cli platform subscription --metrics mrr`）
4. ✅ 管理员可以查看指定商家数据（`--merchant-id` 参数）
5. ✅ API 响应时间 < 2s
6. ✅ 缓存命中率 > 60%

### Milestone 3: 生产部署（Week 6 结束）

**验收标准**:
1. ✅ bi-backend 部署到 Production 环境
2. ✅ bi-cli 发布到 npm（@optima-chat/bi-cli@1.0.0）
3. ✅ Stage 环境端到端测试通过
4. ✅ Production 环境端到端测试通过
5. ✅ 监控和告警配置完成
6. ✅ 文档更新完成（API 参考、部署文档、故障排查）

---

## 📊 工作量估算

| 阶段 | 开发 | 测试 | 文档 | 总计 |
|------|-----|------|------|------|
| Phase 0 | - | - | 40h | 40h |
| Phase 1 | 80h | 10h | 10h | 100h |
| Phase 2 | 60h | 15h | 5h | 80h |
| Phase 3 | 20h | 20h | 10h | 50h |
| **总计** | **160h** | **45h** | **65h** | **270h** |

**假设**:
- 1 人全职开发
- 每周工作 40 小时
- 总计约 **6-7 周**

---

## 🚧 风险和缓解措施

### 技术风险

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| commerce-backend DB 架构变更 | 高 | 中 | 使用 Prisma 自动生成 schema，定期同步 |
| user-auth API 变更 | 高 | 低 | 编写适配层，隔离外部依赖 |
| 性能不达标 | 中 | 中 | 提前性能测试，优化 SQL 查询，增加缓存 |
| 数据库只读权限不足 | 高 | 低 | 提前与 DBA 确认权限，创建专用只读用户 |

### 进度风险

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| 需求变更 | 中 | 中 | 敏捷迭代，优先 MVP 功能 |
| 技术难点卡点 | 中 | 中 | 提前技术调研，预留缓冲时间 |
| 集成测试困难 | 低 | 低 | 使用 Docker Compose 模拟完整环境 |

---

## 📝 下一步行动

### 立即开始（本周）

1. **确认开发计划**
   - [ ] Review 本路线图
   - [ ] 评估时间和资源
   - [ ] 确认优先级

2. **搭建项目基础设施**
   - [ ] 创建 monorepo 结构
   - [ ] 配置 TypeScript、ESLint、Prettier
   - [ ] 初始化 bi-backend（Fastify + Prisma）
   - [ ] 初始化 bi-cli（Commander.js）

3. **连接 commerce-backend 数据库**
   - [ ] 获取只读数据库连接信息
   - [ ] 使用 Prisma 生成 schema
   - [ ] 验证数据库连接

**本周目标**: 完成 Phase 1 Week 1 的所有任务

---

## 🎯 成功标准

**MVP 成功标准**:
1. 商家可以通过自然语言（Claude Code）查询销售数据
2. 输出格式友好，AI 可解析
3. 认证安全可靠（OAuth 2.0）
4. 性能满足需求（< 2s 响应）

**最终成功标准**:
1. 商家和管理员日活使用
2. Claude Code 集成顺畅
3. 系统稳定运行（99.9% 可用性）
4. 用户满意度高（NPS > 8）

---

**路线图版本**: v1.0
**创建日期**: 2025-01-21
**维护者**: Optima BI Team
