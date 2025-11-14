import { createContext, useContext, useRef, useState, useCallback, useMemo, ReactNode } from "react";

/**
 * Presence state for a single user in a specific file
 */
export interface CollaboratorPresence {
  userId: string;
  name: string;
  color: string;
  activeFile?: string;
  cursor?: { anchor: number; head: number };
  connected: boolean;
}

/**
 * Aggregated presence state for a user across all files
 */
export interface AggregatedCollaborator {
  userId: string;
  name: string;
  color: string;
  activeFile?: string;  // Most recently active file
  connected: boolean;   // Overall connection status
  lastUpdate: number;   // Timestamp for staleness detection
}

/**
 * Registry state exposed to consumers
 */
export interface CollaboratorsState {
  list: AggregatedCollaborator[];
  byId: Map<string, AggregatedCollaborator>;
  count: number;
}

interface CollaboratorsContextValue {
  state: CollaboratorsState;
  upsertFilePresence: (fileId: string, users: CollaboratorPresence[]) => void;
  clearFilePresence: (fileId: string) => void;
  updateConnectionStatus: (fileId: string, connected: boolean) => void;
}

const CollaboratorsContext = createContext<CollaboratorsContextValue | null>(null);

/**
 * Centralized collaboration registry for workspace-level user presence.
 * Aggregates per-document awareness updates into a deduplicated user list.
 * 
 * Architecture (Task 7.9):
 * - Each CodeEditor emits onAwarenessUpdate(fileId, users)
 * - Provider maintains Map<fileId, Map<userId, PresenceState>>
 * - Derives Map<userId, AggregatedPresence> for UI consumption
 * - Memoized selectors prevent unnecessary re-renders
 * 
 * @see Task 7.9: User List Panel - Workspace-level presence registry
 */
export function CollaboratorsProvider({ children }: { children: ReactNode }) {
  // Map<fileId, Map<userId, PresenceState>>
  const filePresenceRef = useRef<Map<string, Map<string, CollaboratorPresence>>>(new Map());
  
  // Map<fileId, boolean> for connection status tracking
  const fileConnectionRef = useRef<Map<string, boolean>>(new Map());
  
  // Version counter for change detection (shallow compare optimization)
  const [version, setVersion] = useState(0);

  /**
   * Upsert presence data for a specific file.
   * Replaces all users for this file with the provided list.
   */
  const upsertFilePresence = useCallback((fileId: string, users: CollaboratorPresence[]) => {
    const userMap = new Map<string, CollaboratorPresence>();
    
    users.forEach(user => {
      userMap.set(user.userId, {
        ...user,
        // Task 7.9 fix: Preserve user's original activeFile from awareness, use fileId as fallback
        activeFile: user.activeFile || fileId,
        lastUpdate: Date.now(),
      } as any);
    });

    // Check if anything meaningful changed (Task 7.9 fix: detect field changes, not just user ID changes)
    const prev = filePresenceRef.current.get(fileId);
    let hasChanged = false;
    
    if (!prev || prev.size !== userMap.size) {
      hasChanged = true;
    } else {
      // Same number of users, check if any fields changed
      for (const [userId, newUser] of userMap.entries()) {
        const prevUser = prev.get(userId);
        if (!prevUser || 
            prevUser.name !== newUser.name ||
            prevUser.color !== newUser.color ||
            prevUser.activeFile !== newUser.activeFile ||
            prevUser.connected !== newUser.connected) {
          hasChanged = true;
          break;
        }
      }
    }
    
    if (hasChanged) {
      filePresenceRef.current.set(fileId, userMap);
      setVersion(v => v + 1);
    }
  }, []);

  /**
   * Clear all presence data for a specific file (e.g., when tab closes)
   */
  const clearFilePresence = useCallback((fileId: string) => {
    if (filePresenceRef.current.has(fileId)) {
      filePresenceRef.current.delete(fileId);
      fileConnectionRef.current.delete(fileId);
      setVersion(v => v + 1);
    }
  }, []);

  /**
   * Update connection status for a file's provider
   */
  const updateConnectionStatus = useCallback((fileId: string, connected: boolean) => {
    const prevStatus = fileConnectionRef.current.get(fileId);
    if (prevStatus !== connected) {
      fileConnectionRef.current.set(fileId, connected);
      setVersion(v => v + 1);
    }
  }, []);

  /**
   * Derive aggregated collaborator list from file-specific presence maps.
   * Memoized to prevent unnecessary recalculations.
   */
  const state = useMemo<CollaboratorsState>(() => {
    const aggregated = new Map<string, AggregatedCollaborator>();

    // Aggregate users from all files
    filePresenceRef.current.forEach((userMap, fileId) => {
      const fileConnected = fileConnectionRef.current.get(fileId) ?? true;
      
      userMap.forEach((presence) => {
        const existing = aggregated.get(presence.userId);
        
        if (!existing || (presence as any).lastUpdate > existing.lastUpdate) {
          // Keep the most recent presence data for this user
          aggregated.set(presence.userId, {
            userId: presence.userId,
            name: presence.name,
            color: presence.color,
            activeFile: presence.activeFile,
            connected: fileConnected,
            lastUpdate: (presence as any).lastUpdate || Date.now(),
          });
        }
      });
    });

    const list = Array.from(aggregated.values()).sort((a, b) => {
      // Sort: connected users first, then by name
      if (a.connected !== b.connected) return a.connected ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return {
      list,
      byId: aggregated,
      count: list.length,
    };
  }, [version]); // Only recalculate when version changes

  const value: CollaboratorsContextValue = {
    state,
    upsertFilePresence,
    clearFilePresence,
    updateConnectionStatus,
  };

  return (
    <CollaboratorsContext.Provider value={value}>
      {children}
    </CollaboratorsContext.Provider>
  );
}

/**
 * Hook to access the collaborators state and registry methods.
 * Must be used within a CollaboratorsProvider.
 */
export function useCollaborators() {
  const context = useContext(CollaboratorsContext);
  
  if (!context) {
    throw new Error("useCollaborators must be used within CollaboratorsProvider");
  }
  
  return context;
}
