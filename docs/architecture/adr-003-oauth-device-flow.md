# ADR-003: OAuth 2.0 Device Flow 认证

**状态**: ✅ 已采纳
**日期**: 2025-01-21
**决策者**: Optima BI Team

---

## 背景

bi-cli 需要认证用户身份，以便：
- 识别用户角色（商家 vs 管理员）
- 实现数据隔离（商家只能查看自己的数据）
- 调用 bi-backend API

主要候选方案：
1. **OAuth 2.0 Device Flow**
2. **用户名密码**
3. **API Key**

---

## 决策

**bi-cli 使用 OAuth 2.0 Device Flow 进行认证**

### 认证流程
1. CLI 请求 Device Code
2. 显示授权 URL 和用户代码
3. 自动打开浏览器
4. 用户在浏览器中登录授权
5. CLI 轮询获取 Access Token
6. 加密存储 Token 到本地配置文件

### 技术实现
- **认证服务**: user-auth
- **授权类型**: Device Authorization Grant（RFC 8628）
- **Token 存储**: conf（加密）
- **Token 刷新**: 自动刷新

---

## 理由

### 1. CLI 友好
- 专为**无浏览器设备**设计（如 CLI、电视、IoT）
- 用户体验流畅
- 无需在 CLI 中输入密码

### 2. 安全性高
- 密码不经过 CLI（在浏览器中输入）
- Token 加密存储
- 支持 Token 过期和刷新
- 可在 user-auth 中统一管理和撤销

### 3. 统一认证
- 复用 user-auth 服务
- 与 commerce-cli 认证方式一致
- 无需单独实现认证逻辑

### 4. 参考实现
- commerce-cli 已验证可行性
- 代码可直接参考
- 配置存储方案成熟

### 5. 支持 SSO
- 用户可以使用 Google/GitHub 登录
- 支持多因素认证（MFA）
- 统一的用户管理

---

## 认证流程详解

### 1. 请求 Device Code

```bash
$ bi-cli auth login
```

CLI 调用：
```http
POST https://auth.optima.shop/oauth/device
Content-Type: application/x-www-form-urlencoded

client_id=bi-cli-prod
```

响应：
```json
{
  "device_code": "GmRhmhcxhwAzkoEqiMEg_DnyEysNkuNhszIySk9eS",
  "user_code": "WDJB-MJHT",
  "verification_uri": "https://auth.optima.shop/device",
  "verification_uri_complete": "https://auth.optima.shop/device?user_code=WDJB-MJHT",
  "expires_in": 600,
  "interval": 5
}
```

### 2. 显示授权信息

CLI 输出：
```
🔐 请在浏览器中授权

访问: https://auth.optima.shop/device
输入代码: WDJB-MJHT

或者直接访问: https://auth.optima.shop/device?user_code=WDJB-MJHT

正在等待授权...
```

### 3. 自动打开浏览器

```typescript
import open from 'open';

await open(verification_uri_complete);
```

### 4. 轮询获取 Token

CLI 每 5 秒轮询一次：
```http
POST https://auth.optima.shop/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=urn:ietf:params:oauth:grant-type:device_code
&device_code=GmRhmhcxhwAzkoEqiMEg_DnyEysNkuNhszIySk9eS
&client_id=bi-cli-prod
```

响应（待授权）：
```json
{
  "error": "authorization_pending"
}
```

响应（成功）：
```json
{
  "access_token": "eyJhbGci...",
  "refresh_token": "eyJhbGci...",
  "expires_in": 3600,
  "token_type": "Bearer"
}
```

### 5. 存储 Token

```typescript
import Conf from 'conf';

const config = new Conf({
  projectName: 'optima-bi',
  configName: 'config-prod',
  encryptionKey: 'secret-key' // 从环境变量读取
});

config.set('tokens', {
  access_token: 'eyJhbGci...',
  refresh_token: 'eyJhbGci...',
  expires_in: 3600,
  expires_at: Date.now() / 1000 + 3600
});

config.set('user', {
  id: 'user_abc123',
  email: 'merchant@example.com',
  role: 'merchant'
});
```

### 6. 自动刷新 Token

```typescript
async function getValidToken(): Promise<string> {
  const config = new Conf({ projectName: 'optima-bi' });
  const expiresAt = config.get('tokens.expires_at');
  const now = Date.now() / 1000;

  // 提前 5 分钟刷新
  if (expiresAt - now < 300) {
    const refreshToken = config.get('tokens.refresh_token');
    const newTokens = await refreshAccessToken(refreshToken);

    config.set('tokens', {
      ...newTokens,
      expires_at: now + newTokens.expires_in
    });

    return newTokens.access_token;
  }

  return config.get('tokens.access_token');
}
```

