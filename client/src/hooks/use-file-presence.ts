import { useState, useCallback } from "react";

export interface CollaboratorPresence {
  userId: string;
  name: string;
  color: string;
}

export type FilePresenceMap = Record<string, CollaboratorPresence[]>;

/**
 * Custom hook to manage file presence indicators for multiplayer collaboration.
 * Tracks which users are viewing each file and provides cleanup utilities.
 * 
 * Task 7.8: File Tree Presence Indicators
 */
export function useFilePresence() {
  const [filePresence, setFilePresence] = useState<FilePresenceMap>({});

  /**
   * Update presence for a specific file.
   * Removes entry if users array is empty to prevent ghost indicators.
   */
  const handleAwarenessUpdate = useCallback((fileName: string, users: CollaboratorPresence[]) => {
    setFilePresence((prev) => {
      // Remove entry if no users viewing
      if (users.length === 0) {
        const updated = { ...prev };
        delete updated[fileName];
        return updated;
      }

      // Update with deduplicated users (by userId)
      const uniqueUsers = Array.from(
        new Map(users.map(u => [u.userId, u])).values()
      );

      return {
        ...prev,
        [fileName]: uniqueUsers,
      };
    });
  }, []);

  /**
   * Clear presence for a specific file (e.g., when tab is closed)
   */
  const clearPresenceForFile = useCallback((fileName: string) => {
    setFilePresence((prev) => {
      const updated = { ...prev };
      delete updated[fileName];
      return updated;
    });
  }, []);

  /**
   * Reset all presence state (e.g., on unmount or reconnect)
   */
  const resetPresence = useCallback(() => {
    setFilePresence({});
  }, []);

  return {
    filePresence,
    handleAwarenessUpdate,
    clearPresenceForFile,
    resetPresence,
  };
}
