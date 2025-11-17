import type { IStorage } from "../storage";
import { PlannerAgent } from "./planner";
import { CoderAgent } from "./coder";
import { TesterAgent } from "./tester";
import { getFilePersistence } from "../file-persistence";
import type { AgentWorkflowState, AgentContext } from "./types";
import { withTimeout, TIMEOUT_CONFIGS, TimeoutError } from "../utils/timeout";

export type { AgentWorkflowState, AgentContext };

export class AgentOrchestrator {
  private storage: IStorage;
  private plannerAgent: PlannerAgent;
  private coderAgent: CoderAgent;
  private testerAgent: TesterAgent;

  constructor(storage: IStorage) {
    this.storage = storage;
    this.plannerAgent = new PlannerAgent();
    this.coderAgent = new CoderAgent();
    this.testerAgent = new TesterAgent();
  }

  async executeWorkflow(
    context: AgentContext,
    onStateUpdate: (state: AgentWorkflowState) => void
  ): Promise<AgentWorkflowState> {
    const state: AgentWorkflowState = {
      status: "processing",
      currentStep: "planning",
      progress: 0,
      logs: [],
      filesGenerated: [],
      errors: [],
      attemptCount: 0,
    };

    try {
      // Validate context
      if (!context.prompt?.trim()) {
        throw new Error("User prompt is required");
      }

      // Get max attempts from settings (per-workflow, not shared state)
      const maxIterations = context.settings?.maxIterations 
        ? parseInt(context.settings.maxIterations)
        : 3;
      const maxAttempts = Math.max(1, Math.min(20, maxIterations));

      state.logs.push(`[Orchestrator] Starting workflow with max ${maxAttempts} attempts`);
      state.logs.push(`[Orchestrator] Model: ${context.settings?.modelProvider || 'openai'}`);
      
      // Rewrite prompt if Docker unavailable and React requested
      const { ENV_CONFIG } = await import("@shared/environment");
      const devServersAvailable = ENV_CONFIG.sandbox.available && ENV_CONFIG.sandbox.mode !== "mock";
      let effectivePrompt = context.prompt;
      
      if (!devServersAvailable) {
        const promptLower = context.prompt.toLowerCase();
        const wantsReactVite = promptLower.includes('react') || promptLower.includes('vite');
        
        if (wantsReactVite) {
          state.logs.push(`⚠️ [Notice] Dev servers unavailable (Docker not installed) - generating static HTML/CSS/JavaScript instead of React`);
          
          // Rewrite prompt to request static HTML
          effectivePrompt = context.prompt
            .replace(/react/gi, 'vanilla JavaScript')
            .replace(/vite/gi, 'vanilla JavaScript')
            .replace(/\bcomponent\b/gi, 'section');
          
          effectivePrompt += '\n\n⚠️ IMPORTANT: Generate a SINGLE SELF-CONTAINED index.html file with inline CSS and JavaScript. No build tools, no package.json, no React. Use vanilla HTML/CSS/JavaScript only.';
          
          state.logs.push(`[Orchestrator] Rewrote prompt for static HTML generation`);
          
          // Update context with rewritten prompt so planner sees it
          context.prompt = effectivePrompt;
        }
      }
      
      onStateUpdate({ ...state });

      // Step 0: Clear existing files for React/Vite projects (template needs clean slate)
      // Only do this if dev servers are available (otherwise we're doing static HTML)
      const promptLower = context.prompt.toLowerCase();
      const wantsReactVite = promptLower.includes('react') || promptLower.includes('vite');
      const isReactVite = wantsReactVite && ENV_CONFIG.sandbox.available && ENV_CONFIG.sandbox.mode !== "mock";
      
      if (isReactVite) {
        state.logs.push("[Orchestrator] Clearing existing files for fresh template generation...");
        const existingFiles = await this.storage.getFilesByWorkspace(context.workspaceId);
        for (const file of existingFiles) {
          await this.storage.deleteFile(file.id);
        }
        state.logs.push(`[Orchestrator] Cleared ${existingFiles.length} existing file(s)`);
        // Update context to reflect empty file list
        context.existingFiles = [];
        onStateUpdate({ ...state });
      }

      // Step 1: Planning
      state.currentStep = "planning";
      state.progress = 0.1;
      state.logs.push("[Planner] Analyzing request and creating execution plan...");
      onStateUpdate({ ...state });

      const plan = await withTimeout(
        this.plannerAgent.createPlan(context),
        TIMEOUT_CONFIGS.AGENT_PLAN
      );
      state.plan = plan;
      state.logs.push(`[Planner] Plan created:\n${plan}`);
      state.progress = 0.3;
      onStateUpdate({ ...state });

      // Step 2: Coding (with auto-fix loop)
      let codingSuccess = false;
      let lastError: string | null = null;

      while (state.attemptCount < maxAttempts && !codingSuccess) {
        state.attemptCount++;
        state.currentStep = "coding"; // Reset to coding at start of each attempt
        state.logs.push(`[Coder] Attempt ${state.attemptCount}/${maxAttempts}...`);
        state.progress = 0.3 + (state.attemptCount / maxAttempts) * 0.3;
        onStateUpdate({ ...state });

        try {
          const codeResult: { files: Array<{ path: string; content: any; language?: string }> } = await withTimeout(
            this.coderAgent.generateCode(context, plan, lastError),
            TIMEOUT_CONFIGS.AGENT_CODE
          );
          state.filesGenerated = codeResult.files;
          state.logs.push(`[Coder] Generated ${codeResult.files.length} file(s)`);
          onStateUpdate({ ...state });
          
          // Stringify JSON objects FIRST (before saving and testing)
          const stringifiedFiles = codeResult.files.map((file: { path: string; content: any; language?: string }) => {
            let content = file.content;
            if (typeof content === 'object' && content !== null) {
              content = JSON.stringify(content, null, 2);
              state.logs.push(`[Orchestrator] Stringified JSON object for ${file.path}`);
            }
            return { ...file, content };
          });
          
          // Update state with stringified files
          state.filesGenerated = stringifiedFiles;
          
          // Save stringified files to storage and disk
          const filePersistence = getFilePersistence();
          state.logs.push(`[Orchestrator] Saving ${stringifiedFiles.length} file(s)...`);
          
          for (const file of stringifiedFiles) {
            try {
              await this.storage.createFile(
                context.workspaceId,
                file.path,
                file.content,
                file.language || "plaintext"
              );
            } catch (error: any) {
              state.logs.push(`[ERROR] Failed to save ${file.path} to storage: ${error.message}`);
            }
            
            // Also save to disk for preview
            try {
              await filePersistence.saveFile(context.workspaceId, file.path, file.content);
            } catch (error: any) {
              state.logs.push(`[Warning] Could not save ${file.path} to disk: ${error.message}`);
            }
          }
          
          state.logs.push(`[Orchestrator] ✅ All files saved successfully`);
          
          // Step 3: File completeness validation (before testing)
          const requiredFilesCheck = this.validateRequiredFiles(stringifiedFiles, context.prompt);
          if (!requiredFilesCheck.passed) {
            state.logs.push(`[Validator] ❌ Missing required files: ${requiredFilesCheck.missing.join(", ")}`);
            lastError = `Missing required files: ${requiredFilesCheck.missing.join(", ")}. Please generate ALL files for a complete, runnable project.`;
            
            if (state.attemptCount < maxAttempts) {
              state.logs.push(`[Orchestrator] Retrying with complete file set...`);
            } else {
              state.logs.push(`[Orchestrator] Max attempts (${maxAttempts}) reached`);
              state.errors.push(`Failed after ${maxAttempts} attempts: ${lastError}`);
            }
            continue; // Retry code generation
          }
          
          state.logs.push("[Validator] ✅ All required files present");
          onStateUpdate({ ...state });

          // Step 4: Testing
          state.currentStep = "testing";
          state.progress = 0.7;
          state.logs.push("[Tester] Running validation checks...");
          onStateUpdate({ ...state });

          const testResult: { passed: boolean; error?: string; details?: any } = await withTimeout(
            this.testerAgent.validateCode(context, stringifiedFiles),
            TIMEOUT_CONFIGS.AGENT_TEST
          );
          state.testResults = testResult;
          
          if (testResult.passed) {
            state.logs.push("[Tester] ✅ All validation checks passed!");
            
            // AUTO-INSTALL PACKAGES & START DEV SERVER
            const { ENV_CONFIG } = await import("@shared/environment");
            
            if (!ENV_CONFIG.sandbox.available) {
              state.logs.push("[Orchestrator] Dev server auto-start unavailable (requires Docker/local environment)");
              state.logs.push("[Orchestrator] Application ready - start dev server manually in Terminal");
            } else {
              try {
                const { getDevServerManager } = await import("../dev-server-manager");
                const { getFilePersistence } = await import("../file-persistence");
                const { detectPackages, installPackages } = await import("../package-installer");
                
                const manager = getDevServerManager();
                const persistence = getFilePersistence();
                
                // Get workspace path using FilePersistence helper (ensures directory exists)
                const workspacePath = await persistence.resolveWorkspacePath(context.workspaceId);
                
                if (!workspacePath) {
                  state.logs.push("[Orchestrator] Failed to create workspace directory");
                } else {
                  // Step 1: Auto-detect and install packages
                  state.logs.push("[Orchestrator] Detecting required packages...");
                  onStateUpdate({ ...state });
                  
                  const detectedPackages = detectPackages(state.filesGenerated);
                  
                  if (detectedPackages.length > 0) {
                    state.logs.push(`[Orchestrator] Found ${detectedPackages.length} package(s) to install`);
                    onStateUpdate({ ...state });
                    
                    const installResult = await installPackages(
                      detectedPackages,
                      workspacePath,
                      (message) => {
                        state.logs.push(`[PackageInstaller] ${message}`);
                        onStateUpdate({ ...state });
                      }
                    );
                    
                    // Merge structured logs from package installation
                    if (installResult.structuredLogs && installResult.structuredLogs.length > 0) {
                      state.structuredLogs = state.structuredLogs || [];
                      state.structuredLogs.push(...installResult.structuredLogs);
                    }
                    
                    if (installResult.success) {
                      state.logs.push("[Orchestrator] ✅ Package installation complete");
                    } else {
                      state.logs.push("[Orchestrator] ⚠️ Some packages failed to install, attempting to continue...");
                    }
                  } else {
                    state.logs.push("[Orchestrator] No packages to install");
                  }
                  
                  onStateUpdate({ ...state });
                  
                  // Step 2: Try to start dev server
                  state.logs.push("[Orchestrator] Starting dev server...");
                  onStateUpdate({ ...state });
                  
                  const server = await manager.startServer(context.workspaceId, workspacePath);
                  
                  if (server) {
                    state.logs.push(`[Orchestrator] ✅ Dev server running on port ${server.port} (${server.type})`);
                  } else {
                    state.logs.push("[Orchestrator] No dev server configured (static files can still be previewed)");
                  }
                }
              } catch (error: any) {
                // Non-fatal error - just log it
                state.logs.push(`[Orchestrator] Could not start dev server: ${error.message}`);
              }
            }
            
            codingSuccess = true;
          } else {
            // Failed - prepare for retry
            state.currentStep = "fixing";
            state.logs.push(`[Tester] Validation failed: ${testResult.error}`);
            lastError = testResult.error ?? null;
            
            if (state.attemptCount < maxAttempts) {
              state.logs.push(`[Orchestrator] Retrying with fixes...`);
            } else {
              state.logs.push(`[Orchestrator] Max attempts (${maxAttempts}) reached`);
              state.errors.push(`Failed after ${maxAttempts} attempts: ${testResult.error}`);
            }
          }
        } catch (error: any) {
          // Check if it's a timeout error
          if (error instanceof TimeoutError) {
            lastError = `Operation timed out: ${error.message}`;
            state.logs.push(`[Coder] ⏱️ Timeout: ${lastError}`);
            state.logs.push(`[Hint] Try simplifying your prompt or breaking it into smaller tasks`);
          } else {
            lastError = error.message || "Unknown error occurred";
            state.logs.push(`[Coder] Error: ${lastError}`);
          }
          
          // Log additional error details for debugging
          if (error.stack) {
            console.error("[Orchestrator] Full error:", error.stack);
          }
          
          if (state.attemptCount >= maxAttempts) {
            state.errors.push(`Code generation failed after ${maxAttempts} attempts: ${lastError}`);
          }
        }

        onStateUpdate({ ...state });
      }

      // Final state
      if (codingSuccess) {
        state.status = "complete";
        state.currentStep = "complete";
        state.progress = 1.0;
        state.logs.push("[Orchestrator] Workflow completed successfully!");
      } else {
        state.status = "failed";
        state.currentStep = "idle";
        state.progress = 0.7;
        state.logs.push("[Orchestrator] Workflow failed - could not generate valid code");
      }

      onStateUpdate({ ...state });
      return state;
    } catch (error: any) {
      state.status = "failed";
      state.currentStep = "idle";
      
      // Provide more helpful error messages
      const errorMessage = error.message || "Unknown error occurred";
      state.errors.push(errorMessage);
      state.logs.push(`[Orchestrator] Fatal error: ${errorMessage}`);
      
      // Log full error for debugging
      if (error.stack) {
        console.error("[Orchestrator] Full error stack:", error.stack);
      }
      
      // Add troubleshooting hints
      if (errorMessage.includes("API key")) {
        state.logs.push("[Hint] Please check your OpenAI API key in Settings");
      } else if (errorMessage.includes("rate limit")) {
        state.logs.push("[Hint] API rate limit reached. Please try again in a moment");
      } else if (errorMessage.includes("timeout")) {
        state.logs.push("[Hint] Request timed out. Try with a simpler prompt");
      }
      
      onStateUpdate({ ...state });
      return state;
    }
  }

