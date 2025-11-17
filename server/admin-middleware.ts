/**
 * Admin Authorization Middleware
 * 
 * Protects admin routes by verifying user has admin privileges.
 * Must be used after authMiddleware.
 */

import type { Request, Response, NextFunction } from "express";
import { storage } from "./storage-factory";

/**
 * Admin authorization middleware
 * Verifies that the authenticated user has admin privileges
 * Must be used after authMiddleware
 */
export async function adminMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const storageInstance = await storage;
    const user = await storageInstance.getUserById(req.user.userId);

    if (!user) {
      res.status(403).json({ error: "Admin privileges required" });
      return;
    }

    // Convert isAdmin from text "true"/"false" to boolean
    // Database stores isAdmin as text, so "false" is truthy without conversion
    const isAdmin = user.isAdmin === true || user.isAdmin === "true";
    
    if (!isAdmin) {
      res.status(403).json({ error: "Admin privileges required" });
      return;
    }

    next();
  } catch (error) {
    res.status(500).json({ error: "Authorization check failed" });
  }
}
