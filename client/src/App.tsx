import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CollaboratorsProvider } from "@/providers/CollaboratorsProvider";
import Dashboard from "@/pages/dashboard";
import IDE from "@/pages/ide";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/ide/:workspaceId" component={IDE} />
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
