import OpenAI from "openai";
import type { IStorage } from "../storage";
import type { File, WorkspaceSettings } from "@shared/schema";
import { PlannerAgent } from "./planner";
import { CoderAgent } from "./coder";
import { TesterAgent } from "./tester";
import { getFilePersistence } from "../file-persistence";

export interface AgentWorkflowState {
  status: "idle" | "processing" | "complete" | "failed";
  currentStep: "planning" | "coding" | "testing" | "fixing" | "idle" | "complete";
  progress: number;
  logs: string[];
  filesGenerated: Array<{ path: string; content: string; language?: string }>;
  errors: string[];
  attemptCount: number;
  plan?: string;
  testResults?: any;
}

export interface AgentContext {
  workspaceId: string;
  prompt: string;
  existingFiles: File[];
  settings: WorkspaceSettings | null;
  openai: OpenAI;
}

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

      const plan = await this.plannerAgent.createPlan(context);
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
          const codeResult = await this.coderAgent.generateCode(context, plan, lastError);
          state.filesGenerated = codeResult.files;
          state.logs.push(`[Coder] Generated ${codeResult.files.length} file(s)`);
          codeResult.files.forEach((f: { path: string }) => {
            state.logs.push(`  - ${f.path}`);
          });
          
          // Save generated files to storage and disk
          const filePersistence = getFilePersistence();
          for (const file of codeResult.files) {
            await this.storage.createFile(
              context.workspaceId,
              file.path,
              file.content,
              file.language || "plaintext"
            );
            
            // Also save to disk for preview
            try {
              await filePersistence.saveFile(context.workspaceId, file.path, file.content);
            } catch (error: any) {
              state.logs.push(`[Warning] Could not save to disk: ${file.path}`);
            }
          }

          // Step 3: Testing
          state.currentStep = "testing";
          state.progress = 0.7;
          state.logs.push("[Tester] Running validation checks...");
          onStateUpdate({ ...state });

          const testResult = await this.testerAgent.validateCode(
            context,
            state.filesGenerated
          );
          state.testResults = testResult;

          if (testResult.passed) {
            state.logs.push("[Tester] All validation checks passed!");
            codingSuccess = true;
          } else {
            // Failed - prepare for retry
            state.currentStep = "fixing";
            state.logs.push(`[Tester] Validation failed: ${testResult.error}`);
            lastError = testResult.error;
            
            if (state.attemptCount < maxAttempts) {
              state.logs.push(`[Orchestrator] Retrying with fixes...`);
            } else {
              state.logs.push(`[Orchestrator] Max attempts (${maxAttempts}) reached`);
              state.errors.push(`Failed after ${maxAttempts} attempts: ${testResult.error}`);
            }
          }
        } catch (error: any) {
          lastError = error.message || "Unknown error occurred";
          state.logs.push(`[Coder] Error: ${lastError}`);
          
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
