/**
 * Docker Sandbox Manager
 * 
 * Manages Docker container lifecycle for workspace isolation:
 * - Creates containers per workspace with proper runtime images
 * - Mounts workspace files for bidirectional sync
 * - Handles container start/stop/cleanup
 * - Enforces resource limits (CPU, memory)
 */

import Docker from "dockerode";
import path from "path";
import fs from "fs";
import { ExecutionResult } from "./sandbox";

export interface SandboxConfig {
  workspaceId: string;
  runtime: "node" | "python" | "fullstack";
  memoryLimit?: string;
  cpuLimit?: number;
}

export interface ContainerInfo {
  id: string;
  workspaceId: string;
  runtime: string;
  status: "created" | "running" | "stopped" | "error";
  createdAt: Date;
  lastActivityAt: Date;
}

const RUNTIME_IMAGES = {
  node: "node:20-alpine",
  python: "python:3.11-alpine",
  fullstack: "node:20-bullseye",
} as const;

export class SandboxManager {
  private docker: Docker;
  private containers: Map<string, ContainerInfo> = new Map();
  private workspaceRoot: string;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly CONTAINER_TTL_MS = 30 * 60 * 1000; // 30 minutes of inactivity
  private readonly CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // Check every 5 minutes
  private creationLocks: Map<string, Promise<Docker.Container>> = new Map();

  constructor(workspaceRoot: string = "/tmp/workspaces") {
    this.docker = new Docker();
    this.workspaceRoot = workspaceRoot;
    this.ensureWorkspaceRoot();
    this.reconcileState();
    this.startCleanupTask();
  }

  private ensureWorkspaceRoot() {
    if (!fs.existsSync(this.workspaceRoot)) {
      fs.mkdirSync(this.workspaceRoot, { recursive: true });
      console.log(`[SandboxManager] Created workspace root: ${this.workspaceRoot}`);
    }
  }

  private getWorkspacePath(workspaceId: string): string {
    const workspacePath = path.join(this.workspaceRoot, workspaceId);
    if (!fs.existsSync(workspacePath)) {
      fs.mkdirSync(workspacePath, { recursive: true });
    }
    return workspacePath;
  }

  private getContainerName(workspaceId: string): string {
    return `webide_workspace_${workspaceId}`;
  }

  /**
   * Create and start a container for a workspace
   */
  async createContainer(config: SandboxConfig): Promise<string> {
    const { workspaceId, runtime, memoryLimit = "512m", cpuLimit = 1 } = config;
    const containerName = this.getContainerName(workspaceId);
    const workspacePath = this.getWorkspacePath(workspaceId);
    const image = RUNTIME_IMAGES[runtime];

    try {
      console.log(`[SandboxManager] Creating container for workspace ${workspaceId}`);
      console.log(`[SandboxManager] Runtime: ${runtime}, Image: ${image}`);

      // Pull image if not available
      await this.ensureImage(image);

      // Create container with workspace mounted
      const container = await this.docker.createContainer({
        name: containerName,
        Image: image,
        Tty: true,
        OpenStdin: true,
        WorkingDir: "/workspace",
        HostConfig: {
          Binds: [`${workspacePath}:/workspace`],
          Memory: this.parseMemoryLimit(memoryLimit),
          NanoCpus: cpuLimit * 1e9,
          AutoRemove: false,
        },
        Cmd: ["/bin/sh"],
      });

      // Start container
      await container.start();

      const now = new Date();
      const info: ContainerInfo = {
        id: container.id,
        workspaceId,
        runtime,
        status: "running",
        createdAt: now,
        lastActivityAt: now,
      };

      this.containers.set(workspaceId, info);
      console.log(`[SandboxManager] Container created and started: ${container.id.substring(0, 12)}`);

      return container.id;
    } catch (error: any) {
      console.error(`[SandboxManager] Failed to create container:`, error);
      throw new Error(`Failed to create container: ${error.message}`);
    }
  }

