import { Loader2, CheckCircle2, XCircle, ChevronDown, ChevronRight, FileCode } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AgentWorkflowState, AgentStep } from "@shared/schema";
import { useState } from "react";

interface AgentWorkflowCardProps {
  workflowState: AgentWorkflowState;
  onFileClick?: (path: string) => void;
}

const stepLabels: Record<AgentStep, string> = {
  idle: "Idle",
  planning: "Planning",
  coding: "Writing Code",
  testing: "Testing",
  fixing: "Fixing Issues",
  complete: "Complete",
  failed: "Failed",
};

const stepColors: Record<AgentStep, string> = {
  idle: "bg-muted text-muted-foreground",
  planning: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  coding: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  testing: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
  fixing: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  complete: "bg-green-500/10 text-green-600 dark:text-green-400",
  failed: "bg-destructive/10 text-destructive",
};

export default function AgentWorkflowCard({ workflowState, onFileClick }: AgentWorkflowCardProps) {
  const [logsExpanded, setLogsExpanded] = useState(true);
  const [errorsExpanded, setErrorsExpanded] = useState(true);

  const { status, current_step, progress, logs, files_generated, errors, attempt_count } = workflowState;

  const isProcessing = status === "processing";
  const isComplete = status === "complete";
  const isFailed = status === "failed";

  // Show most recent 10 logs
  const recentLogs = logs.slice(-10);

  // Define workflow steps in order (only show main workflow steps in timeline)
  const workflowSteps: AgentStep[] = ["planning", "coding", "testing", "complete"];
  
  // Determine which timeline step corresponds to failure
  const getFailedTimelineStep = (): AgentStep => {
    // Use logs to determine where failure occurred
    const logText = logs.join(" ").toLowerCase();
    
    if (logText.includes("[tester") || logText.includes("testing") || current_step === "fixing") {
      return "testing";
    }
    if (logText.includes("[coder") || logText.includes("coding")) {
      return "coding";
    }
    if (logText.includes("[planner") || logText.includes("planning")) {
      return "planning";
    }
    
    // Default to last known step if we can't determine from logs
    if (current_step === "planning" || current_step === "coding" || current_step === "testing") {
      return current_step;
    }
    
    // Fallback to planning if unknown
    return "planning";
  };
  
  // Determine step status (completed, current, pending, failed)
  const getStepStatus = (step: AgentStep): "completed" | "current" | "pending" | "failed" => {
    // Handle complete state - all steps completed
    if (isComplete) {
      return "completed";
    }
    
    // Handle failed state
    if (isFailed) {
      const failedStep = getFailedTimelineStep();
      const failedIndex = workflowSteps.indexOf(failedStep);
      const stepIndex = workflowSteps.indexOf(step);
      
      if (stepIndex < failedIndex) return "completed";
      if (stepIndex === failedIndex) return "failed";
      return "pending";
    }
    
    // Handle processing state
    if (isProcessing) {
      // Map special states to timeline steps
      let currentTimelineStep = current_step;
      if (current_step === "fixing") currentTimelineStep = "testing";
      if (current_step === "idle") return "pending"; // Not started yet
      
      const currentIndex = workflowSteps.indexOf(currentTimelineStep);
      const stepIndex = workflowSteps.indexOf(step);
      
      // Handle edge case where current step is not in timeline
      if (currentIndex === -1) {
        return "pending";
      }
      
      if (stepIndex < currentIndex) return "completed";
      if (stepIndex === currentIndex) return "current";
      return "pending";
    }
    
    // Default: all pending
    return "pending";
  };

  return (
    <Card className="p-4 space-y-3" data-testid="card-agent-workflow">
      {/* Header with status icon and current step */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {isProcessing && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
          {isComplete && <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />}
          {isFailed && <XCircle className="w-4 h-4 text-destructive" />}
          <span className="text-sm font-medium">AI Agent Workflow</span>
        </div>
        <Badge variant="secondary" className={stepColors[current_step]} data-testid="badge-agent-step">
          {stepLabels[current_step]}
        </Badge>
      </div>

      {/* 🎯 PROGRESS TIMELINE - Phase 1 Feature */}
      <div className="flex items-center justify-between gap-2 py-2" data-testid="progress-timeline">
        {workflowSteps.map((step, index) => {
          const stepStatus = getStepStatus(step);
          const isLast = index === workflowSteps.length - 1;
          
          return (
            <div key={step} className="flex items-center flex-1">
              {/* Step indicator */}
              <div className="flex flex-col items-center gap-1">
                <div
                  className={`
                    w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium
                    ${stepStatus === "completed" ? "bg-green-500/20 text-green-600 dark:text-green-400" : ""}
                    ${stepStatus === "current" ? "bg-primary/20 text-primary animate-pulse" : ""}
                    ${stepStatus === "pending" ? "bg-muted text-muted-foreground" : ""}
                    ${stepStatus === "failed" ? "bg-destructive/20 text-destructive" : ""}
                  `}
                  data-testid={`step-indicator-${step}`}
                >
                  {stepStatus === "completed" && "✓"}
                  {stepStatus === "current" && <Loader2 className="w-3 h-3 animate-spin" />}
                  {stepStatus === "pending" && index + 1}
                  {stepStatus === "failed" && "✗"}
                </div>
                <span className="text-[10px] text-center text-muted-foreground">
                  {stepLabels[step]}
                </span>
              </div>
              
              {/* Connector line */}
              {!isLast && (
                <div
                  className={`
                    flex-1 h-0.5 mx-1
                    ${stepStatus === "completed" ? "bg-green-500/40" : "bg-muted"}
                  `}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Progress bar */}
      {isProcessing && (
        <div className="space-y-1" data-testid="progress-container">
          <Progress value={progress * 100} className="h-2" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{Math.round(progress * 100)}% complete</span>
            {attempt_count !== undefined && attempt_count > 0 && (
              <span>Attempt {attempt_count + 1}/3</span>
            )}
          </div>
        </div>
      )}

      {/* Logs (collapsible) */}
      {recentLogs.length > 0 && (
        <Collapsible open={logsExpanded} onOpenChange={setLogsExpanded}>
          <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium hover-elevate active-elevate-2 w-full rounded-md px-2 py-1" data-testid="button-toggle-logs">
            {logsExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            <span>Activity Logs ({recentLogs.length})</span>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2">
            <ScrollArea className="h-32 rounded-md border bg-muted/30 p-2">
              <div className="space-y-1 text-xs font-mono">
                {recentLogs.map((log, idx) => (
                  <div key={idx} className="text-foreground/80" data-testid={`log-entry-${idx}`}>
                    {log}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Errors (collapsible) */}
      {errors.length > 0 && (
        <Collapsible open={errorsExpanded} onOpenChange={setErrorsExpanded}>
          <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium text-destructive hover-elevate active-elevate-2 w-full rounded-md px-2 py-1" data-testid="button-toggle-errors">
            {errorsExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            <span>Errors ({errors.length})</span>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2">
            <ScrollArea className="max-h-24 rounded-md border bg-destructive/5 p-2">
              <div className="space-y-1 text-xs font-mono text-destructive">
                {errors.map((error, idx) => (
                  <div key={idx} data-testid={`error-entry-${idx}`}>
                    {error}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Generated files */}
      {files_generated.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm font-medium">Generated Files ({files_generated.length})</div>
          <div className="flex flex-wrap gap-2">
            {files_generated.map((file, idx) => (
              <Badge
                key={idx}
                variant="outline"
                className="cursor-pointer hover-elevate active-elevate-2 gap-1"
                onClick={() => onFileClick?.(file.path)}
                data-testid={`file-badge-${idx}`}
              >
                <FileCode className="w-3 h-3" />
                {file.path.split("/").pop()}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Status message */}
      {isComplete && (
        <div className="text-sm text-green-600 dark:text-green-400" data-testid="text-complete-message">
          ✓ Generation complete! {files_generated.length} file{files_generated.length !== 1 ? "s" : ""} created.
        </div>
      )}
      {isFailed && (
        <div className="text-sm text-destructive" data-testid="text-failed-message">
          ✗ Generation failed. Check errors above for details.
        </div>
      )}
    </Card>
  );
}
