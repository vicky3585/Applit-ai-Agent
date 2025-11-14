import { useEffect } from "react";
import { useLocation } from "wouter";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

/**
 * Hook to subscribe to workspace lifecycle events (created/updated/deleted)
 * and handle automatic cache invalidation and navigation.
 * 
 * This provides real-time updates when workspaces are modified in other tabs
 * or by other users, preventing stale data and invalid routes.
 */
export function useWorkspaceEvents(currentWorkspaceId?: string) {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    // Connect to WebSocket (reuse existing WebSocketClient if available)
    // For now, we'll listen on the global window for workspace events
    // This will be enhanced when WebSocketClient is updated to support global events
    
    const handleWorkspaceEvent = (event: MessageEvent) => {
      try {
        const message = JSON.parse(event.data);
        
        if (message.type === "workspace.deleted") {
          const { workspaceId, workspaceName } = message.payload;
          
          // Invalidate workspace list cache
          queryClient.invalidateQueries({ queryKey: ["/api/workspaces"] });
          
          // If this is the current workspace, redirect to dashboard
          if (currentWorkspaceId === workspaceId) {
            toast({
              title: "Workspace deleted",
              description: `"${workspaceName}" has been deleted. Redirecting to dashboard...`,
              variant: "destructive",
            });
            
            setTimeout(() => {
              navigate("/dashboard");
            }, 1500);
          } else {
            // Just show a notification
            toast({
              title: "Workspace deleted",
              description: `"${workspaceName}" has been deleted.`,
            });
          }
        }
      } catch (error) {
        console.error("[WorkspaceEvents] Error handling event:", error);
      }
    };

    // Listen for workspace events from WebSocket
    // Note: This requires the WebSocketClient to be updated to emit events globally
    // For now, this is a placeholder that will work once WebSocket integration is complete
    window.addEventListener("workspace-event", handleWorkspaceEvent as any);

    return () => {
      window.removeEventListener("workspace-event", handleWorkspaceEvent as any);
    };
  }, [currentWorkspaceId, navigate, toast]);
}