  /**
   * Get or create container for workspace with lock to prevent race conditions
   */
  async getOrCreateContainer(config: SandboxConfig): Promise<Docker.Container> {
    const { workspaceId } = config;
    const containerName = this.getContainerName(workspaceId);

    // Check if there's already a creation/startup in progress - wait for it
    if (this.creationLocks.has(workspaceId)) {
      console.log(`[SandboxManager] Waiting for concurrent operation: ${containerName}`);
      try {
        await this.creationLocks.get(workspaceId);
        return this.docker.getContainer(containerName);
      } catch (error) {
        // Lock was rejected, retry the operation
        return this.getOrCreateContainer(config);
      }
    }

    // Create lock promise for this operation to prevent concurrent access
    let resolveLock: (container: Docker.Container) => void;
    let rejectLock: (error: any) => void;
    const lockPromise = new Promise<Docker.Container>((resolve, reject) => {
      resolveLock = resolve;
      rejectLock = reject;
    });
    this.creationLocks.set(workspaceId, lockPromise);

    try {
      // Check if container already exists
      const container = this.docker.getContainer(containerName);
      
      try {
        const inspect = await container.inspect();

        // Update activity timestamp
        if (this.containers.has(workspaceId)) {
          this.containers.get(workspaceId)!.lastActivityAt = new Date();
        }

        // If container exists but is stopped, start it
        if (!inspect.State.Running) {
          console.log(`[SandboxManager] Starting stopped container: ${containerName}`);
          await container.start();
          
          if (this.containers.has(workspaceId)) {
            const info = this.containers.get(workspaceId)!;
            info.status = "running";
            info.lastActivityAt = new Date();
          }
        }

        resolveLock!(container);
        return container;
      } catch (inspectError: any) {
        // Container doesn't exist (404) - create it
        if (inspectError.statusCode === 404) {
          console.log(`[SandboxManager] Container not found, creating: ${containerName}`);
          await this.createContainer(config);
          const newContainer = this.docker.getContainer(containerName);
          resolveLock!(newContainer);
          return newContainer;
        }
        throw inspectError;
      }
    } catch (error: any) {
      // Reject the lock promise so waiting callers are notified
      rejectLock!(error);
      throw error;
    } finally {
      // Always remove lock after operation completes
      this.creationLocks.delete(workspaceId);
    }
  }

  /**
   * Execute command in workspace container
   */
  async executeInContainer(
    workspaceId: string,
    argv: string[],
    runtime: "node" | "python" | "fullstack" = "fullstack"
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    
    try {
      const container = await this.getOrCreateContainer({ workspaceId, runtime });

      const exec = await container.exec({
        Cmd: argv,
        AttachStdout: true,
        AttachStderr: true,
        WorkingDir: "/workspace",
      });

      const stream = await exec.start({ Detach: false });

      let output = "";
      stream.on("data", (chunk: Buffer) => {
        output += chunk.toString();
      });

      await new Promise((resolve) => stream.on("end", resolve));

      const inspect = await exec.inspect();
      const exitCode = inspect.ExitCode ?? undefined;
      const executionTime = Date.now() - startTime;

      // Update last activity timestamp
      if (this.containers.has(workspaceId)) {
        this.containers.get(workspaceId)!.lastActivityAt = new Date();
      }

      // Log execution metrics
      console.log(`[SandboxManager] Executed command in ${workspaceId}: exit=${exitCode}, time=${executionTime}ms`);
      
      // Log container metrics periodically (not every execution to reduce overhead)
      if (Math.random() < 0.1) {
        await this.logContainerMetrics(workspaceId, exitCode);
      }

      return {
        success: inspect.ExitCode === 0,
        output: output.trim(),
        exitCode,
      };
    } catch (error: any) {
      const executionTime = Date.now() - startTime;
      console.error(`[SandboxManager] Execution failed in ${workspaceId}: ${error.message}, time=${executionTime}ms`);
      
      return {
        success: false,
        output: "",
        error: error.message,
        exitCode: 1,
      };
    }
  }

  /**
   * Stop container for workspace
   */
  async stopContainer(workspaceId: string): Promise<void> {
    const containerName = this.getContainerName(workspaceId);
    
    try {
      const container = this.docker.getContainer(containerName);
      await container.stop({ t: 10 });
      
      if (this.containers.has(workspaceId)) {
        const info = this.containers.get(workspaceId)!;
        info.status = "stopped";
      }
      
      console.log(`[SandboxManager] Stopped container: ${containerName}`);
    } catch (error: any) {
      if (error.statusCode !== 404 && error.statusCode !== 304) {
        console.error(`[SandboxManager] Failed to stop container:`, error);
      }
    }
  }

