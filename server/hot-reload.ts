import chokidar from "chokidar";
import path from "path";
import type { Server as WebSocketServer } from "ws";

export interface HotReloadConfig {
  workspaceRoot: string;
  enabled: boolean;
}

export class HotReloadManager {
  private watchers: Map<string, chokidar.FSWatcher> = new Map();
  private config: HotReloadConfig;
  private wsServer: WebSocketServer | null = null;

  constructor(config: HotReloadConfig) {
    this.config = config;
  }

  setWebSocketServer(wsServer: WebSocketServer) {
    this.wsServer = wsServer;
  }

  /**
   * Start watching a workspace for file changes
   */
  async startWatching(workspaceId: string): Promise<void> {
    if (!this.config.enabled) {
      console.log(`[HotReload] Disabled - skipping watch for ${workspaceId}`);
      return;
    }

    // Stop existing watcher if any
    this.stopWatching(workspaceId);

    const workspacePath = path.join(this.config.workspaceRoot, workspaceId);

    const watcher = chokidar.watch(workspacePath, {
      ignored: /(^|[\/\\])\../, // ignore dotfiles
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 200,
        pollInterval: 100,
      },
    });

    watcher
      .on("add", (filePath) => this.handleFileChange(workspaceId, "add", filePath))
      .on("change", (filePath) => this.handleFileChange(workspaceId, "change", filePath))
      .on("unlink", (filePath) => this.handleFileChange(workspaceId, "delete", filePath))
      .on("error", (error) => console.error(`[HotReload] Watcher error:`, error));

    this.watchers.set(workspaceId, watcher);
    console.log(`[HotReload] Started watching: ${workspacePath}`);
  }

  /**
   * Stop watching a workspace
   */
  async stopWatching(workspaceId: string): Promise<void> {
    const watcher = this.watchers.get(workspaceId);
    if (watcher) {
      await watcher.close();
      this.watchers.delete(workspaceId);
      console.log(`[HotReload] Stopped watching: ${workspaceId}`);
    }
  }

  /**
   * Handle file change event
   */
  private handleFileChange(workspaceId: string, event: string, filePath: string): void {
    const relativePath = path.relative(
      path.join(this.config.workspaceRoot, workspaceId),
      filePath
    );

    console.log(`[HotReload] File ${event}: ${relativePath}`);

    // Broadcast to WebSocket clients
    if (this.wsServer) {
      this.wsServer.clients.forEach((client) => {
        if (client.readyState === 1) { // WebSocket.OPEN
          client.send(
            JSON.stringify({
              type: "hot_reload",
              event,
              file: relativePath,
              workspaceId,
              timestamp: Date.now(),
            })
          );
        }
      });
    }
  }

  /**
   * Cleanup all watchers
   */
  async cleanup(): Promise<void> {
    for (const [workspaceId, watcher] of this.watchers) {
      await watcher.close();
      console.log(`[HotReload] Cleaned up watcher: ${workspaceId}`);
    }
    this.watchers.clear();
  }
}

// Singleton instance
let hotReloadManager: HotReloadManager | null = null;

export function getHotReloadManager(): HotReloadManager {
  if (!hotReloadManager) {
    // Enable hot reload in development environments
    const enabled = process.env.NODE_ENV === "development" || process.env.NODE_ENV === "local";
    
    const workspaceRoot = process.env.NODE_ENV === "local" 
      ? "/tmp/ide-workspaces"
      : process.env.TMPDIR || "/tmp/ide-workspaces";

    hotReloadManager = new HotReloadManager({
      workspaceRoot,
      enabled,
    });

    console.log(`[HotReload] Initialized (enabled: ${enabled}, root: ${workspaceRoot})`);
  }

  return hotReloadManager;
}
