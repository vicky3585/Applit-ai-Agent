import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CollaboratorsProvider } from "@/providers/CollaboratorsProvider";
import { useWorkspaceEvents } from "@/hooks/use-workspace-events";
import { useAuth } from "@/hooks/use-auth";
import { ProtectedRoute } from "@/components/protected-route";
import AuthPage from "@/pages/auth";
import Dashboard from "@/pages/dashboard";
import IDE from "@/pages/ide";
import NotFound from "@/pages/not-found";

function Router() {
  const { user } = useAuth();
  
  // Activate workspace event subscription for real-time updates
  useWorkspaceEvents(user?.id || "");
  
  return (
    <Switch>
      <Route path="/auth" component={AuthPage} />
      <Route path="/">
        <ProtectedRoute>
          <Dashboard />
        </ProtectedRoute>
      </Route>
      <Route path="/dashboard">
        <ProtectedRoute>
          <Dashboard />
        </ProtectedRoute>
      </Route>
      <Route path="/ide/:workspaceId">
        {(params) => (
          <ProtectedRoute>
            <IDE />
          </ProtectedRoute>
        )}
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <CollaboratorsProvider>
          <Toaster />
          <Router />
        </CollaboratorsProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
