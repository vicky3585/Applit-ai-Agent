import OpenAI from "openai";
import type { IStorage } from "../storage";
import type { File, WorkspaceSettings } from "@shared/schema";
import { PlannerAgent } from "./planner";
import { CoderAgent } from "./coder";
import { TesterAgent } from "./tester";

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
  private maxAttempts: number = 3;

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

      while (state.attemptCount < this.maxAttempts && !codingSuccess) {
        state.attemptCount++;
        state.currentStep = "coding"; // Reset to coding at start of each attempt
        state.logs.push(`[Coder] Attempt ${state.attemptCount}/${this.maxAttempts}...`);
        state.progress = 0.3 + (state.attemptCount / this.maxAttempts) * 0.3;
        onStateUpdate({ ...state });

        try {
          const codeResult = await this.coderAgent.generateCode(context, plan, lastError);
          state.filesGenerated = codeResult.files;
          state.logs.push(`[Coder] Generated ${codeResult.files.length} file(s)`);
          codeResult.files.forEach((f: { path: string }) => {
            state.logs.push(`  - ${f.path}`);
          });
          
          // Save generated files to storage
          for (const file of codeResult.files) {
            await this.storage.createFile(
              context.workspaceId,
              file.path,
              file.content,
              file.language || "plaintext"
            );
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
            
            if (state.attemptCount < this.maxAttempts) {
              state.logs.push(`[Orchestrator] Retrying with fixes...`);
            } else {
              state.logs.push(`[Orchestrator] Max attempts (${this.maxAttempts}) reached`);
              state.errors.push(`Failed after ${this.maxAttempts} attempts: ${testResult.error}`);
            }
          }
        } catch (error: any) {
          lastError = error.message;
          state.logs.push(`[Coder] Error: ${error.message}`);
          
          if (state.attemptCount >= this.maxAttempts) {
            state.errors.push(`Code generation failed: ${error.message}`);
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
      state.errors.push(error.message);
      state.logs.push(`[Orchestrator] Fatal error: ${error.message}`);
      onStateUpdate({ ...state });
      return state;
    }
  }

  setMaxAttempts(max: number) {
    this.maxAttempts = max;
  }
}
