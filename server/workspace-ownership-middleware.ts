/**
 * Workspace Ownership Middleware
 * 
 * Enforces workspace access control by verifying the authenticated user
 * owns the workspace referenced in the route parameter.
 * 
 * MUST be composed AFTER authMiddleware to ensure req.user exists.
 */

import type { Request, Response, NextFunction } from "express";
import type { IStorage } from "./storage";

// Extend Express Request to include workspace
declare global {
  namespace Express {
    interface Request {
      workspace?: {
        id: string;
        name: string;
        userId: string;
      };
    }
  }
}

/**
 * Workspace ownership middleware factory
 * Creates middleware that verifies user owns the workspace
 * 
 * @param storage - Storage interface for fetching workspace
 * @returns Express middleware function
 */
export function createWorkspaceOwnershipMiddleware(storage: IStorage) {
  return async function workspaceOwnershipMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      // Ensure user is authenticated (set by authMiddleware)
      if (!req.user) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      // Extract workspace ID from route params
      const workspaceId = req.params.id || req.params.workspaceId;
      if (!workspaceId) {
        res.status(400).json({ error: "Workspace ID required" });
        return;
      }

      // Fetch workspace
      const workspace = await storage.getWorkspace(workspaceId);
      if (!workspace) {
        res.status(404).json({ error: "Workspace not found" });
        return;
      }

      // Verify ownership
      if (workspace.userId !== req.user.userId) {
        console.warn(`[Security] Unauthorized workspace access attempt: user ${req.user.userId} tried to access workspace ${workspaceId} owned by ${workspace.userId}`);
        res.status(403).json({ error: "Access denied: workspace belongs to another user" });
        return;
      }

      // Attach workspace to request for downstream use
      req.workspace = workspace;
      next();
    } catch (error: any) {
      console.error("[WorkspaceAuth] Middleware error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  };
}

/**
 * Composed middleware: authentication + workspace ownership
 * Convenience helper that combines both checks in correct order
 * 
 * Usage: app.get("/api/workspaces/:id/files", requireWorkspaceAccess, handler)
 */
export function createRequireWorkspaceAccess(authMw: any, ownershipMw: any) {
  return [authMw, ownershipMw];
}
