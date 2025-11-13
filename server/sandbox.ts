/**
 * Code Execution Sandbox
 * 
 * Provides secure code execution with environment-aware implementation:
 * - Local: Uses Docker containers with multi-language support
 * - Replit: Uses mock sandbox (logs commands without execution)
 */

import Docker from "dockerode";
import { ENV_CONFIG, isServiceAvailable } from "@shared/environment";
import { getSandboxManager } from "./sandbox-manager";
import type { IStorage } from "./storage";
import type { ExecutionOptions } from "./execution-dispatcher";

export interface ExecutionResult {
  success: boolean;
  output: string;
  error?: string;
  exitCode?: number;
}

export interface ISandbox {
  executeCommand(command: string, workspaceId: string): Promise<ExecutionResult>;
  executeCommandArgv(argv: string[], workspaceId: string): Promise<ExecutionResult>;
  executeFile(filePath: string, workspaceId: string, languageHint?: string): Promise<ExecutionResult>;
  executeFileWithOptions(options: ExecutionOptions): Promise<ExecutionResult>;
  installPackages(packages: string[], packageManager: "npm" | "pip" | "apt", workspaceId: string): Promise<ExecutionResult>;
  setStorage(storage: IStorage): void; // For injection
}

/**
 * Docker-based sandbox for local execution with multi-language support
 */
class DockerSandbox implements ISandbox {
  private manager = getSandboxManager();
  private storage: IStorage | null = null;

  constructor() {
    console.log("[DockerSandbox] Using SandboxManager with multi-language execution");
  }

  setStorage(storage: IStorage): void {
    this.storage = storage;
  }

  async executeCommand(command: string, workspaceId: string): Promise<ExecutionResult> {
    // Use bash -c for shell command execution
    return this.manager.executeInContainer(workspaceId, ["/bin/bash", "-c", command]);
  }

  async executeCommandArgv(argv: string[], workspaceId: string): Promise<ExecutionResult> {
    // Direct argv execution without shell parsing
    return this.manager.executeInContainer(workspaceId, argv);
  }

  async executeFile(filePath: string, workspaceId: string, languageHint?: string): Promise<ExecutionResult> {
    return this.executeFileWithOptions({
      workspaceId,
      filePath,
      languageHint,
    });
  }

  async executeFileWithOptions(options: ExecutionOptions): Promise<ExecutionResult> {
    // Use enhanced execution dispatcher if storage is available
    if (this.storage) {
      const { getExecutionDispatcher } = await import("./execution-dispatcher");
      const dispatcher = getExecutionDispatcher(this.storage);
      
      const result = await dispatcher.executeFile(options);

      // Convert enhanced result to basic ExecutionResult
      return {
        success: result.success,
        output: result.output,
        error: result.error,
        exitCode: result.exitCode,
      };
    }

    // Fallback to legacy execution for backward compatibility
    return this.executeLegacy(options.filePath, options.workspaceId);
  }

  /**
   * Legacy execution method (fallback)
   */
  private async executeLegacy(filePath: string, workspaceId: string): Promise<ExecutionResult> {
    const extension = filePath.split(".").pop();
    let command: string;

    switch (extension) {
      case "py":
        command = `python3 /workspace/${filePath}`;
        break;
      case "js":
        command = `node /workspace/${filePath}`;
        break;
      case "ts":
        command = `npx tsx /workspace/${filePath}`;
        break;
      case "sh":
        command = `bash /workspace/${filePath}`;
        break;
      default:
        return {
          success: false,
          output: "",
          error: `Unsupported file type: .${extension}`,
          exitCode: 1,
        };
    }

    return this.executeCommand(command, workspaceId);
  }

  async installPackages(
    packages: string[],
    packageManager: "npm" | "pip" | "apt",
    workspaceId: string
  ): Promise<ExecutionResult> {
    const command =
      packageManager === "npm"
        ? `npm install ${packages.join(" ")}`
        : packageManager === "pip"
        ? `pip3 install ${packages.join(" ")}`
        : `apt-get install -y ${packages.join(" ")}`;

    return this.executeCommand(command, workspaceId);
  }
}

/**
 * Mock sandbox for Replit environment (logs only, no execution)
 */
class MockSandbox implements ISandbox {
  private storage: IStorage | null = null;

  setStorage(storage: IStorage): void {
    this.storage = storage;
  }

  async executeCommand(command: string, workspaceId: string): Promise<ExecutionResult> {
    console.log(`[MockSandbox] Would execute command: ${command}`);
    return {
      success: true,
      output: `[Mock Execution] Command logged: ${command}\n(Docker not available on Replit - deploy locally for real execution)`,
      exitCode: 0,
    };
  }

  async executeCommandArgv(argv: string[], workspaceId: string): Promise<ExecutionResult> {
    console.log(`[MockSandbox] Would execute argv:`, argv);
    return {
      success: true,
      output: `[Mock Execution] Command logged: ${argv.join(" ")}\n(Docker not available on Replit - deploy locally for real execution)`,
      exitCode: 0,
    };
  }

  async executeFile(filePath: string, workspaceId: string, languageHint?: string): Promise<ExecutionResult> {
    return this.executeFileWithOptions({
      workspaceId,
      filePath,
      languageHint,
    });
  }

  async executeFileWithOptions(options: ExecutionOptions): Promise<ExecutionResult> {
    console.log(`[MockSandbox] Would execute file: ${options.filePath} (hint: ${options.languageHint})`);
    
    // Simulate streaming output if callback provided
    const mockOutput = `[Mock Execution] File execution logged: ${options.filePath}\n(Docker not available on Replit - deploy locally for real execution)\n`;
    
    if (options.onOutput) {
      // Simulate realistic streaming by splitting into chunks
      const chunks = mockOutput.match(/.{1,50}/g) || [mockOutput];
      for (const chunk of chunks) {
        options.onOutput(chunk);
        // Small delay to simulate real execution
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
    
    return {
      success: true,
      output: mockOutput,
      exitCode: 0,
    };
  }

  async installPackages(
    packages: string[],
    packageManager: "npm" | "pip" | "apt",
    workspaceId: string
  ): Promise<ExecutionResult> {
    console.log(`[MockSandbox] Would install packages: ${packages.join(", ")} using ${packageManager}`);
    return {
      success: true,
      output: `[Mock Execution] Package installation logged: ${packages.join(", ")}\n(Docker not available on Replit - deploy locally for real execution)`,
      exitCode: 0,
    };
  }
}

/**
 * Create sandbox instance based on environment
 */
export function createSandbox(): ISandbox {
  if (isServiceAvailable("docker")) {
    console.log("[Sandbox] Using Docker sandbox (local mode)");
    return new DockerSandbox();
  }
  
  console.log("[Sandbox] Using mock sandbox (Replit mode)");
  return new MockSandbox();
}

export const sandbox = createSandbox();

/**
 * Graceful shutdown handler for Docker sandbox cleanup
 */
export async function shutdownSandbox(): Promise<void> {
  if (isServiceAvailable("docker")) {
    console.log("[Sandbox] Initiating graceful shutdown...");
    const manager = getSandboxManager();
    await manager.cleanupAll();
    console.log("[Sandbox] Shutdown complete");
  }
}
