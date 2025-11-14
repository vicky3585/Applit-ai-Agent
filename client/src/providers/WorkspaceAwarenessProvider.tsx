import { createContext, useContext, useRef, useEffect, useState, useCallback, ReactNode } from "react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { Awareness } from "y-protocols/awareness";

/**
 * Workspace-level user presence data
 */
export interface WorkspaceUserPresence {
  userId: string;
  name: string;
  color: string;
  activeFile: string | null; // File ID for internal tracking
  activeFileName: string | null; // Human-readable filename for display
  connected: boolean;
  lastUpdate: number;
}

interface WorkspaceAwarenessContextValue {
  awareness: Awareness | null;
  users: WorkspaceUserPresence[]; // Array keyed by userId, not Map by clientId
  setLocalPresence: (data: Partial<WorkspaceUserPresence>) => void;
  clearLocalPresence: () => void;
}

const WorkspaceAwarenessContext = createContext<WorkspaceAwarenessContextValue | null>(null);

/**
 * Workspace-level awareness provider.
 * Creates a single Y.Doc and awareness instance for the entire workspace,
 * separate from per-file document awareness.
 * 
 * Task 7.9: User List Panel - Workspace-scoped awareness manager
 * 
 * Architecture:
 * - Single workspace-level Y.Doc for presence tracking only
 * - Each user broadcasts their current activeFile, name, color, etc.
 * - Decoupled from per-file Y.Docs used for collaborative editing
 * - Proper cleanup on unmount and disconnect
 */
export function WorkspaceAwarenessProvider({ 
  workspaceId,
  userId,
  username,
  children 
}: { 
  workspaceId: string;
  userId: string;
  username: string;
  children: ReactNode;
}) {
  const ydocRef = useRef<Y.Doc | null>(null);
  const providerRef = useRef<WebsocketProvider | null>(null);
  const [awareness, setAwareness] = useState<Awareness | null>(null); // State instead of ref for re-renders
  const [users, setUsers] = useState<WorkspaceUserPresence[]>([]); // Array keyed by userId
  const mountedRef = useRef(true);

  // Initialize workspace-level awareness
  useEffect(() => {
    mountedRef.current = true;

    // Create workspace-level Y.Doc (separate from file docs)
    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;

    // Construct WebSocket URL for workspace presence
    // Use window.location.host (includes port) for proper WebSocket connection
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host; // Includes port (e.g., "localhost:5000")
    const baseUrl = `${protocol}//${host}`;
    const roomname = `yjs/${workspaceId}/workspace-presence`;

    // Create WebSocket provider for workspace presence
    const provider = new WebsocketProvider(
      baseUrl,
      roomname,
      ydoc,
      {
        params: {
          userId,
          username,
        },
      }
    );
    providerRef.current = provider;
    setAwareness(provider.awareness); // Set in state for re-renders

    // Set initial local presence
    provider.awareness.setLocalStateField("user", {
      userId,
      name: username,
      color: getUserColor(userId),
      activeFile: null,
      activeFileName: null,
      connected: true,
      lastUpdate: Date.now(),
    });

    // Listen for awareness changes from all users
    const handleAwarenessUpdate = () => {
      if (!mountedRef.current) return;

      const states = provider.awareness.getStates();
      const usersMap = new Map<string, WorkspaceUserPresence>(); // Key by userId, not clientId

      states.forEach((state: any) => {
        if (state.user && state.user.userId) {
          // Use userId as key for stable identity across reconnects
          usersMap.set(state.user.userId, {
            ...state.user,
            connected: true,
          });
        }
      });

      // Convert Map to Array for consumers
      setUsers(Array.from(usersMap.values()));
    };

    provider.awareness.on("change", handleAwarenessUpdate);

    // Listen for connection status changes
    const handleStatusChange = ({ status }: { status: string }) => {
      if (!mountedRef.current) return;
      
      // Update local presence connection status
      const awareness = provider.awareness;
      const currentState = awareness.getLocalState();
      if (currentState?.user) {
        awareness.setLocalStateField("user", {
          ...currentState.user,
          connected: status === "connected",
          lastUpdate: Date.now(),
        });
      }
      
      // Mark disconnected peers as disconnected
      if (status === "disconnected") {
        handleAwarenessUpdate();
      }
    };

    provider.on("status", handleStatusChange);

    // Initial update
    handleAwarenessUpdate();

    // Cleanup
    return () => {
      mountedRef.current = false;
      
      // Remove listeners
      provider.awareness.off("change", handleAwarenessUpdate);
      provider.off("status", handleStatusChange);
      
      // Clear local presence before destroying
      if (provider.awareness) {
        provider.awareness.setLocalState(null);
      }

      // Destroy provider and doc
      provider.destroy();
      ydoc.destroy();
      
      ydocRef.current = null;
      providerRef.current = null;
      setAwareness(null);
    };
  }, [workspaceId, userId, username]);

  /**
   * Update local user's presence data (e.g., activeFile when switching tabs)
   */
  const setLocalPresence = useCallback((data: Partial<WorkspaceUserPresence>) => {
    const provider = providerRef.current;
    if (!provider || !mountedRef.current) return;

    const currentState = provider.awareness.getLocalState();
    const currentUser = currentState?.user || {};

    provider.awareness.setLocalStateField("user", {
      ...currentUser,
      ...data,
      lastUpdate: Date.now(),
    });
  }, []);

  /**
   * Clear local user's presence (e.g., on logout or disconnect)
   */
  const clearLocalPresence = useCallback(() => {
    const provider = providerRef.current;
    if (!provider || !mountedRef.current) return;

    provider.awareness.setLocalState(null);
  }, []);

  const value: WorkspaceAwarenessContextValue = {
    awareness, // Use state, not ref
    users,
    setLocalPresence,
    clearLocalPresence,
  };

  return (
    <WorkspaceAwarenessContext.Provider value={value}>
      {children}
    </WorkspaceAwarenessContext.Provider>
  );
}

/**
 * Hook to access workspace-level awareness
 */
export function useWorkspaceAwareness() {
  const context = useContext(WorkspaceAwarenessContext);
  
  if (!context) {
    throw new Error("useWorkspaceAwareness must be used within WorkspaceAwarenessProvider");
  }
  
  return context;
}

/**
 * Generate consistent color for a user ID
 */
function getUserColor(userId: string): string {
  const colors = [
    "#FF6B6B", "#4ECDC4", "#45B7D1", "#FFA07A",
    "#98D8C8", "#F7DC6F", "#BB8FCE", "#85C1E2"
  ];

  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }

  return colors[Math.abs(hash) % colors.length];
}
