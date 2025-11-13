/**
 * Authentication Middleware
 * 
 * Protects routes by verifying JWT access tokens and attaching
 * user information to the request object.
 */

import type { Request, Response, NextFunction } from "express";
import { getUserFromToken, extractTokenFromHeader } from "./auth";

// Extend Express Request to include user info
declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        username: string;
      };
    }
  }
}

/**
 * Authentication middleware
 * Verifies JWT access token and attaches user to request
 */
export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = extractTokenFromHeader(req.headers.authorization);
    
    if (!token) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    
    const user = await getUserFromToken(token);
    
    if (!user) {
      res.status(401).json({ error: "Invalid or expired token" });
      return;
    }
    
    // Attach user to request object
    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ error: "Authentication failed" });
  }
}

/**
 * Optional authentication middleware
 * Attaches user if token is valid, but doesn't block if missing
 */
export async function optionalAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = extractTokenFromHeader(req.headers.authorization);
    
    if (token) {
      const user = await getUserFromToken(token);
      if (user) {
        req.user = user;
      }
    }
    
    next();
  } catch (error) {
    // Silently continue if auth fails (token expired, etc.)
    next();
  }
}
