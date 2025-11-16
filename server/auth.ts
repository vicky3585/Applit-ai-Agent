/**
 * Authentication Utilities
 * 
 * Handles password hashing, JWT token generation/verification,
 * and session management for the authentication system.
 */

import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import type { User } from "@shared/schema";

// JWT Configuration
const ACCESS_TOKEN_SECRET = process.env.JWT_SECRET || "dev-secret-change-in-production";
const REFRESH_TOKEN_SECRET = process.env.JWT_REFRESH_SECRET || "dev-refresh-secret-change-in-production";
const ACCESS_TOKEN_EXPIRY = "15m"; // 15 minutes
const REFRESH_TOKEN_EXPIRY = "7d"; // 7 days
const BCRYPT_ROUNDS = 12;

export interface AccessTokenPayload {
  userId: string;
  username: string;
  sessionId: string;
  type: "access";
}

export interface RefreshTokenPayload {
  userId: string;
  sessionId: string;
  type: "refresh";
}

/**
 * Hash password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/**
 * Verify password against hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Generate a cryptographically random refresh token
 */
export function generateRefreshToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Hash a refresh token for storage
 */
export async function hashRefreshToken(token: string): Promise<string> {
  return bcrypt.hash(token, 10); // Faster rounds for tokens
}

/**
 * Verify a refresh token against its hash
 */
export async function verifyRefreshToken(token: string, hash: string): Promise<boolean> {
  return bcrypt.compare(token, hash);
}

/**
 * Generate JWT access token (short-lived)
 */
export function signAccessToken(user: User, sessionId: string): string {
  const payload: AccessTokenPayload = {
    userId: user.id,
    username: user.username,
    sessionId,
    type: "access",
  };
  
  return jwt.sign(payload, ACCESS_TOKEN_SECRET, {
    expiresIn: ACCESS_TOKEN_EXPIRY,
    issuer: "ai-web-ide",
    audience: "ai-web-ide-api",
  });
}

/**
 * Generate JWT refresh token (long-lived)
 */
export function signRefreshToken(userId: string, sessionId: string): string {
  const payload: RefreshTokenPayload = {
    userId,
    sessionId,
    type: "refresh",
  };
  
  return jwt.sign(payload, REFRESH_TOKEN_SECRET, {
    expiresIn: REFRESH_TOKEN_EXPIRY,
    issuer: "ai-web-ide",
    audience: "ai-web-ide-api",
  });
}

/**
 * Verify and decode access token
 */
export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const payload = jwt.verify(token, ACCESS_TOKEN_SECRET, {
      issuer: "ai-web-ide",
      audience: "ai-web-ide-api",
    }) as AccessTokenPayload;
    
    if (payload.type !== "access") {
      throw new Error("Invalid token type");
    }
    
    return payload;
  } catch (error) {
    throw new Error("Invalid or expired access token");
  }
}

/**
 * Verify and decode refresh token
 */
export function verifyRefreshTokenJWT(token: string): RefreshTokenPayload {
  try {
    const payload = jwt.verify(token, REFRESH_TOKEN_SECRET, {
      issuer: "ai-web-ide",
      audience: "ai-web-ide-api",
    }) as RefreshTokenPayload;
    
    if (payload.type !== "refresh") {
      throw new Error("Invalid token type");
    }
    
    return payload;
  } catch (error) {
    throw new Error("Invalid or expired refresh token");
  }
}

/**
 * Get user from access token (for middleware)
 */
export async function getUserFromToken(token: string): Promise<{ userId: string; username: string } | null> {
  try {
    const payload = verifyAccessToken(token);
    
    // CRITICAL SECURITY: Verify session still exists in database
    // This ensures logout properly invalidates access tokens
    const { storage } = await import("./storage-factory");
    const storageInstance = await storage;
    const session = await storageInstance.getSession(payload.sessionId);
    
    if (!session) {
      console.warn(`[Auth] Session not found: ${payload.sessionId}`);
      return null; // Session revoked or invalid
    }
    
    if (session.userId !== payload.userId) {
      console.warn(`[Auth] Session userId mismatch: session.userId=${session.userId}, payload.userId=${payload.userId}`);
      return null; // Session revoked or invalid
    }
    
    return {
      userId: payload.userId,
      username: payload.username,
    };
  } catch (error) {
    console.error("[Auth] getUserFromToken error:", error);
    return null;
  }
}

/**
 * Extract token from Authorization header
 */
export function extractTokenFromHeader(authHeader: string | undefined): string | null {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.substring(7);
}

/**
 * Check if user account is locked due to failed login attempts
 */
export function isAccountLocked(user: User): boolean {
  if (!user.lockedUntil) {
    return false;
  }
  return new Date(user.lockedUntil) > new Date();
}

/**
 * Calculate lockout time based on failed attempts
 * Progressive lockout: 3 fails = 15min, 5 fails = 1hr, 7+ fails = 24hr
 */
export function calculateLockoutTime(failedCount: number): Date | null {
  const count = parseInt(failedCount.toString());
  
  if (count < 3) {
    return null;
  }
  
  const now = new Date();
  let lockoutMinutes: number;
  
  if (count >= 7) {
    lockoutMinutes = 24 * 60; // 24 hours
  } else if (count >= 5) {
    lockoutMinutes = 60; // 1 hour
  } else {
    lockoutMinutes = 15; // 15 minutes
  }
  
  return new Date(now.getTime() + lockoutMinutes * 60 * 1000);
}
