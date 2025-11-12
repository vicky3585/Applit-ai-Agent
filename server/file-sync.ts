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

export class FileSync {
  private workspaceRoot: string;

  constructor(workspaceRoot: string = "/workspace") {
    this.workspaceRoot = workspaceRoot;
  }

  /**
   * Sync a single file to disk
   */
  async syncFile(file: File): Promise<void> {
    if (!ENV_CONFIG.sandbox.available) {
      // Skip file sync in Replit - files stay in memory only
      console.log(`[FileSync] Skipping file sync in ${ENV_CONFIG.env} mode:`, file.path);
      return;
    }

    try {
      const fullPath = path.join(this.workspaceRoot, file.path);
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
   * Delete a file from disk
   */
  async deleteFile(filePath: string): Promise<void> {
    if (!ENV_CONFIG.sandbox.available) {
      return;
    }

    try {
      const fullPath = path.join(this.workspaceRoot, filePath);
      await fs.unlink(fullPath);
      console.log(`[FileSync] Deleted file from disk:`, fullPath);
    } catch (error: any) {
      if (error.code !== "ENOENT") {
        console.error(`[FileSync] Failed to delete file ${filePath}:`, error.message);
      }
    }
  }

  /**
   * Initialize workspace directory structure
   */
  async initializeWorkspace(workspaceId: string): Promise<void> {
    if (!ENV_CONFIG.sandbox.available) {
      return;
    }

    try {
      await fs.mkdir(this.workspaceRoot, { recursive: true });
      console.log(`[FileSync] Initialized workspace at:`, this.workspaceRoot);
    } catch (error: any) {
      console.error(`[FileSync] Failed to initialize workspace:`, error.message);
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
