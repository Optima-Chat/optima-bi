# Optima BI

> AI 驱动的商业智能分析，为 Optima Commerce 商家和平台提供数据洞察

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=flat&logo=typescript)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green?style=flat&logo=node.js)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat)](https://opensource.org/licenses/MIT)

## 🎯 核心理念

商家用自然语言提问 → Claude Code 智能分析 → bi-cli 获取数据 → 生成洞察和建议

**关键特性**:
- 🤖 **AI 优先**: JSON 格式输出，专为 Claude Code 设计
- 📊 **双输出模式**: JSON（AI 友好）+ Pretty 模式（彩色表格）
- 🔐 **安全认证**: OAuth 2.0 Device Flow，Token 加密存储
- 🏪 **商家分析**: 销售、客户、库存、财务、物流全方位数据
- 🏢 **平台分析**: GMV、商家活跃度、订阅收入（管理员专用）

## 🏗️ 架构设计

```
商家/管理员 → Claude Code → bi-cli → bi-backend → commerce-backend DB
            (AI 分析)   (TypeScript) (Fastify)   (PostgreSQL 只读)
```

**职责分离**:
- **Claude Code**: AI 分析、洞察生成、决策建议
- **bi-cli**: 数据获取、结构化输出（JSON/Pretty）
- **bi-backend**: 数据查询、聚合计算、多层缓存
- **commerce-backend DB**: 数据源（只读访问 + 预聚合表）

**性能架构**（10-100倍提升）: L1内存(1min) → L2 Redis(5min) → L3预聚合表 → L4原始表

## 🚀 快速开始

### 安装

```bash
npm install -g @optima-chat/bi-cli@latest
```

### 认证

```bash
# OAuth 2.0 Device Flow 认证
bi-cli auth login

# 会自动打开浏览器，输入代码完成授权
```

### 使用示例

**在 Claude Code 中用自然语言**:
```
"分析最近7天的销售情况"
"哪些客户流失了？"
"库存低于 5 的商品有哪些？"
```

**或直接在终端使用**:
```bash
# JSON 模式（默认，AI 友好）
bi-cli sales get --days 7

# Pretty 模式（彩色表格）
bi-cli sales get --days 7 --pretty

# 客户分析
bi-cli customer get --segment churned

# 库存预警
bi-cli inventory get --status low

# 平台分析（管理员）
bi-cli platform overview --month current
```

## 📦 核心功能

### 商家分析（🏪）
- **销售数据**: GMV、订单量、客单价、增长率
- **客户分析**: 新客/复购/流失、LTV、复购率
- **库存管理**: 库存预警、周转率、销量排行
- **财务报表**: 收入、手续费、净收入、转账记录
- **物流跟踪**: 发货时长、配送时效、异常率

### 平台分析（🏢 管理员专用）
- **GMV 概览**: 平台总交易额、增长趋势
- **商家分析**: 活跃商家、流失商家、Top 商家
- **订阅收入**: MRR、ARR、流失率、转化率
- **财务汇总**: 平台手续费收入、转账汇总

## 📚 文档

**核心文档**:
- **[产品需求 (PRD)](./docs/prd.md)** - 功能需求和用户故事
- **[技术设计](./docs/tech-design.md)** - 架构设计、性能优化
- **[开发路线图](./docs/roadmap.md)** - 7-10周开发计划

**深入阅读**:
- **[ADR 索引](./docs/architecture/adr-index.md)** - 6个架构决策记录
- **[性能优化](./docs/performance-optimization.md)** - 预聚合表、多层缓存
- **[专家评审](./docs/expert-review.md)** - 第三方评审（6.7/10）
- **[研究总结](./docs/research-summary.md)** - 生态研究导航
- **[API 参考](./docs/api-reference.md)** | **[数据模型](./docs/data-models.md)**

## 🛠️ 技术栈

| 组件 | 技术 |
|------|------|
| **语言** | TypeScript + Node.js 18+ |
| **bi-cli** | Commander.js + axios + conf |
| **bi-backend** | Fastify + Prisma + Redis |
| **数据库** | PostgreSQL 14+ (只读 + 预聚合表) |
| **缓存** | Redis 7+ (多层缓存架构) |
| **认证** | OAuth 2.0 Device Flow |
| **部署** | Docker + Docker Compose |

## 💻 开发

### 环境要求
- Node.js 18+
- PostgreSQL 14+
- Redis 7+

### 启动开发环境

```bash
# 克隆项目
git clone https://github.com/Optima-Chat/optima-bi.git
cd optima-bi

# 安装依赖
npm install

# 启动服务（Docker Compose）
docker compose up -d

# bi-cli 开发
cd packages/bi-cli
npm run dev

# bi-backend 开发
cd packages/bi-backend
npm run dev
```

## 🔐 认证说明

使用 **OAuth 2.0 Device Flow** 认证：
1. 运行 `bi-cli auth login`
2. 浏览器自动打开授权页面
3. 输入显示的代码完成授权
4. Token 加密存储到 `~/.optima/bi-cli/config.json`

**多环境支持**:
```bash
bi-cli auth login --env production   # 生产环境
bi-cli auth login --env stage        # 测试环境
bi-cli auth login --env development  # 开发环境
```

## 📄 许可

MIT License

---

**Built with ❤️ for Optima Commerce merchants and platform team**
