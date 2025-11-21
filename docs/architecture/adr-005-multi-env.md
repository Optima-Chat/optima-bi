# ADR-005: 多环境支持

**状态**: ✅ 已采纳
**日期**: 2025-01-21
**决策者**: Optima BI Team

---

## 背景

optima-bi 需要支持多个部署环境：
1. **Production**（生产环境）：真实商家数据
2. **Stage**（预发布环境）：测试新功能
3. **Development**（开发环境）：本地开发和调试

需要确保：
- 环境隔离（避免误操作）
- 快速切换
- 配置独立管理

---

## 决策

**bi-cli 支持 3 个独立环境，配置文件隔离**

### 环境列表
- **production**: 生产环境
- **stage**: 预发布环境
- **development**: 开发环境

### 配置存储
- 每个环境独立的配置文件
- 存储位置：`~/.optima/bi-cli/`
- 加密存储（使用 conf）

---

## 理由

### 1. 环境隔离
- 避免误操作影响生产数据
- 测试环境与生产环境完全独立
- 不同环境使用不同的 API 端点

### 2. 灵活切换
- 快速切换环境：`bi-cli config switch-env stage`
- 登录时指定环境：`bi-cli auth login --env stage`
- 查看当前环境：`bi-cli config current-env`

### 3. 参考实现
- commerce-cli 已验证可行性
- 代码可直接参考
- 配置管理方案成熟

### 4. 团队协作
- 开发者使用 development 环境
- QA 使用 stage 环境
- 商家使用 production 环境
- 互不干扰

---

## 环境配置

### 环境端点

```typescript
const ENV_CONFIG = {
  production: {
    authUrl: 'https://auth.optima.shop',
    apiUrl: 'https://bi-api.optima.shop',
    clientId: 'bi-cli-prod',
    configFile: 'config-prod.json',
  },
  stage: {
    authUrl: 'https://auth-stage.optima.shop',
    apiUrl: 'https://bi-api-stage.optima.shop',
    clientId: 'bi-cli-stage',
    configFile: 'config-stage.json',
  },
  development: {
    authUrl: 'https://auth.optima.chat',
    apiUrl: 'https://bi-api.optima.chat',
    clientId: 'bi-cli-dev',
    configFile: 'config-dev.json',
  },
};
```

### 配置目录结构

```
~/.optima/bi-cli/
├── config-prod.json      # Production 环境配置（加密）
├── config-stage.json     # Stage 环境配置（加密）
├── config-dev.json       # Development 环境配置（加密）
└── current-env.json      # 当前激活的环境
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
  "api_url": "https://bi-api.optima.shop",
  "auth_url": "https://auth.optima.shop"
}
```

---

## 使用示例

### 登录到指定环境

```bash
# 登录到 production（默认）
bi-cli auth login

# 登录到 stage
bi-cli auth login --env stage

# 登录到 development
bi-cli auth login --env development
```

### 切换环境

```bash
# 切换到 stage
bi-cli config switch-env stage

# 切换到 production
bi-cli config switch-env production
```

### 查看当前环境

```bash
$ bi-cli config current-env

当前环境: production
API 端点: https://bi-api.optima.shop
认证端点: https://auth.optima.shop
用户: merchant@example.com (merchant)
```

### 查看所有环境

```bash
$ bi-cli config list-envs

可用环境:
  * production    (已登录: merchant@example.com)
    stage         (未登录)
    development   (已登录: dev@example.com)

* 表示当前激活环境
```

### 指定环境执行命令

```bash
# 使用当前环境
bi-cli sales get --days 7

# 临时使用 stage 环境
bi-cli sales get --days 7 --env stage
```

---

## 实施细节

### 环境管理

```typescript
import Conf from 'conf';
import fs from 'fs';
import path from 'path';

const CONFIG_DIR = path.join(os.homedir(), '.optima', 'bi-cli');
const CURRENT_ENV_FILE = path.join(CONFIG_DIR, 'current-env.json');

export function getCurrentEnv(): string {
  if (fs.existsSync(CURRENT_ENV_FILE)) {
    const data = JSON.parse(fs.readFileSync(CURRENT_ENV_FILE, 'utf-8'));
    return data.env;
  }
  return 'production'; // 默认环境
}

export function setCurrentEnv(env: string): void {
  fs.writeFileSync(CURRENT_ENV_FILE, JSON.stringify({ env }));
}

export function getConfig(env?: string): Conf {
  const targetEnv = env || getCurrentEnv();
  const config = ENV_CONFIG[targetEnv];

  return new Conf({
    projectName: 'optima-bi',
    configName: config.configFile.replace('.json', ''),
    encryptionKey: process.env.OPTIMA_CLI_ENCRYPTION_KEY,
  });
}
```

