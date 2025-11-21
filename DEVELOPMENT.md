# Optima BI Development Guide

## 📁 Project Structure

```
optima-bi/
├── packages/
│   ├── bi-backend/          # Fastify API server
│   │   ├── src/
│   │   │   ├── index.ts     # Server entry point
│   │   │   ├── config/      # Configuration
│   │   │   └── utils/       # Utilities (logger, etc.)
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── bi-cli/              # Commander.js CLI
│       ├── src/
│       │   ├── index.ts     # CLI entry point
│       │   ├── config/      # Config management (Conf)
│       │   └── utils/       # Output formatting
│       ├── package.json
│       └── tsconfig.json
├── infrastructure/          # Docker infrastructure
│   ├── clickhouse/          # ClickHouse configs & init SQL
│   ├── debezium/            # Debezium CDC connectors
│   └── postgres/            # PostgreSQL init SQL
├── docs/                    # Documentation
├── scripts/                 # Utility scripts
├── docker-compose.yml       # Full stack (ClickHouse + Kafka + CDC)
├── package.json             # Workspace root
├── tsconfig.json            # Base TypeScript config
├── .eslintrc.json           # ESLint config
├── .prettierrc.json         # Prettier config
└── .husky/                  # Git hooks
```