  /**
   * Validate that all required files are present for the project type
   */
  private validateRequiredFiles(
    files: Array<{ path: string; content: string; language?: string }>,
    prompt: string
  ): { passed: boolean; missing: string[] } {
    const fileNames = files.map(f => f.path);
    const missing: string[] = [];
    
    // Detect project type from prompt
    const promptLower = prompt.toLowerCase();
    const isReactVite = promptLower.includes('react') || promptLower.includes('vite') || 
                        promptLower.includes('counter') || promptLower.includes('component');
    const isNodeBackend = promptLower.includes('server') || promptLower.includes('api') || 
                          promptLower.includes('express');
    const isStandaloneHTML = promptLower.includes('html') || promptLower.includes('static');
    
    // React/Vite project requirements
    if (isReactVite && !isStandaloneHTML) {
      const requiredFiles = [
        'package.json',
        'index.html',
        'vite.config.ts'
        // tsconfig.json is nice-to-have but not critical for Vite to run
      ];
      
      for (const required of requiredFiles) {
        if (!fileNames.includes(required)) {
          missing.push(required);
        }
      }
      
      // Check package.json content
      const packageJson = files.find(f => f.path === 'package.json');
      if (packageJson) {
        try {
          const pkg = JSON.parse(packageJson.content);
          if (!pkg.scripts || !pkg.scripts.dev) {
            missing.push('package.json: "scripts.dev" field');
          }
          if (!pkg.devDependencies || !pkg.devDependencies.vite) {
            missing.push('package.json: "devDependencies.vite" field');
          }
        } catch (error) {
          missing.push('package.json: valid JSON');
        }
      }
    }
    
    // Node.js backend requirements
    if (isNodeBackend && !isReactVite) {
      const requiredFiles = ['package.json'];
      for (const required of requiredFiles) {
        if (!fileNames.includes(required)) {
          missing.push(required);
        }
      }
    }
    
    // Standalone HTML doesn't need validation (single file is OK)
    
    return {
      passed: missing.length === 0,
      missing
    };
  }

}
