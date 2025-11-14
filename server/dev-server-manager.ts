import { spawn, ChildProcess } from "child_process";
import fs from "fs/promises";
import path from "path";
import { ENV_CONFIG } from "@shared/environment";
import { StructuredLogger } from "./logger";
import type { LogEntry } from "@shared/schema";

interface DevServer {
  workspaceId: string;
  type: "node" | "python" | "static" | "vite";
  port: number;
  process: ChildProcess;
  url: string;
  startedAt: Date;
}

export interface DevServerStartResult {
  success: boolean;
  server: DevServer | null;
  logs: string[]; // Legacy
  structuredLogs: LogEntry[]; // Phase 2
  errors: string[];
}

export class DevServerManager {
  private servers: Map<string, DevServer> = new Map();
  private portRange = { start: 3000, end: 4000 };
  private usedPorts: Set<number> = new Set();

  /**
   * Start a dev server for a workspace
   */
  async startServer(workspaceId: string, workspacePath: string): Promise<DevServer | null> {
    // Stop existing server if any
    await this.stopServer(workspaceId);

    // Detect server type
    const serverType = await this.detectServerType(workspacePath);
    if (!serverType) {
      console.log(`[DevServer] No server configuration detected for ${workspaceId}`);
      return null;
    }

    // Allocate port
    const port = this.allocatePort();
    if (!port) {
      console.error(`[DevServer] No available ports`);
      return null;
    }

    // Start appropriate server
    const process = await this.spawnServer(serverType, workspacePath, port);
    if (!process) {
      this.usedPorts.delete(port);
      return null;
    }

    const server: DevServer = {
      workspaceId,
      type: serverType,
      port,
      process,
      url: `http://localhost:${port}`,
      startedAt: new Date(),
    };

    this.servers.set(workspaceId, server);
    console.log(`[DevServer] Started ${serverType} server for ${workspaceId} on port ${port}`);

    return server;
  }

  /**
   * Stop a dev server
   */
  async stopServer(workspaceId: string): Promise<void> {
    const server = this.servers.get(workspaceId);
    if (!server) return;

    try {
      server.process.kill();
      this.usedPorts.delete(server.port);
      this.servers.delete(workspaceId);
      console.log(`[DevServer] Stopped server for ${workspaceId}`);
    } catch (error: any) {
      console.error(`[DevServer] Error stopping server:`, error.message);
    }
  }

  /**
   * Get server info
   */
  getServer(workspaceId: string): DevServer | null {
    return this.servers.get(workspaceId) || null;
  }

  /**
   * Detect server type from workspace files
   */
  private async detectServerType(workspacePath: string): Promise<DevServer["type"] | null> {
    try {
      // Check for package.json (Node.js/Vite/React)
      const packageJsonPath = path.join(workspacePath, "package.json");
      try {
        const packageJson = JSON.parse(await fs.readFile(packageJsonPath, "utf-8"));
        
        // Check for Vite
        if (packageJson.dependencies?.vite || packageJson.devDependencies?.vite) {
          return "vite";
        }
        
        // Check for Express/Node.js server
        if (packageJson.dependencies?.express) {
          return "node";
        }
        
        // Default to Vite for React/Vue apps
        if (packageJson.dependencies?.react || packageJson.dependencies?.vue) {
          return "vite";
        }
      } catch {
        // package.json doesn't exist or is invalid
      }

      // Check for Python Flask/FastAPI
      const requirementsPath = path.join(workspacePath, "requirements.txt");
      try {
        const requirements = await fs.readFile(requirementsPath, "utf-8");
        if (requirements.includes("flask") || requirements.includes("fastapi")) {
          return "python";
        }
      } catch {
        // requirements.txt doesn't exist
      }

      // Check for static HTML
      const indexPath = path.join(workspacePath, "index.html");
      try {
        await fs.access(indexPath);
        return "static";
      } catch {
        // index.html doesn't exist
      }

      return null;
    } catch (error: any) {
      console.error(`[DevServer] Error detecting server type:`, error.message);
      return null;
    }
  }

  /**
   * Spawn a server process
   */
  private async spawnServer(
    type: DevServer["type"],
    workspacePath: string,
    port: number
  ): Promise<ChildProcess | null> {
    try {
      let proc: ChildProcess;

      switch (type) {
        case "vite":
          proc = spawn("npm", ["run", "dev", "--", "--port", port.toString()], {
            cwd: workspacePath,
            env: { ...process.env, PORT: port.toString() },
            detached: false,
          });
          break;

        case "node":
          proc = spawn("node", ["index.js"], {
            cwd: workspacePath,
            env: { ...process.env, PORT: port.toString() },
            detached: false,
          });
          break;

        case "python":
          proc = spawn("python", ["-m", "flask", "run", "--port", port.toString()], {
            cwd: workspacePath,
            env: { ...process.env, FLASK_APP: "app.py", FLASK_ENV: "development" },
            detached: false,
          });
          break;

        case "static":
          // Use a simple HTTP server for static files
          proc = spawn("python", ["-m", "http.server", port.toString()], {
            cwd: workspacePath,
            detached: false,
          });
          break;

        default:
          return null;
      }

      // Handle process output
      proc.stdout?.on("data", (data) => {
        console.log(`[DevServer:${type}] ${data.toString().trim()}`);
      });

      proc.stderr?.on("data", (data) => {
        console.error(`[DevServer:${type}] ${data.toString().trim()}`);
      });

      proc.on("exit", (code) => {
        console.log(`[DevServer:${type}] Process exited with code ${code}`);
      });

      return proc;
    } catch (error: any) {
      console.error(`[DevServer] Failed to spawn ${type} server:`, error.message);
      return null;
    }
  }

  /**
   * Allocate an available port
   */
  private allocatePort(): number | null {
    for (let port = this.portRange.start; port <= this.portRange.end; port++) {
      if (!this.usedPorts.has(port)) {
        this.usedPorts.add(port);
        return port;
      }
    }
    return null;
  }

  /**
   * Cleanup all servers
   */
  async cleanup(): Promise<void> {
    for (const [workspaceId, server] of this.servers) {
      await this.stopServer(workspaceId);
    }
    console.log(`[DevServer] Cleaned up all servers`);
  }
}

// Singleton instance
let devServerManager: DevServerManager | null = null;

export function getDevServerManager(): DevServerManager {
  if (!devServerManager) {
    devServerManager = new DevServerManager();
    console.log(`[DevServer] Manager initialized`);
  }

  return devServerManager;
}
