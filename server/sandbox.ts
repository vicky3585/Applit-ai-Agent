/**
 * Code Execution Sandbox
 * 
 * Provides secure code execution with environment-aware implementation:
 * - Local: Uses Docker containers
 * - Replit: Uses mock sandbox (logs commands without execution)
 */

import Docker from "dockerode";
import { ENV_CONFIG, isServiceAvailable } from "@shared/environment";

export interface ExecutionResult {
  success: boolean;
  output: string;
  error?: string;
  exitCode?: number;
}

export interface ISandbox {
  executeCommand(command: string, workspaceId: string): Promise<ExecutionResult>;
  executeCommandArgv(argv: string[], workspaceId: string): Promise<ExecutionResult>;
  executeFile(filePath: string, workspaceId: string): Promise<ExecutionResult>;
  installPackages(packages: string[], packageManager: "npm" | "pip" | "apt", workspaceId: string): Promise<ExecutionResult>;
}

/**
 * Docker-based sandbox for local execution
 */
class DockerSandbox implements ISandbox {
  private docker: Docker;
  private containerName: string;

  constructor() {
    this.docker = new Docker();
    this.containerName = "webide_sandbox";
  }

  async executeCommand(command: string, workspaceId: string): Promise<ExecutionResult> {
    try {
      const container = this.docker.getContainer(this.containerName);
      
      const exec = await container.exec({
        Cmd: ["/bin/bash", "-c", command],
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

      return {
        success: inspect.ExitCode === 0,
        output: output.trim(),
        exitCode: inspect.ExitCode ?? undefined,
      };
    } catch (error: any) {
      return {
        success: false,
        output: "",
        error: error.message,
        exitCode: 1,
      };
    }
  }

  async executeCommandArgv(argv: string[], workspaceId: string): Promise<ExecutionResult> {
    try {
      const container = this.docker.getContainer(this.containerName);
      
      // Execute command directly with argv array - NO SHELL PARSING
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

      return {
        success: inspect.ExitCode === 0,
        output: output.trim(),
        exitCode: inspect.ExitCode ?? undefined,
      };
    } catch (error: any) {
      return {
        success: false,
        output: "",
        error: error.message,
        exitCode: 1,
      };
    }
  }

  async executeFile(filePath: string, workspaceId: string): Promise<ExecutionResult> {
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

  async executeFile(filePath: string, workspaceId: string): Promise<ExecutionResult> {
    console.log(`[MockSandbox] Would execute file: ${filePath}`);
    return {
      success: true,
      output: `[Mock Execution] File execution logged: ${filePath}\n(Docker not available on Replit - deploy locally for real execution)`,
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
