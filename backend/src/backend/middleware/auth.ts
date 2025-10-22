import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Extend Express Request to include user info
declare global {
  namespace Express {
    interface Request {
      userId?: string;
      userEmail?: string;
      user?: {
        userId: string;
        email: string;
        role: string;
        isAdmin: boolean;
      };
    }
  }
}

/**
 * Authentication middleware
 * Verifies JWT token and attaches user info to request
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    // Get token from Authorization header or query parameter (for SSE)
    const authHeader = req.headers.authorization;
    const queryToken = req.query.token as string;

    // Try Authorization header first, then fall back to query parameter
    let token: string | null = null;

    if (authHeader) {
      // Extract token (format: "Bearer <token>")
      token = authHeader.replace('Bearer ', '');
    } else if (queryToken) {
      // For SSE connections, token can be in query parameter
      token = queryToken;
    }

    if (!token) {
      console.log(`[Auth] 401 NO_TOKEN - ${req.method} ${req.path}`);
      return res.status(401).json({
        success: false,
        error: {
          code: 'NO_TOKEN',
          message: 'Authentication required. Please provide a valid token.'
        },
        timestamp: new Date().toISOString()
      });
    }

    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET) as {
      userId: string;
      email: string;
      role?: string;
      iat: number;
      exp: number;
    };

    // Attach user info to request (backward compatibility)
    req.userId = decoded.userId;
    req.userEmail = decoded.email;

    // Set user object with role and isAdmin flag
    const userRole = decoded.role || 'user';
    req.user = {
      userId: decoded.userId,
      email: decoded.email,
      role: userRole,
      isAdmin: userRole === 'admin'
    };

    // Also set x-user-id header for backward compatibility
    req.headers['x-user-id'] = decoded.userId;

    next();
  } catch (error: any) {
    console.error('Auth middleware error:', error);

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: {
          code: 'TOKEN_EXPIRED',
          message: 'Your session has expired. Please sign in again.'
        },
        timestamp: new Date().toISOString()
      });
    }

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Invalid authentication token. Please sign in again.'
        },
        timestamp: new Date().toISOString()
      });
    }

    return res.status(500).json({
      success: false,
      error: {
        code: 'AUTH_ERROR',
        message: 'Authentication failed. Please try again.'
      },
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * Optional authentication middleware
 * Attaches user info if token is present, but doesn't require it
 */
export function optionalAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return next();
    }

    const token = authHeader.replace('Bearer ', '');
    
    if (!token) {
      return next();
    }

    const decoded = jwt.verify(token, JWT_SECRET) as {
      userId: string;
      email: string;
      role?: string;
    };

    req.userId = decoded.userId;
    req.userEmail = decoded.email;

    // Set user object with role and isAdmin flag
    const userRole = decoded.role || 'user';
    req.user = {
      userId: decoded.userId,
      email: decoded.email,
      role: userRole,
      isAdmin: userRole === 'admin'
    };

    req.headers['x-user-id'] = decoded.userId;

    next();
  } catch (error) {
    // If token is invalid, just continue without user info
    next();
  }
}
