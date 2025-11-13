import type OpenAI from "openai";
import type { File, WorkspaceSettings } from "@shared/schema";

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
