# commerce-cli 研究分析

**仓库**: https://github.com/Optima-Chat/commerce-cli

---

## 技术栈

- **TypeScript + Node.js 18+**
- **Commander.js** (CLI 框架)
- **conf** (配置加密存储)
- **axios** (HTTP 客户端)
- **chalk** (彩色输出)

---

## 核心特性

- ✅ OAuth 2.0 Device Flow 认证
- ✅ JSON 默认输出（AI 友好）
- ✅ `--pretty` 选项（彩色表格）
- ✅ 多环境支持（production/stage/development）
- ✅ Token 自动刷新
- ✅ 16 个功能模块，95+ 命令

---

## 配置管理

### 配置目录结构
```
~/.optima/commerce-cli/
├── config-prod.json      # Production 环境（加密）
├── config-stage.json     # Stage 环境
├── config-dev.json       # Development 环境
└── current-env.json      # 当前激活环境
```

### 配置文件格式
```json
{
  "tokens": {
    "access_token": "eyJhbGci...",
    "refresh_token": "eyJhbGci...",
    "expires_in": 3600,
    "expires_at": 1706789400
  },
  "user": {
    "id": "user_abc123",
    "email": "merchant@example.com",
    "name": "John Doe",
    "role": "merchant"
  },
  "api_url": "https://api.optima.shop",
  "auth_url": "https://auth.optima.shop"
}
```

---

## Device Flow 认证流程

### 1. 请求 Device Code
```typescript
POST /oauth/device
Body: { client_id: "commerce-cli-xxx" }

Response: {
  device_code: "xxx",
  user_code: "ABCD-1234",
  verification_uri: "https://auth.optima.shop/device",
  verification_uri_complete: "https://auth.optima.shop/device?user_code=ABCD-1234",
  expires_in: 600,
  interval: 5
}
```

### 2. 用户在浏览器中授权
- CLI 自动打开浏览器
- 用户登录并授权
- 或手动输入 User Code

### 3. 轮询获取 Token
```typescript
POST /oauth/token
Body: {
  grant_type: "urn:ietf:params:oauth:grant-type:device_code",
  device_code: "xxx",
  client_id: "commerce-cli-xxx"
}

Response: {
  access_token: "eyJhbGci...",
  refresh_token: "eyJhbGci...",
  expires_in: 3600,
  token_type: "Bearer"
}
```

---

## 输出格式设计

### JSON 模式（默认，AI 友好）
```bash
$ commerce product list --limit 2
{
  "success": true,
  "data": {
    "products": [...],
    "total": 2
  }
}
```

### Pretty 模式（人类可读）
```bash
$ commerce product list --limit 2 --pretty
┌────────────────────────────────────┐
│  商品列表                           │
├────────────────────────────────────┤
│  总数: 2                           │
└────────────────────────────────────┘
┌──────┬──────────┬───────┬───────┐
│ ID   │ 名称     │ 价格  │ 库存  │
├──────┼──────────┼───────┼───────┤
│ p123 │ 商品A    │ $99   │ 10    │
│ p456 │ 商品B    │ $199  │ 5     │
└──────┴──────────┴───────┴───────┘
```

---

## 环境配置

```typescript
const ENV_CONFIG = {
  production: {
    authUrl: 'https://auth.optima.shop',
    apiUrl: 'https://api.optima.shop',
    clientId: 'optima-cli-cwkbnadr',
  },
  stage: {
    authUrl: 'https://auth-stage.optima.shop',
    apiUrl: 'https://api-stage.optima.shop',
    clientId: 'optima-cli-c5ljkuwx',
  },
  development: {
    authUrl: 'https://auth.optima.chat',
    apiUrl: 'https://api.optima.chat',
    clientId: 'optima-cli-q1hiavyg',
  },
};
```

### 环境切换
```bash
# 登录到 stage 环境
commerce auth login --env stage

# 查看当前环境
commerce auth whoami

# 切换环境
commerce config switch-env production
```

---

## 对 optima-bi 的影响

### 认证方案
- **复用 Device Flow**：bi-cli 使用相同的认证流程
- **配置存储**：参考 `conf` 库的加密存储方案
- **Token 刷新**：实现自动刷新逻辑

### 输出格式
- **JSON 优先**：默认输出 JSON（AI 友好）
- **Pretty 选项**：提供 `--pretty` 选项（人类可读）
- **统一响应格式**：`{ success, data, message, error }`

### 环境管理
- **三环境支持**：production/stage/development
- **独立配置文件**：每个环境独立存储
- **快速切换**：`bi-cli config switch-env <env>`

### CLI 框架
- **Commander.js**：成熟的 CLI 框架
- **子命令结构**：`bi-cli <module> <action> [options]`
- **帮助信息**：完善的 `--help` 输出

---

## 参考实现

### Token 刷新逻辑
```typescript
async function refreshTokenIfNeeded(config: Config): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = config.get('tokens.expires_at');

  // 提前 5 分钟刷新
  if (expiresAt - now < 300) {
    const refreshToken = config.get('tokens.refresh_token');
    const newTokens = await refreshAccessToken(refreshToken);

    config.set('tokens', {
      ...newTokens,
      expires_at: now + newTokens.expires_in
    });
  }
}
```

### Pretty 输出示例
```typescript
function outputPretty(data: any): void {
  if (Array.isArray(data)) {
    console.log(table(data));
  } else {
    console.log(JSON.stringify(data, null, 2));
  }
}
```

---

**维护者**: Optima BI Team
**最后更新**: 2025-01-21
