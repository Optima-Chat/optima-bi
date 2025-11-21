import axios from 'axios';
import { config } from '../config';
import { createLogger } from '../utils/logger';

const logger = createLogger('auth');

export interface TokenPayload {
  sub: string; // user_id
  email: string;
  role: 'merchant' | 'admin';
  merchant_id?: string;
  scopes: string[];
  exp: number;
  iat: number;
}

export interface VerifyTokenResponse {
  valid: boolean;
  user_id: string;
  email: string;
  role: 'merchant' | 'admin';
  merchant_id?: string;
  scopes: string[];
}

/**
 * 验证 access token
 * 调用 auth.optima.chat 的验证端点
 */
export async function verifyAccessToken(token: string): Promise<VerifyTokenResponse> {
  try {
    const response = await axios.post<VerifyTokenResponse>(
      `${config.oauth.authUrl}/api/v1/auth/verify`,
      {
        token,
      },
      {
        timeout: 10000, // 10 second timeout
      }
    );

    logger.debug({ userId: response.data.user_id }, 'Token verified successfully');
    return response.data;
  } catch (err) {
    if (axios.isAxiosError(err)) {
      if (err.response?.status === 401) {
        logger.debug('Token verification failed: invalid or expired');
        throw new Error('INVALID_TOKEN');
      }
      if (err.response?.status === 403) {
        logger.debug('Token verification failed: insufficient scope');
        throw new Error('INSUFFICIENT_SCOPE');
      }
    }

    logger.error({ err }, 'Token verification error');
    throw new Error('VERIFICATION_FAILED');
  }
}

/**
 * 从 Authorization header 中提取 token
 */
export function extractToken(authHeader?: string): string | null {
  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }

  return parts[1];
}

/**
 * 检查用户是否有指定的 scope
 */
export function hasScope(userScopes: string[], requiredScope: string): boolean {
  return userScopes.includes(requiredScope);
}

/**
 * 检查用户是否有任一指定的 scope
 */
export function hasAnyScope(userScopes: string[], requiredScopes: string[]): boolean {
  return requiredScopes.some((scope) => userScopes.includes(scope));
}

/**
 * 检查用户是否有所有指定的 scope
 */
export function hasAllScopes(userScopes: string[], requiredScopes: string[]): boolean {
  return requiredScopes.every((scope) => userScopes.includes(scope));
}
