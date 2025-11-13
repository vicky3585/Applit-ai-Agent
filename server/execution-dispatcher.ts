/**
 * Execution Dispatcher
 * 
 * Handles multi-language code execution with support for:
 * - Interpreted languages (Python, JS, TS, Ruby, PHP)
 * - Compiled languages (Go, Rust, C/C++, Java)
 * - Framework scripts (npm, cargo, go mod)
 */

import type { ExecutionResult } from "./sandbox";
import {
  type LanguageCapability,
  type LanguageDetectionContext,
  detectLanguage,
  getBuildDirectory,
  getOutputPath,
} from "./language-registry";
import { getSandboxManager } from "./sandbox-manager";
import type { IStorage } from "./storage";
import { getJavaMainClass } from "./java-utils";

export interface ExecutionOptions {
  workspaceId: string;
  filePath: string;
  languageHint?: string; // Optional explicit language hint
  timeout?: number;
  env?: Record<string, string>;
}

export interface ExecutionStageResult {
  stage: "detection" | "compilation" | "execution";
  success: boolean;
  output?: string;
  error?: string;
  duration?: number;
}

export interface EnhancedExecutionResult extends ExecutionResult {
  language?: string;
  stages?: ExecutionStageResult[];
  totalDuration?: number;
}

export class ExecutionDispatcher {
  private manager = getSandboxManager();
  private storage: IStorage;

  constructor(storage: IStorage) {
    this.storage = storage;
  }

  /**
   * Execute file with automatic language detection and appropriate execution strategy
   */
  async executeFile(options: ExecutionOptions): Promise<EnhancedExecutionResult> {
    const startTime = Date.now();
    const stages: ExecutionStageResult[] = [];

    try {
      // Stage 1: Language Detection
      const detectionStart = Date.now();
      const capability = await this.detectLanguageCapability(options);
      
      if (!capability) {
        return {
          success: false,
          output: "",
          error: `Unsupported file type: ${options.filePath}\n\nSupported languages: Python, JavaScript, TypeScript, Go, Rust, C/C++, Java, Ruby, PHP, Shell`,
          exitCode: 1,
          stages: [{
            stage: "detection",
            success: false,
            error: "Language detection failed",
            duration: Date.now() - detectionStart,
          }],
        };
      }

      stages.push({
        stage: "detection",
        success: true,
        output: `Detected language: ${capability.name}`,
        duration: Date.now() - detectionStart,
      });

      // Stage 2: Validate required tools
      const missingTools = await this.validateRequiredTools(capability, options.workspaceId);
      if (missingTools.length > 0) {
        return {
          success: false,
          output: "",
          error: `Missing required tools: ${missingTools.join(", ")}\n\nPlease install the required tools using the package manager.`,
          exitCode: 1,
          language: capability.id,
          stages,
        };
      }

      // Stage 3: Execute based on language mode
      let result: EnhancedExecutionResult;
      
      switch (capability.mode) {
        case "interpreter":
          result = await this.executeInterpreted(capability, options);
          break;
        case "compile-run":
          result = await this.executeCompileRun(capability, options);
          break;
        case "script":
          result = await this.executeScript(capability, options);
          break;
        default:
          throw new Error(`Unsupported execution mode: ${capability.mode}`);
      }

      result.language = capability.id;
      result.stages = [...stages, ...(result.stages || [])];
      result.totalDuration = Date.now() - startTime;
      
      return result;
    } catch (error: any) {
      return {
        success: false,
        output: "",
        error: `Execution failed: ${error.message}`,
        exitCode: 1,
        stages,
        totalDuration: Date.now() - startTime,
      };
    }
  }

  /**
   * Detect language capability using multi-tier detection
   */
  private async detectLanguageCapability(options: ExecutionOptions): Promise<LanguageCapability | null> {
    // Get file content for shebang detection
    const file = await this.storage.getFileByPath(options.workspaceId, options.filePath);
    const fileContent = file?.content;

    // Get workspace files for framework detection
    const workspaceFiles = await this.storage.getFilesByWorkspace(options.workspaceId);
    const filePaths = workspaceFiles.map(f => f.path);

    const context: LanguageDetectionContext = {
      filePath: options.filePath,
      fileContent,
      workspaceFiles: filePaths,
      explicitHint: options.languageHint,
    };

    return detectLanguage(context);
  }

  /**
   * Validate that required tools are available in the container
   */
  private async validateRequiredTools(capability: LanguageCapability, workspaceId: string): Promise<string[]> {
    const missing: string[] = [];

    for (const tool of capability.requiredTools) {
      const result = await this.manager.executeInContainer(
        workspaceId,
        ["which", tool],
        "fullstack"
      );

      if (!result.success) {
        missing.push(tool);
      }
    }

    return missing;
  }

  /**
   * Execute interpreted language (Python, JS, Ruby, etc.)
   */
  private async executeInterpreted(
    capability: LanguageCapability,
    options: ExecutionOptions
  ): Promise<EnhancedExecutionResult> {
    const stages: ExecutionStageResult[] = [];
    const executionStart = Date.now();

    // Build command
    const interpreterParts = capability.interpreter!.split(" ");
    const command = [...interpreterParts, `/workspace/${options.filePath}`];

    // Execute
    const result = await this.manager.executeInContainer(
      options.workspaceId,
      command,
      "fullstack"
    );

    stages.push({
      stage: "execution",
      success: result.success,
      output: result.output,
      error: result.error,
      duration: Date.now() - executionStart,
    });

    return {
      ...result,
      stages,
    };
  }

