import { FastifyRequest, FastifyReply } from 'fastify';
import { verifyAccessToken, extractToken, VerifyTokenResponse } from '../services/auth.service';

// 扩展 FastifyRequest 类型以包含用户信息
declare module 'fastify' {
  interface FastifyRequest {
    user?: VerifyTokenResponse;
  }
}

export interface AuthMiddlewareOptions {
  requiredScopes?: string[];
  requireAllScopes?: boolean; // true: 需要所有 scopes, false: 需要任一 scope
}

/**
 * JWT 认证中间件
 * 验证 Authorization header 中的 Bearer token
 */
export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
  options: AuthMiddlewareOptions = {}
): Promise<void> {
  const { requiredScopes = [], requireAllScopes = false } = options;

  try {
    // 1. 提取 token
    const token = extractToken(request.headers.authorization);
    if (!token) {
      return reply.code(401).send({
        success: false,
        error: {
          code: 'MISSING_TOKEN',
          message: 'Authorization token is required',
        },
      });
    }

    // 2. 验证 token
    let user: VerifyTokenResponse;
    try {
      user = await verifyAccessToken(token);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'UNKNOWN_ERROR';

      if (errorMessage === 'INVALID_TOKEN') {
        return reply.code(401).send({
          success: false,
          error: {
            code: 'INVALID_TOKEN',
            message: 'Token is invalid or expired',
          },
        });
      }

      if (errorMessage === 'INSUFFICIENT_SCOPE') {
        return reply.code(403).send({
          success: false,
          error: {
            code: 'INSUFFICIENT_SCOPE',
            message: 'Token does not have required scope',
          },
        });
      }

      // 其他验证错误
      return reply.code(500).send({
        success: false,
        error: {
          code: 'VERIFICATION_FAILED',
          message: 'Failed to verify token',
        },
      });
    }

    // 3. 检查 scopes (如果指定)
    if (requiredScopes.length > 0) {
      const hasRequiredScopes = requireAllScopes
        ? requiredScopes.every((scope) => user.scopes.includes(scope))
        : requiredScopes.some((scope) => user.scopes.includes(scope));

      if (!hasRequiredScopes) {
        const requiredScopesStr = requiredScopes.join(requireAllScopes ? ' AND ' : ' OR ');
        return reply.code(403).send({
          success: false,
          error: {
            code: 'INSUFFICIENT_SCOPE',
            message: `Required scope(s): ${requiredScopesStr}`,
            required: requiredScopes,
            current: user.scopes,
          },
        });
      }
    }

    // 4. 将用户信息附加到 request 对象
    request.user = user;

    // 5. 记录请求日志
    request.log.info(
      {
        userId: user.user_id,
        role: user.role,
        merchantId: user.merchant_id,
      },
      'Authenticated request'
    );
  } catch (err) {
    request.log.error({ err }, 'Auth middleware error');
    return reply.code(500).send({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Authentication failed',
      },
    });
  }
}

/**
 * 创建需要认证的路由 preHandler
 */
export function requireAuth(options: AuthMiddlewareOptions = {}) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    await authMiddleware(request, reply, options);
  };
}

/**
 * 仅商家可访问
 */
export function requireMerchant() {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    await authMiddleware(request, reply);

    // 验证通过后检查角色
    if (request.user && request.user.role !== 'merchant') {
      return reply.code(403).send({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'This endpoint is only accessible to merchants',
        },
      });
    }
  };
}

/**
 * 仅管理员可访问
 */
export function requireAdmin() {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    await authMiddleware(request, reply);

    // 验证通过后检查角色
    if (request.user && request.user.role !== 'admin') {
      return reply.code(403).send({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'This endpoint is only accessible to admins',
        },
      });
    }
  };
}
