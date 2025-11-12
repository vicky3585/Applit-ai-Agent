import { Activity, CheckCircle2, Circle, Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

interface AgentNode {
  id: string;
  name: string;
  status: "pending" | "active" | "completed" | "error";
}

interface Checkpoint {
  id: string;
  timestamp: Date;
  description: string;
  filesChanged: number;
}

interface AgentStatePanelProps {
  nodes?: AgentNode[];
  checkpoints?: Checkpoint[];
  currentIteration?: number;
  maxIterations?: number;
}

export default function AgentStatePanel({
  nodes = [],
  checkpoints = [],
  currentIteration = 0,
  maxIterations = 5,
}: AgentStatePanelProps) {
  const getNodeIcon = (status: AgentNode["status"]) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case "active":
        return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
      case "error":
        return <Circle className="w-4 h-4 text-destructive" />;
      default:
        return <Circle className="w-4 h-4 text-muted-foreground" />;
    }
  };

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="h-10 border-b flex items-center px-4">
        <Activity className="w-4 h-4 mr-2 text-primary" />
        <span className="text-sm font-medium">Agent State</span>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
          {/* Progress */}
          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-muted-foreground">Iteration</span>
              <span className="font-medium">{currentIteration} / {maxIterations}</span>
            </div>
            <Progress value={(currentIteration / maxIterations) * 100} />
          </div>

          {/* Agent Workflow */}
          <div>
            <h3 className="text-sm font-medium mb-3">Workflow</h3>
            <div className="space-y-2">
              {nodes.map((node, index) => (
                <div key={node.id}>
                  <div
                    className={`
                      flex items-center gap-3 p-3 rounded-lg border
                      ${node.status === "active" ? "bg-accent border-primary" : ""}
                    `}
                    data-testid={`node-${node.id}`}
                  >
                    {getNodeIcon(node.status)}
                    <span className="text-sm flex-1">{node.name}</span>
                    {node.status === "completed" && (
                      <Badge variant="secondary" className="text-xs">Done</Badge>
                    )}
                    {node.status === "active" && (
                      <Badge className="text-xs bg-blue-500/10 text-blue-600 dark:text-blue-400">
                        Running
                      </Badge>
                    )}
                  </div>
                  {index < nodes.length - 1 && (
                    <div className="w-px h-4 bg-border ml-5" />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Checkpoints */}
          <div>
            <h3 className="text-sm font-medium mb-3">Checkpoints</h3>
            <div className="space-y-2">
              {checkpoints.map((checkpoint) => (
                <div
                  key={checkpoint.id}
                  className="p-3 rounded-lg border bg-card hover-elevate"
                  data-testid={`checkpoint-${checkpoint.id}`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <p className="text-sm font-medium">{checkpoint.description}</p>
                    <Badge variant="secondary" className="text-xs">
                      {checkpoint.filesChanged} files
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {checkpoint.timestamp.toLocaleTimeString()}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