  /**
   * Remove container for workspace
   */
  async removeContainer(workspaceId: string): Promise<void> {
    const containerName = this.getContainerName(workspaceId);
    
    try {
      const container = this.docker.getContainer(containerName);
      
      // Stop first if running
      try {
        await container.stop({ t: 5 });
      } catch (stopError: any) {
        // Ignore if already stopped
        if (stopError.statusCode !== 304) {
          throw stopError;
        }
      }
      
      // Remove container
      await container.remove({ force: true });
      
      this.containers.delete(workspaceId);
      console.log(`[SandboxManager] Removed container: ${containerName}`);
    } catch (error: any) {
      if (error.statusCode !== 404) {
        console.error(`[SandboxManager] Failed to remove container:`, error);
      }
    }
  }

  /**
   * Get container status
   */
  async getContainerStatus(workspaceId: string): Promise<ContainerInfo | null> {
    const containerName = this.getContainerName(workspaceId);
    
    try {
      const container = this.docker.getContainer(containerName);
      const inspect = await container.inspect();
      
      const existingInfo = this.containers.get(workspaceId);
      
      return {
        id: inspect.Id,
        workspaceId,
        runtime: existingInfo?.runtime || "unknown",
        status: inspect.State.Running ? "running" : "stopped",
        createdAt: new Date(inspect.Created),
        lastActivityAt: existingInfo?.lastActivityAt || new Date(),
      };
    } catch (error: any) {
      return this.containers.get(workspaceId) || null;
    }
  }

  /**
   * Ensure Docker image is available
   */
  private async ensureImage(image: string): Promise<void> {
    try {
      await this.docker.getImage(image).inspect();
      console.log(`[SandboxManager] Image already available: ${image}`);
    } catch (error: any) {
      if (error.statusCode === 404) {
        console.log(`[SandboxManager] Pulling image: ${image}`);
        await new Promise((resolve, reject) => {
          this.docker.pull(image, (err: any, stream: any) => {
            if (err) return reject(err);
            
            this.docker.modem.followProgress(stream, (err: any, output: any) => {
              if (err) return reject(err);
              resolve(output);
            });
          });
        });
        console.log(`[SandboxManager] Image pulled successfully: ${image}`);
      } else {
        throw error;
      }
    }
  }

  /**
   * Parse memory limit string to bytes
   */
  private parseMemoryLimit(limit: string): number {
    const units: { [key: string]: number } = {
      b: 1,
      k: 1024,
      m: 1024 * 1024,
      g: 1024 * 1024 * 1024,
    };
    
    const match = limit.toLowerCase().match(/^(\d+)([bkmg])$/);
    if (!match) {
      return 512 * 1024 * 1024; // Default 512MB
    }
    
    const value = parseInt(match[1]);
    const unit = match[2];
    return value * units[unit];
  }

  /**
   * Reconcile in-memory state with actual Docker containers on startup
   */
  private async reconcileState(): Promise<void> {
    try {
      console.log(`[SandboxManager] Reconciling container state...`);
      const containers = await this.docker.listContainers({ all: true });
      
      for (const containerInfo of containers) {
        const name = containerInfo.Names[0]?.replace("/", "");
        if (name?.startsWith("webide_workspace_")) {
          const workspaceId = name.replace("webide_workspace_", "");
          
          const createdAt = new Date(containerInfo.Created * 1000);
          const now = new Date();
          
          this.containers.set(workspaceId, {
            id: containerInfo.Id,
            workspaceId,
            runtime: "fullstack", // Default, should be persisted in future
            status: containerInfo.State === "running" ? "running" : "stopped",
            createdAt,
            lastActivityAt: containerInfo.State === "running" ? now : createdAt,
          });
          
          console.log(`[SandboxManager] Reconciled container: ${name} (${containerInfo.State})`);
        }
      }
      
      console.log(`[SandboxManager] Reconciled ${this.containers.size} containers`);
    } catch (error) {
      console.error(`[SandboxManager] Failed to reconcile state:`, error);
    }
  }

