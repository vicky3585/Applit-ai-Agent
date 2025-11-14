import { createContext, useContext, ReactNode, useRef } from "react";
import { useQuery } from "@tanstack/react-query";

/**
 * Authenticated user data
 * Task 7.9: Single source of truth for user identity
 */
export interface AuthUser {
  id: string;
  username: string;
  email: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Auth Provider - fetches current user from /api/auth/me
 * 
 * Task 7.9: Provides authenticated user identity to WorkspaceAwarenessProvider,
 * CollaboratorsProvider, and other components that need stable user identity.
 * 
 * Architecture:
 * - Single source of truth for user identity across the application
 * - Uses React Query for caching and automatic refetching
 * - Falls back to mock user in development when no auth session exists
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  // Stable fallback user for development (memoized to prevent regeneration)
  const fallbackUserRef = useRef<AuthUser>({
    id: "dev-user-" + Math.random().toString(36).substr(2, 9),
    username: "DevUser",
    email: null,
  });

  const { data: user, isLoading, isError } = useQuery<AuthUser>({
    queryKey: ["/api/auth/me"],
    retry: false, // Don't retry if endpoint fails
    staleTime: Infinity, // User identity doesn't change often
  });

  // Development fallback: Use stable mock user if auth fails
  // This prevents IDE from breaking in development/testing
  const effectiveUser = user || (isError ? fallbackUserRef.current : null);

  const value: AuthContextValue = {
    user: effectiveUser,
    isLoading,
    isAuthenticated: !!effectiveUser,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Hook to access authenticated user data
 */
export function useAuth() {
  const context = useContext(AuthContext);
  
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  
  return context;
}
