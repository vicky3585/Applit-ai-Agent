import { Loader2, CheckCircle2, XCircle, ChevronDown, ChevronRight, FileCode, Download, Filter } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { AgentWorkflowState, AgentStep, LogLevel, LogPhase, type LogEntry as LogEntryType } from "@shared/schema";
import { useState, useMemo } from "react";
import { LogPhaseGroup } from "./LogPhaseGroup";
import { useToast } from "@/hooks/use-toast";

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
  const [filterLevel, setFilterLevel] = useState<LogLevel | "all">("all");
  const [filterPhase, setFilterPhase] = useState<LogPhase | "all">("all");
  const [searchKeyword, setSearchKeyword] = useState("");
  const { toast } = useToast();

  const { status, current_step, progress, logs, structuredLogs, files_generated, errors, attempt_count, last_failed_step } = workflowState;

  const isProcessing = status === "processing";
  const isComplete = status === "complete";
  const isFailed = status === "failed";

  // Show most recent 10 logs (legacy)
  const recentLogs = logs.slice(-10);

  // Filter and group structured logs by phase
  const filteredStructuredLogs = useMemo(() => {
    if (!structuredLogs || structuredLogs.length === 0) return [];

    return structuredLogs.filter((log: LogEntryType) => {
      // Filter by level
      if (filterLevel !== "all" && log.level !== filterLevel) return false;
      
      // Filter by phase
      if (filterPhase !== "all" && log.phase !== filterPhase) return false;
      
      // Filter by keyword
      if (searchKeyword && !log.message.toLowerCase().includes(searchKeyword.toLowerCase())) {
        return false;
      }
      
      return true;
    });
  }, [structuredLogs, filterLevel, filterPhase, searchKeyword]);

  // Group logs by phase
  const logsByPhase = useMemo(() => {
    const grouped = new Map<LogPhase, LogEntryType[]>();
    
    filteredStructuredLogs.forEach((log: LogEntryType) => {
      const existing = grouped.get(log.phase) || [];
      grouped.set(log.phase, [...existing, log]);
    });
    
    return grouped;
  }, [filteredStructuredLogs]);

  // Export logs as JSON
  const handleExportLogs = () => {
    const data = JSON.stringify(filteredStructuredLogs, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `agent-logs-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    toast({
      title: "Logs Exported",
      description: `Exported ${filteredStructuredLogs.length} log entries`,
    });
  };

  // Define workflow steps in order (only show main workflow steps in timeline)
  const workflowSteps: AgentStep[] = ["planning", "coding", "testing", "complete"];
  
  // Normalize errors to strings safely
  const normalizeErrors = (errs: any[]): string[] => {
    return errs.map(err => {
      if (typeof err === "string") return err;
      if (typeof err === "object" && err !== null) {
        if ("message" in err) return String(err.message);
        return JSON.stringify(err);
      }
      return String(err);
    });
  };
  
  // Check if this execution ever failed (uses durable last_failed_step indicator)
  const hasEverFailed = status === "failed" || last_failed_step !== null && last_failed_step !== undefined;
  
  // Determine which timeline step corresponds to failure
  const getFailedTimelineStep = (): AgentStep => {
    // Priority 1: Use persisted last_failed_step (most reliable, survives retries)
    if (last_failed_step && ["planning", "coding", "testing"].includes(last_failed_step)) {
      return last_failed_step as AgentStep;
    }
    
    // Priority 2: Use current_step if it's a valid timeline step
    if (current_step === "planning" || current_step === "coding" || current_step === "testing") {
      return current_step;
    }
    
    // Priority 3: Map special states to timeline steps
    if (current_step === "fixing") {
      return "testing"; // Fixing happens after testing fails
    }
    
    // Fallback: Assume planning if we can't determine
    return "planning";
  };
  
  // Determine step status (completed, current, pending, failed)
  const getStepStatus = (step: AgentStep): "completed" | "current" | "pending" | "failed" => {
    // Handle complete state - all steps completed
    if (isComplete) {
      return "completed";
    }
    
    // Handle failed state (including idle after failure)
    if (isFailed || (status === "idle" && hasEverFailed)) {
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
    
    // Default: all pending (fresh idle with no history)
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

      {/* Logs (collapsible) - Phase 2: Structured Logs with Filtering */}
      {(filteredStructuredLogs.length > 0 || recentLogs.length > 0) && (
        <Collapsible open={logsExpanded} onOpenChange={setLogsExpanded}>
          <div className="flex items-center justify-between">
            <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium hover-elevate active-elevate-2 rounded-md px-2 py-1" data-testid="button-toggle-logs">
              {logsExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              <span>
                Activity Logs ({filteredStructuredLogs.length > 0 ? filteredStructuredLogs.length : recentLogs.length})
              </span>
            </CollapsibleTrigger>
            
            {filteredStructuredLogs.length > 0 && (
              <Button
                size="sm"
                variant="ghost"
                onClick={handleExportLogs}
                className="gap-1"
                data-testid="button-export-logs"
              >
                <Download className="w-3 h-3" />
                Export
              </Button>
            )}
          </div>
          
          <CollapsibleContent className="mt-2 space-y-2">
            {/* Structured Logs (Phase 2) */}
            {filteredStructuredLogs.length > 0 ? (
              <>
                {/* Filter Controls */}
                <div className="flex flex-wrap gap-2 p-2 bg-muted/30 rounded-md">
                  <select
                    value={filterLevel}
                    onChange={(e) => setFilterLevel(e.target.value as LogLevel | "all")}
                    className="text-xs px-2 py-1 rounded border bg-background"
                    data-testid="select-filter-level"
                  >
                    <option value="all">All Levels</option>
                    <option value="info">Info</option>
                    <option value="success">Success</option>
                    <option value="warn">Warning</option>
                    <option value="error">Error</option>
                    <option value="debug">Debug</option>
                  </select>
                  
                  <select
                    value={filterPhase}
                    onChange={(e) => setFilterPhase(e.target.value as LogPhase | "all")}
                    className="text-xs px-2 py-1 rounded border bg-background"
                    data-testid="select-filter-phase"
                  >
                    <option value="all">All Phases</option>
                    <option value="system">System</option>
                    <option value="planning">Planning</option>
                    <option value="coding">Coding</option>
                    <option value="testing">Testing</option>
                    <option value="fixing">Fixing</option>
                    <option value="package_install">Package Install</option>
                    <option value="command_execution">Command Execution</option>
                    <option value="dev_server">Dev Server</option>
                    <option value="complete">Complete</option>
                  </select>
                  
                  <input
                    type="text"
                    placeholder="Search logs..."
                    value={searchKeyword}
                    onChange={(e) => setSearchKeyword(e.target.value)}
                    className="text-xs px-2 py-1 rounded border bg-background flex-1 min-w-32"
                    data-testid="input-search-logs"
                  />
                </div>

                {/* Grouped Logs by Phase */}
                <ScrollArea className="max-h-96 rounded-md border bg-muted/10 p-2">
                  <div className="space-y-2">
                    {Array.from(logsByPhase.entries()).map(([phase, phaseLogs]) => (
                      <LogPhaseGroup
                        key={phase}
                        phase={phase}
                        logs={phaseLogs}
                        defaultExpanded={phase === current_step || phaseLogs.some(log => log.level === "error")}
                      />
                    ))}
                  </div>
                </ScrollArea>
              </>
            ) : (
              /* Legacy Logs Fallback */
              <ScrollArea className="h-32 rounded-md border bg-muted/30 p-2">
                <div className="space-y-1 text-xs font-mono">
                  {recentLogs.map((log, idx) => (
                    <div key={idx} className="text-foreground/80" data-testid={`log-entry-${idx}`}>
                      {log}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
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
                {normalizeErrors(errors).map((error, idx) => (
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
