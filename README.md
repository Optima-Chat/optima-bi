# Optima BI

Business Intelligence 模块，为 Optima Commerce 商家提供数据智能分析功能。

## 架构设计

```
商家用户 → Claude Code → bi-cli → bi-backend → Optima Commerce System
          (AI 分析)   (数据获取) (数据处理)    (数据源)
```

## 核心组件

- **Claude Code**: AI 驱动的智能分析和决策支持
- **bi-cli**: 命令行工具，提供结构化数据获取能力
- **bi-backend**: 后端服务，处理数据聚合、清洗和基础计算

## 文档

- [产品需求文档 (PRD)](./docs/prd.md)
- [技术设计文档](./docs/tech-design.md)

## 快速开始

### 安装 bi-cli

```bash
npm install -g @optima-chat/bi-cli
```

### 配置认证

```bash
bi-cli auth login --api-key YOUR_API_KEY
```

### 使用示例

```bash
# 查看最近7天销售数据
bi-cli sales get --days 7

# 查看流失客户
bi-cli customer get --segment churned

# 查看低库存商品
bi-cli inventory get --status low
```

## 通过 Claude Code 使用

```
商家: "帮我分析最近7天的销售情况"
Claude Code: [调用 bi-cli，分析数据，生成洞察和建议]
```

## 开发

### bi-cli

```bash
cd packages/bi-cli
npm install
npm run dev
```

### bi-backend

```bash
cd packages/bi-backend
npm install
npm run dev
```

使用 Docker Compose 启动完整环境：

```bash
docker compose up -d
```

## 技术栈

- **语言**: TypeScript / Node.js 18+
- **CLI 框架**: Commander.js
- **后端框架**: Express.js / Fastify
- **数据库**: PostgreSQL 14+
- **缓存**: Redis 7+
- **ORM**: Prisma
- **容器化**: Docker

## 许可

MIT License
