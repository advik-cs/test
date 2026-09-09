import { Request, Response, NextFunction } from 'express';
import { verifyJwtToken } from '../utils/jwt.js';
import { UserRole } from '../types/index.js';

/**
 * Extracts the JWT token from the incoming request.
 * Supports:
 * - RFC 6750 Case-insensitive 'Bearer <token>' or 'bearer <token>' with variable whitespace
 * - Standard custom header 'x-access-token'
 * - Query parameter '?token=' for EventSource or streaming links
 */
export function extractTokenFromRequest(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  const xAccessToken = req.headers['x-access-token'];
  if (typeof xAccessToken === 'string' && xAccessToken.trim().length > 0) {
    return xAccessToken.trim();
  }

  if (typeof req.query.token === 'string' && req.query.token.trim().length > 0) {
    return req.query.token.trim();
  }

  return null;
}

/**
 * Authentication Middleware:
 * Validates the Bearer JWT in the Authorization header.
 * Attaches the decoded user payload to req.user.
 */
export function authenticateJwt(req: Request, res: Response, next: NextFunction): void {
  const token = extractTokenFromRequest(req);

  if (!token) {
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required. Please provide a valid Bearer token in the Authorization header.',
      },
    });
    return;
  }

  try {
    const payload = verifyJwtToken(token);
    req.user = payload;
    next();
  } catch (err: any) {
    res.status(401).json({
      success: false,
      error: {
        code: 'INVALID_TOKEN',
        message: 'The provided authentication token is invalid or has expired.',
        details: err?.message,
      },
    });
  }
}

/**
 * Role-Based Authorization Middleware:
 * Restricts access to one or more specified roles (CITIZEN, RESCUER).
 * Returns 403 Forbidden if the authenticated user does not have the required role.
 */
export function requireRole(...allowedRoles: (UserRole | string)[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required before verifying role permissions.',
        },
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: `Access denied: Insufficient permissions. Required role: [${allowedRoles.join(
            ', '
          )}]. Your role: [${req.user.role}].`,
        },
      });
      return;
    }

    next();
  };
}
