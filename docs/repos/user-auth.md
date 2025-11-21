# user-auth 研究分析

**仓库**: https://github.com/Optima-Chat/user-auth

---

## 技术栈

- **Python 3.11 + FastAPI**
- **PostgreSQL + Redis**
- **JWT (RS256) + BCrypt**
- **OAuth 2.0** (4 种授权流程)

---

## 核心功能

- OAuth 2.0 标准认证
- **Device Flow**（CLI 工具专用）
- 第三方登录（Google/GitHub/Apple）
- 角色权限管理
- Token 黑名单（Redis）
- 委托令牌（Delegated Tokens）

---

## 用户角色

```python
class UserRole(str, Enum):
    CUSTOMER = "customer"  # 买家
    MERCHANT = "merchant"  # 商家
    ADMIN = "admin"        # 平台管理员
```

---

## 关键 API

| 端点 | 方法 | 用途 |
|------|------|------|
| `/api/v1/auth/verify` | POST | Token 验证（服务间调用） |
| `/oauth/device` | POST | 请求 Device Code |
| `/oauth/token` | POST | 获取/刷新 Token |
| `/oauth/authorize/{provider}` | GET | 第三方登录授权 |
| `/users/me` | GET | 获取当前用户信息 |

---

## Token 验证 API

### 请求
```http
POST /api/v1/auth/verify
Content-Type: application/json

{
  "token": "eyJhbGciOiJSUzI1NiIs...",
  "required_scope": null  // 可选
}
```

### 响应（成功）
```json
{
  "valid": true,
  "user_id": "user_abc123",
  "role": "merchant",
  "scopes": ["read", "write"],
  "delegated": false,
  "error": null
}
```

### 响应（失败）
```json
{
  "valid": false,
  "error": "Token expired"
}
```

---

## OAuth 2.0 Device Flow

### 流程概述
```
1. CLI 请求 Device Code
2. 用户在浏览器中访问授权页面
3. 用户输入 User Code 并登录
4. CLI 轮询获取 Access Token
5. CLI 加密存储 Token 到本地
```

### 1. 请求 Device Code
```http
POST /oauth/device
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

### 2. 轮询获取 Token
```http
POST /oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=urn:ietf:params:oauth:grant-type:device_code
&device_code=GmRhmhcxhwAzkoEqiMEg_DnyEysNkuNhszIySk9eS
&client_id=bi-cli-prod
```

响应（待授权）：
```json
{
  "error": "authorization_pending",
  "error_description": "User has not yet authorized"
}
```

响应（成功）：
```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIs...",
  "refresh_token": "eyJhbGciOiJSUzI1NiIs...",
  "expires_in": 3600,
  "token_type": "Bearer"
}
```

### 3. 刷新 Token
```http
POST /oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token
&refresh_token=eyJhbGciOiJSUzI1NiIs...
&client_id=bi-cli-prod
```

---

## 环境配置

| 环境 | Auth URL | Client ID |
|------|----------|-----------|
| **Production** | https://auth.optima.shop | bi-cli-prod |
| **Stage** | https://auth-stage.optima.shop | bi-cli-stage |
| **Development** | https://auth.optima.chat | bi-cli-dev |

---

## 对 optima-bi 的影响

### bi-backend 认证
- 使用 `/api/v1/auth/verify` 验证 Token
- 获取 `user_id` 和 `role`
- 根据 `role` 查询 `merchant_id`（如果是商家）
- 实现权限隔离

### bi-cli 认证
- 使用 **OAuth 2.0 Device Flow**
- 加密存储 Token 到 `~/.optima/bi-cli/config.json`
- 自动刷新过期的 Token
- 支持多环境切换

---

**维护者**: Optima BI Team
**最后更新**: 2025-01-21