---

## 替代方案

### 方案 A: 用户名密码

**描述**:
```bash
$ bi-cli auth login
Email: merchant@example.com
Password: ********
```

**优势**:
- 实现简单
- 无需浏览器

**劣势**:
- **不安全**：密码在 CLI 中输入，可能被记录
- 不支持 SSO（Google/GitHub 登录）
- 不支持 MFA
- 密码泄露风险高

**结论**: ❌ 放弃

---

### 方案 B: API Key

**描述**:
```bash
$ bi-cli auth login --api-key YOUR_API_KEY
```

**优势**:
- 实现简单
- 适合自动化脚本

**劣势**:
- 管理复杂（生成、撤销、轮换）
- 无法识别用户身份（只能识别 API Key）
- 权限控制粒度粗
- 不适合最终用户

**结论**: ❌ 放弃（可在未来作为补充）

---

## 影响

### 正面影响

1. **安全性**:
   - 密码不经过 CLI
   - Token 加密存储
   - 统一的 Token 管理和撤销

2. **用户体验**:
   - 无需在 CLI 中输入密码
   - 支持 Google/GitHub 登录
   - 浏览器中完成授权（熟悉的界面）

3. **开发效率**:
   - 复用 user-auth 服务
   - 参考 commerce-cli 实现
   - 无需单独实现认证逻辑

### 负面影响

1. **依赖浏览器**:
   - 需要用户有浏览器
   - 自动化脚本不友好（可用 API Key 补充）

2. **网络要求**:
   - 需要访问 user-auth 服务
   - 需要网络连接

### 缓解措施

1. **API Key 补充**:
   - 未来可提供 API Key 选项
   - 用于自动化脚本和 CI/CD

2. **离线模式**:
   - Token 有效期内可离线使用
   - 提供 `--token` 参数手动传入 Token

---

## 实施计划

### Phase 1: 基础认证
- [ ] 实现 Device Flow 客户端
- [ ] 实现 Token 存储（conf）
- [ ] 实现自动刷新
- [ ] 实现多环境支持

### Phase 2: 用户体验优化
- [ ] 自动打开浏览器
- [ ] 美化 CLI 输出（进度条、图标）
- [ ] 实现 `bi-cli auth whoami`
- [ ] 实现 `bi-cli auth logout`

### Phase 3: 高级功能（可选）
- [ ] 支持 API Key 认证
- [ ] 支持 `--token` 参数
- [ ] 支持多账户管理

---

## 配置示例

### 环境配置

```typescript
const ENV_CONFIG = {
  production: {
    authUrl: 'https://auth.optima.shop',
    apiUrl: 'https://bi-api.optima.shop',
    clientId: 'bi-cli-prod',
  },
  stage: {
    authUrl: 'https://auth-stage.optima.shop',
    apiUrl: 'https://bi-api-stage.optima.shop',
    clientId: 'bi-cli-stage',
  },
  development: {
    authUrl: 'https://auth.optima.chat',
    apiUrl: 'https://bi-api.optima.chat',
    clientId: 'bi-cli-dev',
  },
};
```

### 配置文件位置

```
~/.optima/bi-cli/
├── config-prod.json      # Production 环境（加密）
├── config-stage.json     # Stage 环境
├── config-dev.json       # Development 环境
└── current-env.json      # 当前激活环境
```

---

## 相关决策

- [ADR-001: TypeScript 技术栈](./adr-001-typescript-stack.md) - TypeScript 实现
- [ADR-004: JSON 输出](./adr-004-json-output.md) - CLI 输出格式
- [ADR-005: 多环境支持](./adr-005-multi-env.md) - 环境配置

---

## 参考资料

- [RFC 8628: OAuth 2.0 Device Authorization Grant](https://datatracker.ietf.org/doc/html/rfc8628)
- [user-auth 仓库](https://github.com/Optima-Chat/user-auth)
- [commerce-cli 仓库](https://github.com/Optima-Chat/commerce-cli)
- [conf: Encrypted config storage](https://github.com/sindresorhus/conf)

---

**批准者**: Optima BI Team
**实施负责人**: CLI Team
**风险等级**: 🟢 低（成熟方案）
