import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Play, Loader2, CheckCircle2, XCircle, Terminal as TerminalIcon, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface CodeExecutionPanelProps {
  workspaceId: string;
  selectedFileId?: string | null;
  onExecutionStart?: () => void;
  onExecutionComplete?: (success: boolean) => void;
}

export function CodeExecutionPanel({
  workspaceId,
  selectedFileId,
  onExecutionStart,
  onExecutionComplete,
}: CodeExecutionPanelProps) {
  const [currentExecutionId, setCurrentExecutionId] = useState<string | null>(null);
  const [executionOutput, setExecutionOutput] = useState<string>("");
  const [isExecuting, setIsExecuting] = useState(false);
  const outputEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);

  // Fetch execution history
  const { data: executions = [] } = useQuery<any[]>({
    queryKey: ["/api/workspaces", workspaceId, "executions"],
    enabled: !!workspaceId,
  });

  // Fetch current execution details
  const { data: currentExecution } = useQuery<any>({
    queryKey: ["/api/workspaces", workspaceId, "executions", currentExecutionId],
    enabled: !!currentExecutionId,
    refetchInterval: (query) => {
      // Stop polling if execution is complete or failed
      const data = query.state.data;
      if (data?.status === "completed" || data?.status === "failed") {
        return false;
      }
      return 1000; // Poll every second while running
    },
  });

  // Execute file mutation
  const executeMutation = useMutation({
    mutationFn: async (fileId: string) => {
      return apiRequest("POST", `/api/workspaces/${workspaceId}/files/${fileId}/execute`);
    },
    onSuccess: (data: any) => {
      setCurrentExecutionId(data.executionId);
      setExecutionOutput("");
      setIsExecuting(true);
      onExecutionStart?.();
      
      // Invalidate execution history
      queryClient.invalidateQueries({
        queryKey: ["/api/workspaces", workspaceId, "executions"],
      });
    },
    onError: (error: any) => {
      toast({
        title: "Execution Failed",
        description: error.message || "Could not start execution",
        variant: "destructive",
      });
      setIsExecuting(false);
    },
  });

  // WebSocket connection for streaming output (one per workspace)
  useEffect(() => {
    if (!workspaceId) return;

    // Close existing connection if any
    if (wsRef.current) {
      wsRef.current.close();
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      // Join workspace to start receiving messages
      ws.send(JSON.stringify({ type: "join", workspaceId }));
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        
        if (message.type === "execution_output") {
          // Check current execution ID and append if it matches
          setCurrentExecutionId((currentId) => {
            if (message.data.executionId === currentId) {
              setExecutionOutput((prev) => prev + message.data.chunk);
            }
            return currentId;
          });
        } else if (message.type === "execution_completed") {
          setCurrentExecutionId((currentId) => {
            if (message.data.id === currentId) {
              setIsExecuting(false);
              onExecutionComplete?.(true);
              
              queryClient.invalidateQueries({
                queryKey: ["/api/workspaces", workspaceId, "executions", currentId],
              });
              queryClient.invalidateQueries({
                queryKey: ["/api/workspaces", workspaceId, "executions"],
              });
              
              toast({
                title: "Execution Complete",
                description: `Exit code: ${message.data.exitCode || 0}`,
              });
            }
            return currentId;
          });
        } else if (message.type === "execution_failed") {
          setCurrentExecutionId((currentId) => {
            if (message.data.id === currentId) {
              setIsExecuting(false);
              onExecutionComplete?.(false);
              
              queryClient.invalidateQueries({
                queryKey: ["/api/workspaces", workspaceId, "executions", currentId],
              });
              queryClient.invalidateQueries({
                queryKey: ["/api/workspaces", workspaceId, "executions"],
              });
              
              toast({
                title: "Execution Failed",
                description: message.data.error || "Unknown error",
                variant: "destructive",
              });
            }
            return currentId;
          });
        }
      } catch (error) {
        console.error("Failed to parse WebSocket message:", error);
      }
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [workspaceId, queryClient, toast, onExecutionComplete]);

  // Auto-scroll to bottom when output changes
  useEffect(() => {
    if (outputEndRef.current) {
      outputEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [executionOutput, currentExecution?.output]);

  const handleRun = () => {
    if (!selectedFileId) {
      toast({
        title: "No File Selected",
        description: "Please select a file to execute",
        variant: "destructive",
      });
      return;
    }

    executeMutation.mutate(selectedFileId);
  };

  const handleClearOutput = () => {
    setExecutionOutput("");
    // Keep currentExecutionId to preserve status indicators
  };

  // Determine execution status
  const getStatusBadge = () => {
    // Guard: If no execution data yet, show running badge if executing, otherwise nothing
    if (!currentExecution) {
      return isExecuting ? (
        <Badge className="bg-blue-500 text-white" data-testid="badge-execution-running">
          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
          Running
        </Badge>
      ) : null;
    }
    
    if (isExecuting) {
      return (
        <Badge className="bg-blue-500 text-white" data-testid="badge-execution-running">
          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
          Running
        </Badge>
      );
    }
    
    if (currentExecution.status === "completed") {
      const exitCode = currentExecution.exitCode ? parseInt(currentExecution.exitCode) : 0;
      return exitCode === 0 ? (
        <Badge className="bg-green-600 text-white" data-testid="badge-execution-success">
          <CheckCircle2 className="w-3 h-3 mr-1" />
          Success
        </Badge>
      ) : (
        <Badge className="bg-orange-600 text-white" data-testid="badge-execution-error">
          <XCircle className="w-3 h-3 mr-1" />
          Exit {exitCode}
        </Badge>
      );
    }
    
    if (currentExecution.status === "failed") {
      return (
        <Badge className="bg-red-600 text-white" data-testid="badge-execution-failed">
          <XCircle className="w-3 h-3 mr-1" />
          Failed
        </Badge>
      );
    }

    return null;
  };

  // Get combined output (streaming + stored)
  const displayOutput = executionOutput || currentExecution?.output || "";
  const hasOutput = displayOutput.length > 0;
  const hasError = currentExecution?.error;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="h-10 border-b flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <TerminalIcon className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">Code Execution</span>
        </div>
        <div className="flex items-center gap-2">
          {getStatusBadge()}
          <Button
            size="icon"
            variant="ghost"
            className="w-7 h-7"
            onClick={handleClearOutput}
            disabled={!hasOutput}
            data-testid="button-clear-execution-output"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Run button section */}
        <div className="p-4 border-b bg-muted/30">
          <Button
            onClick={handleRun}
            disabled={!selectedFileId || isExecuting || executeMutation.isPending}
            className="w-full"
            data-testid="button-run-code"
          >
            {isExecuting || executeMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Running...
              </>
            ) : (
              <>
                <Play className="w-4 h-4 mr-2" />
                Run Selected File
              </>
            )}
          </Button>
        </div>

        {/* Output display */}
        <ScrollArea className="flex-1">
          <div className="p-4">
            {!hasOutput && !hasError && (
              <div className="flex items-center justify-center h-32 text-muted-foreground">
                <p className="text-sm">No output yet. Run a file to see results.</p>
              </div>
            )}

            {hasError && (
              <Alert variant="destructive" className="mb-4" data-testid="alert-execution-error">
                <XCircle className="w-4 h-4" />
                <AlertDescription>
                  <p className="font-semibold">Execution Error</p>
                  <p className="text-sm mt-1">{currentExecution.error}</p>
                </AlertDescription>
              </Alert>
            )}

            {hasOutput && (
              <div 
                className="font-mono text-xs whitespace-pre-wrap bg-muted/30 p-3 rounded-md"
                data-testid="text-execution-output"
              >
                {displayOutput}
              </div>
            )}
            
            {/* Scroll anchor for auto-scroll */}
            <div ref={outputEndRef} />
          </div>
        </ScrollArea>

        {/* Execution history */}
        {executions.length > 0 && (
          <div className="border-t bg-muted/30 p-2">
            <div className="text-xs text-muted-foreground mb-2 px-2">Recent Executions</div>
            <ScrollArea className="max-h-24">
              <div className="space-y-1">
                {executions.slice(0, 5).map((exec: any) => (
                  <button
                    key={exec.id}
                    onClick={() => {
                      setCurrentExecutionId(exec.id);
                      setExecutionOutput("");
                    }}
                    className={`w-full text-left p-2 rounded-md text-xs hover-elevate ${
                      exec.id === currentExecutionId ? "bg-accent" : ""
                    }`}
                    data-testid={`button-execution-history-${exec.id}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono truncate flex-1">{exec.filePath}</span>
                      <Badge 
                        className={`text-xs ${
                          exec.status === "completed" 
                            ? "bg-green-600 text-white" 
                            : exec.status === "failed"
                            ? "bg-red-600 text-white"
                            : "bg-blue-500 text-white"
                        }`}
                      >
                        {exec.status}
                      </Badge>
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}
      </div>
    </div>
  );
}