### 环境切换

```typescript
export async function switchEnv(newEnv: string): Promise<void> {
  if (!['production', 'stage', 'development'].includes(newEnv)) {
    throw new Error(`Invalid environment: ${newEnv}`);
  }

  const config = getConfig(newEnv);
  const hasToken = config.has('tokens.access_token');

  if (!hasToken) {
    console.log(
      chalk.yellow(`环境 ${newEnv} 尚未登录，请运行: bi-cli auth login --env ${newEnv}`)
    );
    return;
  }

  setCurrentEnv(newEnv);
  console.log(chalk.green(`✓ 已切换到 ${newEnv} 环境`));
}
```

### API 请求

```typescript
import axios from 'axios';

export async function apiRequest(
  endpoint: string,
  options?: RequestOptions
): Promise<any> {
  const env = options?.env || getCurrentEnv();
  const config = getConfig(env);
  const envConfig = ENV_CONFIG[env];

  const token = await getValidToken(config);

  const response = await axios({
    url: `${envConfig.apiUrl}${endpoint}`,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    ...options,
  });

  return response.data;
}
```

---

## 替代方案

### 方案 A: 单一配置文件 + 环境字段

**描述**:
```json
{
  "current_env": "production",
  "environments": {
    "production": { ... },
    "stage": { ... },
    "development": { ... }
  }
}
```

**优势**:
- 配置集中管理

**劣势**:
- 环境切换时需要修改同一个文件
- 容易误操作（修改错误环境）
- 不利于并发使用（多个终端）

**结论**: ❌ 放弃

---

### 方案 B: 环境变量

**描述**:
```bash
export OPTIMA_BI_ENV=stage
bi-cli sales get --days 7
```

**优势**:
- 无需配置文件切换
- 适合脚本和 CI/CD

**劣势**:
- 不适合最终用户
- 容易遗忘当前环境
- Token 管理复杂

**结论**: ⚠️ 作为补充（支持 `OPTIMA_BI_ENV` 环境变量覆盖）

---

## 影响

### 正面影响

1. **安全性**:
   - 避免误操作生产环境
   - 测试环境完全隔离
   - 不同环境独立认证

2. **开发效率**:
   - 快速切换环境
   - 并行使用多个环境
   - 适合团队协作

3. **用户体验**:
   - 清晰的环境标识
   - 灵活的环境管理
   - 符合直觉的命令

### 负面影响

1. **配置复杂度**:
   - 需要维护 3 个配置文件
   - 需要管理环境切换逻辑

2. **用户学习成本**:
   - 需要理解环境概念
   - 需要记住环境切换命令

### 缓解措施

1. **默认环境**:
   - 默认使用 production 环境
   - 大多数用户无需关心环境切换

2. **清晰提示**:
   - 命令输出显示当前环境
   - 切换环境时给出确认提示

3. **文档说明**:
   - 提供环境管理文档
   - 示例代码和最佳实践

---

## 实施计划

### Phase 1: 基础支持
- [ ] 实现环境配置管理
- [ ] 实现环境切换命令
- [ ] 实现 `--env` 参数支持
- [ ] 实现当前环境查询

### Phase 2: 用户体验优化
- [ ] 美化环境列表输出
- [ ] 添加环境切换确认提示
- [ ] 实现环境状态检查（是否已登录）
- [ ] 添加 `OPTIMA_BI_ENV` 环境变量支持

### Phase 3: 高级功能（可选）
- [ ] 支持自定义环境
- [ ] 支持环境配置导入/导出
- [ ] 支持环境配置备份

---

## 相关决策

- [ADR-003: OAuth Device Flow](./adr-003-oauth-device-flow.md) - 每个环境独立认证
- [ADR-004: JSON 输出](./adr-004-json-output.md) - 环境信息在输出中体现

---

## 参考资料

- [commerce-cli 多环境支持](https://github.com/Optima-Chat/commerce-cli)
- [conf: Configuration storage](https://github.com/sindresorhus/conf)
- [12-Factor App: Config](https://12factor.net/config)

---

**批准者**: Optima BI Team
**实施负责人**: CLI Team
**风险等级**: 🟢 低（成熟方案）
