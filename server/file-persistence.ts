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
      const fullPath = await this.getFullPathAsync(workspaceId, filePath);
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
      const fullPath = await this.getFullPathAsync(workspaceId, filePath);
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
      const fullPath = await this.getFullPathAsync(workspaceId, filePath);
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
      const fullOldPath = await this.getFullPathAsync(workspaceId, oldPath);
      const fullNewPath = await this.getFullPathAsync(workspaceId, newPath);
      
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

  /**
   * Resolve and initialize workspace path (public helper for dev servers)
   * Ensures workspace directory exists and returns the correct filesystem path
   */
  async resolveWorkspacePath(workspaceId: string): Promise<string | null> {
    if (!this.enableSync) {
      return null; // File sync disabled
    }

    // Ensure workspace is initialized
    await this.initializeWorkspace(workspaceId);
    return this.getWorkspacePath(workspaceId);
  }

  private getWorkspacePath(workspaceId: string): string {
    return path.join(this.workspaceRoot, workspaceId);
  }

  private async getFullPathAsync(workspaceId: string, filePath: string): Promise<string> {
    // Security: Validate workspace ID (alphanumeric, hyphens, underscores only)
    if (!/^[a-zA-Z0-9_-]+$/.test(workspaceId)) {
      throw new Error(`Invalid workspace ID: ${workspaceId}`);
    }

    // Security: Reject absolute paths, drive-relative paths, and UNC paths
    if (path.isAbsolute(filePath) || filePath.startsWith('//') || filePath.startsWith('\\\\') || /^[a-zA-Z]:/.test(filePath)) {
      throw new Error(`Invalid file path: ${filePath} (absolute paths not allowed)`);
    }

    // Normalize file path to prevent traversal with ../ segments
    const normalizedFilePath = path.normalize(filePath).replace(/^(\.\.(\/|\\|$))+/, '');
    
    const workspacePath = this.getWorkspacePath(workspaceId);
    const fullPath = path.join(workspacePath, normalizedFilePath);

    // Security: Validate ALL parent directories to prevent symlink attacks
    // Start from workspace and validate each path component
    const resolvedWorkspace = await this.resolvePathSafely(workspacePath);
    const resolvedRoot = await this.resolvePathSafely(this.workspaceRoot);

    // Check each path component from workspace down to parent directory
    let currentPath = workspacePath;
    const pathComponents = normalizedFilePath.split(path.sep).filter(Boolean);
    
    for (let i = 0; i < pathComponents.length - 1; i++) {
      currentPath = path.join(currentPath, pathComponents[i]);
      const resolvedCurrent = await this.resolvePathSafely(currentPath);
      
      // Ensure resolved path is within workspace
      if (!resolvedCurrent.startsWith(resolvedWorkspace + path.sep) && resolvedCurrent !== resolvedWorkspace) {
        throw new Error(`Invalid file path: ${filePath} (symlink traversal in path component)`);
      }
    }

    // Final containment check
    const resolvedPath = await this.resolvePathSafely(fullPath);
    
    if (!resolvedPath.startsWith(resolvedWorkspace + path.sep) && resolvedPath !== resolvedWorkspace) {
      throw new Error(`Invalid file path: ${filePath} (path traversal detected)`);
    }
    
    if (!resolvedPath.startsWith(resolvedRoot + path.sep) && resolvedPath !== resolvedRoot) {
      throw new Error(`Invalid file path: ${filePath} (escapes workspace root)`);
    }

    return fullPath; // Return original path for file operations
  }

  /**
   * Safely resolve a path, following symlinks if it exists
   */
  private async resolvePathSafely(targetPath: string): Promise<string> {
    try {
      // If path exists, resolve symlinks
      return await fs.realpath(targetPath);
    } catch {
      // If path doesn't exist, return resolved path for validation
      // (Symlink attacks prevented by validating all parent directories)
      return path.resolve(targetPath);
    }
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
    // Enable file sync only in local environment (not Replit sandbox)
    const enableSync = ENV_CONFIG.env === "local" || ENV_CONFIG.env === "development";
    
    // Use temp directory appropriate for environment
    let workspaceRoot = ENV_CONFIG.env === "local" 
      ? "/tmp/ide-workspaces"
      : process.env.TMPDIR || "/tmp/ide-workspaces";
    
    // Normalize workspace root to prevent path traversal at the root level
    workspaceRoot = path.resolve(workspaceRoot);
    
    filePersistence = new FilePersistence({
      workspaceRoot,
      enableSync,
    });

    console.log(`[FilePersistence] Initialized (sync: ${enableSync}, root: ${workspaceRoot})`);
  }

  return filePersistence;
}
