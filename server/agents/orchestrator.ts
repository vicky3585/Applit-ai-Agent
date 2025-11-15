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
      onStateUpdate({ ...state });

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
          const codeResult = await withTimeout(
            this.coderAgent.generateCode(context, plan, lastError),
            TIMEOUT_CONFIGS.AGENT_CODE
          );
          state.filesGenerated = codeResult.files;
          state.logs.push(`[Coder] Generated ${codeResult.files.length} file(s)`);
          codeResult.files.forEach((f: { path: string }) => {
            state.logs.push(`  - ${f.path}`);
          });
          
          // Save generated files to storage and disk
          const filePersistence = getFilePersistence();
          for (const file of codeResult.files) {
            // Fix: Stringify JSON objects (especially package.json)
            let content = file.content;
            if (typeof content === 'object' && content !== null) {
              content = JSON.stringify(content, null, 2);
              state.logs.push(`[Orchestrator] Stringified JSON object for ${file.path}`);
            }
            
            await this.storage.createFile(
              context.workspaceId,
              file.path,
              content,
              file.language || "plaintext"
            );
            
            // Also save to disk for preview
            try {
              await filePersistence.saveFile(context.workspaceId, file.path, content);
            } catch (error: any) {
              state.logs.push(`[Warning] Could not save to disk: ${file.path}`);
              state.logs.push(`[Orchestrator] Full error: ${error.message}`);
            }
          }

          // Step 3: Testing
          state.currentStep = "testing";
          state.progress = 0.7;
          state.logs.push("[Tester] Running validation checks...");
          onStateUpdate({ ...state });

          const testResult = await withTimeout(
            this.testerAgent.validateCode(context, state.filesGenerated),
            TIMEOUT_CONFIGS.AGENT_TEST
          );
          state.testResults = testResult;

          state.logs.push(`[DEBUG] testResult.passed = ${testResult.passed}`);
          
          if (testResult.passed) {
            state.logs.push("[Tester] All validation checks passed!");
            
            // AUTO-INSTALL PACKAGES & START DEV SERVER
            const { ENV_CONFIG } = await import("@shared/environment");
            
            state.logs.push(`[DEBUG] ENV_CONFIG.sandbox.available = ${ENV_CONFIG.sandbox.available}`);
            
            if (!ENV_CONFIG.sandbox.available) {
              state.logs.push("[Orchestrator] Dev server auto-start unavailable (requires Docker/local environment)");
              state.logs.push("[Orchestrator] Application ready - start dev server manually in Terminal");
            } else {
              state.logs.push("[DEBUG] Entering package installation block");
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

}