  /**
   * Execute compiled language (Go, Rust, C/C++, Java)
   */
  private async executeCompileRun(
    capability: LanguageCapability,
    options: ExecutionOptions
  ): Promise<EnhancedExecutionResult> {
    const stages: ExecutionStageResult[] = [];

    // Stage 1: Compilation
    const compileStart = Date.now();
    const buildDir = getBuildDirectory(options.workspaceId, capability.id);
    const outputPath = getOutputPath(options.workspaceId, capability.id, options.filePath);

    // Create build directory
    await this.manager.executeInContainer(
      options.workspaceId,
      ["mkdir", "-p", buildDir],
      "fullstack"
    );

    // Build command
    const buildCommand = capability.buildCommand!(
      `/workspace/${options.filePath}`,
      outputPath
    );

    const compileResult = await this.manager.executeInContainer(
      options.workspaceId,
      buildCommand,
      "fullstack"
    );

    stages.push({
      stage: "compilation",
      success: compileResult.success,
      output: compileResult.output,
      error: compileResult.error,
      duration: Date.now() - compileStart,
    });

    // If compilation failed, return early
    if (!compileResult.success) {
      return {
        success: false,
        output: compileResult.output,
        error: `Compilation failed:\n${compileResult.error || compileResult.output}`,
        exitCode: compileResult.exitCode || 1,
        stages,
      };
    }

    // Stage 2: Execution
    const runStart = Date.now();
    
    // For Java, extract main class name from file content
    let runContext = { filePath: options.filePath };
    if (capability.id === "java") {
      const file = await this.storage.getFileByPath(options.workspaceId, options.filePath);
      if (file) {
        const mainClass = await getJavaMainClass(options.filePath, file.content);
        runContext = { ...runContext, mainClass } as any;
      }
    }
    
    const runCommand = capability.runCommand!(outputPath, runContext);

    const runResult = await this.manager.executeInContainer(
      options.workspaceId,
      runCommand,
      "fullstack"
    );

    stages.push({
      stage: "execution",
      success: runResult.success,
      output: runResult.output,
      error: runResult.error,
      duration: Date.now() - runStart,
    });

    return {
      ...runResult,
      stages,
    };
  }

  /**
   * Execute framework scripts (npm, cargo, go)
   */
  private async executeScript(
    capability: LanguageCapability,
    options: ExecutionOptions
  ): Promise<EnhancedExecutionResult> {
    const stages: ExecutionStageResult[] = [];
    const executionStart = Date.now();

    // For script mode, use the scriptRunner and defaultScript
    const runner = capability.scriptRunner!;
    const script = capability.defaultScript || "start";
    const command = [runner, script];

    const result = await this.manager.executeInContainer(
      options.workspaceId,
      command,
      "fullstack"
    );

    stages.push({
      stage: "execution",
      success: result.success,
      output: result.output,
      error: result.error,
      duration: Date.now() - executionStart,
    });

    return {
      ...result,
      stages,
    };
  }

  /**
   * Execute with dependency auto-bootstrap
   */
  async executeWithBootstrap(options: ExecutionOptions): Promise<EnhancedExecutionResult> {
    // Detect if dependencies need to be installed
    const workspaceFiles = await this.storage.getFilesByWorkspace(options.workspaceId);
    const filePaths = workspaceFiles.map(f => f.path);

    const needsBootstrap = await this.checkNeedsBootstrap(filePaths, options.workspaceId);

    if (needsBootstrap) {
      console.log(`[ExecutionDispatcher] Auto-bootstrapping dependencies for ${options.workspaceId}`);
      await this.bootstrap(filePaths, options.workspaceId);
    }

    return this.executeFile(options);
  }

  /**
   * Check if workspace needs dependency bootstrap
   */
  private async checkNeedsBootstrap(filePaths: string[], workspaceId: string): Promise<boolean> {
    // Check for package.json without node_modules
    if (filePaths.includes("package.json")) {
      const result = await this.manager.executeInContainer(
        workspaceId,
        ["test", "-d", "/workspace/node_modules"],
        "fullstack"
      );
      if (!result.success) {
        return true; // node_modules doesn't exist
      }
    }

    // Add more bootstrap checks for other languages as needed

    return false;
  }

  /**
   * Bootstrap workspace dependencies
   */
  private async bootstrap(filePaths: string[], workspaceId: string): Promise<void> {
    if (filePaths.includes("package.json")) {
      console.log(`[ExecutionDispatcher] Running npm install for ${workspaceId}`);
      await this.manager.executeInContainer(
        workspaceId,
        ["npm", "install"],
        "fullstack"
      );
    }

    if (filePaths.includes("requirements.txt")) {
      console.log(`[ExecutionDispatcher] Running pip install for ${workspaceId}`);
      await this.manager.executeInContainer(
        workspaceId,
        ["pip3", "install", "-r", "/workspace/requirements.txt"],
        "fullstack"
      );
    }

    // Add more bootstrap commands for other package managers
  }
}

/**
 * Create singleton dispatcher instance
 */
let dispatcherInstance: ExecutionDispatcher | null = null;

export function getExecutionDispatcher(storage: IStorage): ExecutionDispatcher {
  if (!dispatcherInstance) {
    dispatcherInstance = new ExecutionDispatcher(storage);
  }
  return dispatcherInstance;
}
