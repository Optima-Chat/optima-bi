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
- 🎨 **Web Dashboard**: 可视化图表，交互式分析，移动端友好
- 🔐 **安全认证**: OAuth 2.0 Device Flow（CLI）/ Web Flow（Dashboard）
- 🏪 **商家分析**: 销售、客户、库存、财务、物流全方位数据
- 🏢 **平台分析**: GMV、商家活跃度、订阅收入（管理员专用）

## 🏗️ 架构设计

```
┌─────────────────────────────────────────────────────────────┐
│  用户界面层                                                  │
│  ┌──────────────────┐    ┌─────────────────────────────┐   │
│  │ Claude Code      │    │ Web Dashboard (bi-web)      │   │
│  │ (AI 分析)        │    │ (Next.js 14 + shadcn/ui)   │   │
│  └────────┬─────────┘    └────────┬────────────────────┘   │
└───────────┼──────────────────────┼─────────────────────────┘
            │                       │
            ↓ 调用 bi-cli           ↓ HTTP/REST
┌───────────┴──────────────┬────────┴─────────────────────────┐
│  应用层                  │                                   │
│  ┌──────────────────┐   │   ┌─────────────────────────┐   │
│  │ bi-cli           │   │   │ bi-backend              │   │
│  │ (Commander.js)   ├───┼───→ (Fastify + TypeScript) │   │
│  └──────────────────┘   │   └────────┬────────────────┘   │
└──────────────────────────┴────────────┼─────────────────────┘
                                        │
                                        ↓ 查询 ClickHouse
┌────────────────────────────────────────┴─────────────────────┐
│  数据层                                                       │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ ClickHouse OLAP (列式存储 + 物化视图)              │    │
│  └────────────────────┬────────────────────────────────┘    │
│                       ↑ CDC 同步 (< 1 秒)                    │
│  ┌────────────────────┴────────────────────────────────┐    │
│  │ PostgreSQL OLTP (commerce-backend)                  │    │
│  └─────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────┘
```

**职责分离**:
- **Claude Code**: AI 分析、洞察生成、决策建议（CLI 集成）
- **Web Dashboard**: 可视化图表、交互式分析、报表导出（Web 界面）
- **bi-cli**: 数据获取、结构化输出（JSON/Pretty）
- **bi-backend**: 数据查询、聚合计算、多层缓存
- **ClickHouse**: OLAP 数据库（列式存储 + 物化视图）
- **PostgreSQL**: OLTP 数据源（CDC 实时同步到 ClickHouse）

**性能架构**（50-1000倍提升）: L1内存(1min) → L2 Redis(5min) → L3 ClickHouse物化视图 → L4 ClickHouse原始表

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

**方式 1: 在 Claude Code 中用自然语言**（推荐）:
```
"分析最近7天的销售情况"
"哪些客户流失了？"
"库存低于 5 的商品有哪些？"
```

**方式 2: 在终端使用 bi-cli**:
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

**方式 3: 使用 Web Dashboard**（可视化）:
```bash
# 访问 https://bi.optima.chat
# 或本地运行:
cd packages/bi-web
npm run dev
# 访问 http://localhost:3000

# 功能:
# - 可视化销售趋势图（折线图、柱状图、饼图）
# - 交互式客户分析（RFM 模型、留存曲线）
# - 实时数据大屏（管理员）
# - 导出 CSV/Excel/PDF 报表
# - 移动端友好访问
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
- **[开发路线图](./docs/roadmap.md)** - 8-10周（CLI + ClickHouse）/ 11-13周（含 Web）

**深入阅读**:
- **[ADR 索引](./docs/architecture/adr-index.md)** - 7个架构决策记录
  - [ADR-006: ClickHouse + CDC](./docs/architecture/adr-006-clickhouse-olap.md) - OLAP 架构
  - [ADR-007: Web Dashboard](./docs/architecture/adr-007-web-dashboard.md) - 可视化界面
- **[性能优化](./docs/performance-optimization.md)** - ClickHouse、CDC、多层缓存
- **[专家评审](./docs/expert-review.md)** - 第三方评审（6.7/10）
- **[研究总结](./docs/research-summary.md)** - 生态研究导航
- **[API 参考](./docs/api-reference.md)** | **[数据模型](./docs/data-models.md)**

## 🛠️ 技术栈

| 组件 | 技术 |
|------|------|
| **语言** | TypeScript + Node.js 18+ |
| **bi-cli** | Commander.js + axios + conf |
| **bi-backend** | Fastify + Prisma + Redis |
| **bi-web** | Next.js 14 + shadcn/ui + Recharts + NextAuth.js |
| **OLAP 数据库** | ClickHouse (列式存储 + 物化视图) |
| **OLTP 数据库** | PostgreSQL 14+ (commerce-backend) |
| **实时同步** | Debezium CDC + Kafka |
| **缓存** | Redis 7+ + NodeCache (多层缓存) |
| **认证** | OAuth 2.0 Device Flow (CLI) + Web Flow (Dashboard) |
| **部署** | Docker + Docker Compose / Vercel (bi-web) |

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
