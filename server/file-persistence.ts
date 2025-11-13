import fs from "fs/promises";
import path from "path";
import { ENV_CONFIG } from "@shared/environment";

export interface FilePersistenceConfig {
  workspaceRoot: string;
  enableSync: boolean;
}

export class FilePersistence {
  private workspaceRoot: string;
  private enableSync: boolean;

  constructor(config: FilePersistenceConfig) {
    this.workspaceRoot = config.workspaceRoot;
    this.enableSync = config.enableSync;
  }

  /**
   * Save a file to disk
   */
  async saveFile(workspaceId: string, filePath: string, content: string): Promise<void> {
    if (!this.enableSync) {
      console.log(`[FilePersistence] Sync disabled - skipping save: ${filePath}`);
      return;
    }

    try {
      const fullPath = this.getFullPath(workspaceId, filePath);
      const dir = path.dirname(fullPath);

      // Ensure directory exists
      await fs.mkdir(dir, { recursive: true });

      // Write file
      await fs.writeFile(fullPath, content, "utf-8");
      console.log(`[FilePersistence] Saved: ${filePath}`);
    } catch (error: any) {
      console.error(`[FilePersistence] Failed to save ${filePath}:`, error.message);
      throw error;
    }
  }

  /**
   * Read a file from disk
   */
  async readFile(workspaceId: string, filePath: string): Promise<string> {
    if (!this.enableSync) {
      throw new Error("File persistence is disabled in this environment");
    }

    try {
      const fullPath = this.getFullPath(workspaceId, filePath);
      const content = await fs.readFile(fullPath, "utf-8");
      return content;
    } catch (error: any) {
      console.error(`[FilePersistence] Failed to read ${filePath}:`, error.message);
      throw error;
    }
  }

  /**
   * Delete a file from disk
   */
  async deleteFile(workspaceId: string, filePath: string): Promise<void> {
    if (!this.enableSync) {
      return;
    }

    try {
      const fullPath = this.getFullPath(workspaceId, filePath);
      await fs.unlink(fullPath);
      console.log(`[FilePersistence] Deleted: ${filePath}`);
    } catch (error: any) {
      if (error.code !== "ENOENT") {
        console.error(`[FilePersistence] Failed to delete ${filePath}:`, error.message);
      }
    }
  }

  /**
   * Rename/move a file
   */
  async renameFile(workspaceId: string, oldPath: string, newPath: string): Promise<void> {
    if (!this.enableSync) {
      return;
    }

    try {
      const fullOldPath = this.getFullPath(workspaceId, oldPath);
      const fullNewPath = this.getFullPath(workspaceId, newPath);
      
      // Ensure target directory exists
      const newDir = path.dirname(fullNewPath);
      await fs.mkdir(newDir, { recursive: true });

      await fs.rename(fullOldPath, fullNewPath);
      console.log(`[FilePersistence] Renamed: ${oldPath} → ${newPath}`);
    } catch (error: any) {
      console.error(`[FilePersistence] Failed to rename ${oldPath}:`, error.message);
      throw error;
    }
  }

  /**
   * List all files in workspace
   */
  async listFiles(workspaceId: string): Promise<string[]> {
    if (!this.enableSync) {
      return [];
    }

    try {
      const workspacePath = this.getWorkspacePath(workspaceId);
      const files = await this.walkDirectory(workspacePath);
      return files.map((f) => path.relative(workspacePath, f));
    } catch (error: any) {
      console.error(`[FilePersistence] Failed to list files:`, error.message);
      return [];
    }
  }

  /**
   * Initialize workspace directory
   */
  async initializeWorkspace(workspaceId: string): Promise<void> {
    if (!this.enableSync) {
      return;
    }

    const workspacePath = this.getWorkspacePath(workspaceId);
    await fs.mkdir(workspacePath, { recursive: true });
    console.log(`[FilePersistence] Initialized workspace: ${workspacePath}`);
  }

  private getWorkspacePath(workspaceId: string): string {
    return path.join(this.workspaceRoot, workspaceId);
  }

  private getFullPath(workspaceId: string, filePath: string): string {
    const workspacePath = this.getWorkspacePath(workspaceId);
    const fullPath = path.join(workspacePath, filePath);

    // Security: ensure path is within workspace
    const resolvedPath = path.resolve(fullPath);
    const resolvedWorkspace = path.resolve(workspacePath);
    
    if (!resolvedPath.startsWith(resolvedWorkspace)) {
      throw new Error(`Invalid file path: ${filePath} (path traversal detected)`);
    }

    return fullPath;
  }

  private async walkDirectory(dir: string): Promise<string[]> {
    const files: string[] = [];

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          // Skip node_modules and hidden directories
          if (!entry.name.startsWith(".") && entry.name !== "node_modules") {
            files.push(...(await this.walkDirectory(fullPath)));
          }
        } else {
          files.push(fullPath);
        }
      }
    } catch (error: any) {
      // Directory doesn't exist yet
      if (error.code !== "ENOENT") {
        console.error(`[FilePersistence] Error walking directory ${dir}:`, error.message);
      }
    }

    return files;
  }
}

// Singleton instance
let filePersistence: FilePersistence | null = null;

export function getFilePersistence(): FilePersistence {
  if (!filePersistence) {
    // Enable file sync only in local environment (not Replit)
    const enableSync = ENV_CONFIG.env === "local";
    
    filePersistence = new FilePersistence({
      workspaceRoot: enableSync ? "/tmp/ide-workspaces" : "/tmp/noop",
      enableSync,
    });

    console.log(`[FilePersistence] Initialized (sync: ${enableSync})`);
  }

  return filePersistence;
}
