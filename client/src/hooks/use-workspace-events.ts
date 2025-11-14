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
export function useWorkspaceEvents(userId: string = "user1") {
  const [location, navigate] = useLocation();
  const { toast } = useToast();
  
  // Extract current workspace ID from route (if on IDE page)
  const currentWorkspaceId = location.startsWith("/ide/") 
    ? location.split("/ide/")[1] 
    : undefined;

  useEffect(() => {
    // Only connect if on IDE page (workspace-specific events)
    // For V1, we only subscribe when actively viewing a workspace
    // TODO: For multi-tab support, consider connecting from dashboard too
    if (!currentWorkspaceId) {
      return;
    }
    
    // Connect to WebSocket for real-time workspace events
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl);
    } catch (error) {
      console.error("[WorkspaceEvents] Failed to create WebSocket:", error);
      return;
    }
    
    ws.onopen = () => {
      console.log("[WorkspaceEvents] WebSocket connected for workspace:", currentWorkspaceId);
      
      // Join workspace to receive events
      ws.send(JSON.stringify({
        type: "join",
        workspaceId: currentWorkspaceId,
        userId: userId,
      }));
    };
    
    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        
        if (message.type === "workspace.deleted") {
          const { workspaceId, workspaceName } = message.payload;
          
          console.log(`[WorkspaceEvents] Workspace deleted: ${workspaceId}`);
          
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
        console.error("[WorkspaceEvents] Error handling message:", error);
      }
    };
    
    ws.onerror = (error) => {
      console.error("[WorkspaceEvents] WebSocket error:", error);
    };
    
    ws.onclose = () => {
      console.log("[WorkspaceEvents] WebSocket disconnected");
    };

    return () => {
      console.log("[WorkspaceEvents] Cleaning up WebSocket connection");
      ws.close();
    };
  }, [currentWorkspaceId, userId, navigate, toast, location]);
}
