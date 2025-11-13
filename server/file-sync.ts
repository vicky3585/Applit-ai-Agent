/**
 * File Synchronization Utility
 * 
 * Syncs files from storage (memory/database) to the filesystem
 * so the Docker sandbox can access them for execution.
 */

import { promises as fs } from "fs";
import path from "path";
import type { File } from "@shared/schema";
import { ENV_CONFIG } from "@shared/environment";

type InternalChangeCallback = (workspaceId: string, filePath: string) => void;

export class FileSync {
  private workspaceRoot: string;
  private internalChangeCallback: InternalChangeCallback | null = null;

  constructor(workspaceRoot: string = "/tmp/workspaces") {
    this.workspaceRoot = workspaceRoot;
  }

  /**
   * Set callback to mark internal changes (prevents circular sync with FileWatcher)
   */
  setInternalChangeCallback(callback: InternalChangeCallback | null): void {
    this.internalChangeCallback = callback;
  }

  /**
   * Get workspace-specific directory path
   */
  private getWorkspacePath(workspaceId: string): string {
    return path.join(this.workspaceRoot, workspaceId);
  }

  /**
   * Sync a single file to disk in workspace-specific directory
   */
  async syncFile(file: File): Promise<void> {
    if (!ENV_CONFIG.sandbox.available) {
      // Skip file sync in Replit - files stay in memory only
      console.log(`[FileSync] Skipping file sync in ${ENV_CONFIG.env} mode:`, file.path);
      return;
    }

    try {
      // Mark as internal change before writing to prevent FileWatcher from syncing back
      if (this.internalChangeCallback) {
        this.internalChangeCallback(file.workspaceId, file.path);
      }

      // Files go in /workspace/{workspaceId}/{filePath}
      const workspacePath = this.getWorkspacePath(file.workspaceId);
      const fullPath = path.join(workspacePath, file.path);
      const dir = path.dirname(fullPath);

      // Create directory if it doesn't exist
      await fs.mkdir(dir, { recursive: true });

      // Write file content
      await fs.writeFile(fullPath, file.content, "utf-8");

      console.log(`[FileSync] Synced file to disk:`, fullPath);
    } catch (error: any) {
      console.error(`[FileSync] Failed to sync file ${file.path}:`, error.message);
      throw error;
    }
  }

  /**
   * Sync multiple files to disk
   */
  async syncFiles(files: File[]): Promise<void> {
    if (!ENV_CONFIG.sandbox.available) {
      console.log(`[FileSync] Skipping batch file sync in ${ENV_CONFIG.env} mode`);
      return;
    }

    const results = await Promise.allSettled(
      files.map(file => this.syncFile(file))
    );

    const failed = results.filter(r => r.status === "rejected");
    if (failed.length > 0) {
      console.error(`[FileSync] Failed to sync ${failed.length}/${files.length} files`);
    } else {
      console.log(`[FileSync] Successfully synced ${files.length} files`);
    }
  }

  /**
   * Delete a file from disk (workspace-aware)
   */
  async deleteFile(workspaceId: string, filePath: string): Promise<void> {
    if (!ENV_CONFIG.sandbox.available) {
      return;
    }

    try {
      // Mark as internal change before deleting to prevent FileWatcher from syncing back
      if (this.internalChangeCallback) {
        this.internalChangeCallback(workspaceId, filePath);
      }

      const workspacePath = this.getWorkspacePath(workspaceId);
      const fullPath = path.join(workspacePath, filePath);
      await fs.unlink(fullPath);
      console.log(`[FileSync] Deleted file from disk:`, fullPath);
    } catch (error: any) {
      if (error.code !== "ENOENT") {
        console.error(`[FileSync] Failed to delete file ${filePath}:`, error.message);
      }
    }
  }

  /**
   * Initialize workspace-specific directory structure
   * Creates /workspace/{workspaceId} directory
   */
  async initializeWorkspace(workspaceId: string): Promise<void> {
    if (!ENV_CONFIG.sandbox.available) {
      return;
    }

    try {
      const workspacePath = this.getWorkspacePath(workspaceId);
      await fs.mkdir(workspacePath, { recursive: true });
      console.log(`[FileSync] Initialized workspace at:`, workspacePath);
    } catch (error: any) {
      console.error(`[FileSync] Failed to initialize workspace:`, error.message);
    }
  }

  /**
   * Delete workspace-specific directory from disk
   * Only deletes /workspace/{workspaceId}, safe for multi-workspace environments
   */
  async deleteWorkspace(workspaceId: string): Promise<void> {
    if (!ENV_CONFIG.sandbox.available) {
      return;
    }

    try {
      const workspacePath = this.getWorkspacePath(workspaceId);
      await fs.rm(workspacePath, { recursive: true, force: true });
      console.log(`[FileSync] Deleted workspace directory:`, workspacePath);
    } catch (error: any) {
      if (error.code !== "ENOENT") {
        console.error(`[FileSync] Failed to delete workspace ${workspaceId}:`, error.message);
      }
    }
  }

  /**
   * Check if filesystem sync is available
   */
  isSyncAvailable(): boolean {
    return ENV_CONFIG.sandbox.available;
  }
}

// Export singleton instance
export const fileSync = new FileSync();