  /**
   * Start periodic cleanup task for idle containers
   */
  private startCleanupTask(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupIdleContainers();
    }, this.CLEANUP_INTERVAL_MS);
    
    console.log(`[SandboxManager] Started cleanup task (TTL: ${this.CONTAINER_TTL_MS / 1000}s)`);
  }

  /**
   * Stop cleanup task
   */
  private stopCleanupTask(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      console.log(`[SandboxManager] Stopped cleanup task`);
    }
  }

  /**
   * Remove idle containers based on last activity TTL
   */
  private async cleanupIdleContainers(): Promise<void> {
    const now = Date.now();
    const toRemove: string[] = [];
    
    for (const [workspaceId, info] of Array.from(this.containers.entries())) {
      // Only cleanup stopped containers OR running containers that have been idle
      const idleTime = now - info.lastActivityAt.getTime();
      
      if (idleTime > this.CONTAINER_TTL_MS) {
        // Double-check container state before removal
        try {
          const containerName = this.getContainerName(workspaceId);
          const container = this.docker.getContainer(containerName);
          const inspect = await container.inspect();
          
          // Only remove if truly stopped or has been idle for TTL period
          if (!inspect.State.Running || idleTime > this.CONTAINER_TTL_MS) {
            toRemove.push(workspaceId);
          }
        } catch (error: any) {
          // Container doesn't exist, remove from tracking
          if (error.statusCode === 404) {
            toRemove.push(workspaceId);
          }
        }
      }
    }
    
    if (toRemove.length > 0) {
      console.log(`[SandboxManager] Cleaning up ${toRemove.length} idle containers`);
      await Promise.all(toRemove.map(id => this.removeContainer(id)));
    }
  }

  /**
   * Log container metrics for observability
   */
  private async logContainerMetrics(workspaceId: string, exitCode?: number): Promise<void> {
    try {
      const containerName = this.getContainerName(workspaceId);
      const container = this.docker.getContainer(containerName);
      const stats = await container.stats({ stream: false });
      
      const memoryUsage = stats.memory_stats.usage || 0;
      const memoryLimit = stats.memory_stats.limit || 0;
      const cpuUsage = this.calculateCpuPercent(stats);
      
      console.log(`[SandboxManager] Metrics for ${workspaceId}:`);
      console.log(`  Memory: ${(memoryUsage / 1024 / 1024).toFixed(2)}MB / ${(memoryLimit / 1024 / 1024).toFixed(2)}MB`);
      console.log(`  CPU: ${cpuUsage.toFixed(2)}%`);
      if (exitCode !== undefined) {
        console.log(`  Exit Code: ${exitCode}`);
      }
    } catch (error) {
      // Ignore metrics errors
    }
  }

  /**
   * Calculate CPU usage percentage from Docker stats
   */
  private calculateCpuPercent(stats: any): number {
    const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - (stats.precpu_stats.cpu_usage?.total_usage || 0);
    const systemDelta = stats.cpu_stats.system_cpu_usage - (stats.precpu_stats.system_cpu_usage || 0);
    const cpuCount = stats.cpu_stats.online_cpus || 1;
    
    if (systemDelta > 0 && cpuDelta > 0) {
      return (cpuDelta / systemDelta) * cpuCount * 100;
    }
    return 0;
  }

  /**
   * Cleanup all containers (for shutdown)
   */
  async cleanupAll(): Promise<void> {
    console.log(`[SandboxManager] Cleaning up all containers...`);
    this.stopCleanupTask();
    
    const workspaceIds = Array.from(this.containers.keys());
    await Promise.all(
      workspaceIds.map(id => this.removeContainer(id))
    );
    
    console.log(`[SandboxManager] Cleanup complete`);
  }
}

// Global sandbox manager instance
let sandboxManager: SandboxManager | null = null;

export function getSandboxManager(): SandboxManager {
  if (!sandboxManager) {
    sandboxManager = new SandboxManager();
  }
  return sandboxManager;
}
