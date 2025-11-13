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
