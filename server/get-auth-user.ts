import type { Request, Response } from "express";
import { getUserFromToken } from "./auth";
import { storage } from "./storage-factory";

/**
 * Get authenticated user from access token cookie
 * Returns user object or throws error if not authenticated
 * CRITICAL SECURITY: Uses getUserFromToken to enforce session validation
 */
export async function getAuthenticatedUser(req: Request) {
  const accessToken = (req as any).cookies?.accessToken;
  
  if (!accessToken) {
    throw new Error("Not authenticated");
  }
  
  // CRITICAL: Use getUserFromToken to validate session exists in DB
  const userInfo = await getUserFromToken(accessToken);
  if (!userInfo) {
    throw new Error("Invalid or expired session");
  }
  
  const user = await (await storage).getUser(userInfo.userId);
  if (!user) {
    throw new Error("User not found");
  }
  
  return user;
}

/**
 * Get authenticated user ID from access token cookie
 * Returns userId string or throws error if not authenticated
 */
export async function getAuthenticatedUserId(req: Request): Promise<string> {
  const user = await getAuthenticatedUser(req);
  return user.id;
}
