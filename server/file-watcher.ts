/**
 * File Watcher for Bidirectional Sync
 * 
 * Watches container filesystem for changes and syncs them back to storage.
 * Prevents circular updates by tracking internal vs external changes.
 */

import * as chokidar from "chokidar";
import { promises as fs } from "fs";
import path from "path";
import type { IStorage } from "./storage";
import { ENV_CONFIG } from "@shared/environment";

export interface FileWatcherOptions {
  workspaceId: string;
  storage: IStorage;
  workspaceRoot?: string;
  debounceMs?: number;
}

export class FileWatcher {
  private workspaceId: string;
  private storage: IStorage;
  private workspaceRoot: string;
  private workspacePath: string;
  private watcher: chokidar.FSWatcher | null = null;
  private debounceMs: number;
  
  // Track changes initiated by storage to prevent circular updates
  private internalChanges: Set<string> = new Set();
  
  // Debounce timers for file changes
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(options: FileWatcherOptions) {
    this.workspaceId = options.workspaceId;
    this.storage = options.storage;
    this.workspaceRoot = options.workspaceRoot || "/tmp/workspaces";
    this.workspacePath = path.join(this.workspaceRoot, this.workspaceId);
    this.debounceMs = options.debounceMs || 300; // 300ms debounce by default
  }

  /**
   * Start watching the workspace directory
   */
  async start(): Promise<void> {
    if (!ENV_CONFIG.sandbox.available) {
      console.log(`[FileWatcher] Skipping file watching in ${ENV_CONFIG.env} mode`);
      return;
    }

    if (this.watcher) {
      console.log(`[FileWatcher] Already watching workspace: ${this.workspaceId}`);
      return;
    }

    // Ensure workspace directory exists
    try {
      await fs.mkdir(this.workspacePath, { recursive: true });
    } catch (error: any) {
      console.error(`[FileWatcher] Failed to create workspace directory:`, error.message);
      throw error;
    }

    console.log(`[FileWatcher] Starting watch on: ${this.workspacePath}`);

    // Initialize chokidar watcher
    this.watcher = chokidar.watch(this.workspacePath, {
      ignored: /(^|[\/\\])\../,  // ignore dotfiles
      persistent: true,
      ignoreInitial: true,        // don't fire events for existing files
      awaitWriteFinish: {         // wait for write to finish before firing event
        stabilityThreshold: 200,
        pollInterval: 100,
      },
      depth: 10,                   // max depth to watch
    });

    // File added or changed
    this.watcher.on("add", (filePath: string) => this.handleChange(filePath, "add"));
    this.watcher.on("change", (filePath: string) => this.handleChange(filePath, "change"));
    
    // File deleted
    this.watcher.on("unlink", (filePath: string) => this.handleDelete(filePath));

    // Error handling
    this.watcher.on("error", (error: unknown) => {
      console.error(`[FileWatcher] Watcher error:`, error);
    });

    console.log(`[FileWatcher] Watching workspace: ${this.workspaceId}`);
  }

  /**
   * Stop watching the workspace directory
   */
  async stop(): Promise<void> {
    if (this.watcher) {
      // Clear all debounce timers
      const timers = Array.from(this.debounceTimers.values());
      for (const timer of timers) {
        clearTimeout(timer);
      }
      this.debounceTimers.clear();

      await this.watcher.close();
      this.watcher = null;
      console.log(`[FileWatcher] Stopped watching workspace: ${this.workspaceId}`);
    }
  }

  /**
   * Mark a file path as an internal change to prevent circular updates
   */
  markInternalChange(filePath: string): void {
    const normalizedPath = this.normalizeFilePath(filePath);
    this.internalChanges.add(normalizedPath);
    
    // Auto-remove after 1 second to prevent memory leaks
    setTimeout(() => {
      this.internalChanges.delete(normalizedPath);
    }, 1000);
  }

  /**
   * Handle file addition or modification
   */
  private handleChange(absolutePath: string, type: "add" | "change"): void {
    const relativePath = this.getRelativePath(absolutePath);
    
    // Check if this is an internal change (initiated by storage sync)
    if (this.internalChanges.has(relativePath)) {
      console.log(`[FileWatcher] Ignoring internal ${type}: ${relativePath}`);
      return;
    }

    // Debounce file changes to avoid excessive syncs
    const existingTimer = this.debounceTimers.get(relativePath);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(async () => {
      this.debounceTimers.delete(relativePath);
      await this.syncFileToStorage(absolutePath, relativePath, type);
    }, this.debounceMs);

    this.debounceTimers.set(relativePath, timer);
  }

  /**
   * Handle file deletion
   */
  private async handleDelete(absolutePath: string): Promise<void> {
    const relativePath = this.getRelativePath(absolutePath);
    
    // Check if this is an internal change
    if (this.internalChanges.has(relativePath)) {
      console.log(`[FileWatcher] Ignoring internal deletion: ${relativePath}`);
      return;
    }

    try {
      // Find file in storage by path
      const file = await this.storage.getFileByPath(this.workspaceId, relativePath);
      
      if (file) {
        await this.storage.deleteFile(file.id);
        console.log(`[FileWatcher] Synced deletion to storage: ${relativePath}`);
      }
    } catch (error: any) {
      console.error(`[FileWatcher] Failed to sync deletion: ${relativePath}`, error.message);
    }
  }

  /**
   * Sync file changes to storage
   */
  private async syncFileToStorage(
    absolutePath: string,
    relativePath: string,
    type: "add" | "change"
  ): Promise<void> {
    try {
      // Read file content
      const content = await fs.readFile(absolutePath, "utf-8");
      
      // Check if file exists in storage
      const existingFile = await this.storage.getFileByPath(this.workspaceId, relativePath);
      
      if (existingFile) {
        // Update existing file
        if (existingFile.content !== content) {
          await this.storage.updateFile(existingFile.id, content);
          console.log(`[FileWatcher] Synced update to storage: ${relativePath}`);
        }
      } else {
        // Create new file
        const language = this.detectLanguage(relativePath);
        await this.storage.createFile(this.workspaceId, relativePath, content, language);
        console.log(`[FileWatcher] Synced new file to storage: ${relativePath}`);
      }
    } catch (error: any) {
      console.error(`[FileWatcher] Failed to sync file: ${relativePath}`, error.message);
    }
  }

  /**
   * Get relative path from absolute path
   */
  private getRelativePath(absolutePath: string): string {
    return path.relative(this.workspacePath, absolutePath);
  }

  /**
   * Normalize file path for comparison
   */
  private normalizeFilePath(filePath: string): string {
    return filePath.replace(/\\/g, "/"); // Normalize Windows paths
  }

  /**
   * Detect language from file extension
   */
  private detectLanguage(filePath: string): string | undefined {
    const ext = path.extname(filePath).toLowerCase();
    
    const languageMap: Record<string, string> = {
      ".js": "javascript",
      ".jsx": "javascript",
      ".ts": "typescript",
      ".tsx": "typescript",
      ".py": "python",
      ".go": "go",
      ".rs": "rust",
      ".c": "c",
      ".cpp": "cpp",
      ".h": "c",
      ".hpp": "cpp",
      ".java": "java",
      ".rb": "ruby",
      ".php": "php",
      ".sh": "shell",
      ".html": "html",
      ".css": "css",
      ".json": "json",
      ".md": "markdown",
      ".yaml": "yaml",
      ".yml": "yaml",
      ".toml": "toml",
      ".xml": "xml",
      ".sql": "sql",
    };

    return languageMap[ext];
  }

  /**
   * Check if watcher is active
   */
  isWatching(): boolean {
    return this.watcher !== null;
  }
}
