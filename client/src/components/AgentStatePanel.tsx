import { Activity, CheckCircle2, Circle, Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AgentStep } from "@shared/schema";

interface AgentStatePanelProps {
  agentStatus?: AgentStep; // ✅ Accept current agent status
}

export default function AgentStatePanel({
  agentStatus = "idle",
}: AgentStatePanelProps) {
  // ✅ Map agentStatus to display data (minimal fix for Task 3.7)
  const statusColors: Record<AgentStep, string> = {
    idle: "bg-muted text-muted-foreground",
    planning: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    coding: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
    testing: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
    fixing: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
    complete: "bg-green-500/10 text-green-600 dark:text-green-400",
    failed: "bg-destructive/10 text-destructive",
  };
  
  const getNodeIcon = (status: AgentStep) => {
    if (status === "complete") return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    if (status === "failed") return <Circle className="w-4 h-4 text-destructive" />;
    if (status === "idle") return <Circle className="w-4 h-4 text-muted-foreground" />;
    return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
  };

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="h-10 border-b flex items-center px-4">
        <Activity className="w-4 h-4 mr-2 text-primary" />
        <span className="text-sm font-medium">Agent State</span>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
          {/* Current Status */}
          <div className="p-4 rounded-lg border bg-card">
            <div className="flex items-center gap-3">
              {getNodeIcon(agentStatus)}
              <div className="flex-1">
                <div className="text-sm font-medium">Current Status</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {agentStatus === "idle" ? "Ready to start" : 
                   agentStatus === "complete" ? "Workflow completed" :
                   agentStatus === "failed" ? "Workflow failed" :
                   `${agentStatus.charAt(0).toUpperCase() + agentStatus.slice(1)}...`}
                </div>
              </div>
              <Badge className={statusColors[agentStatus]} data-testid="badge-status">
                {agentStatus.charAt(0).toUpperCase() + agentStatus.slice(1)}
              </Badge>
            </div>
          </div>

          {/* Placeholder for future workflow insights */}
          <div className="text-center py-8 text-sm text-muted-foreground">
            <p>Detailed workflow history will appear here</p>
            <p className="text-xs mt-2">(Coming in Phase 3 completion)</p>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
