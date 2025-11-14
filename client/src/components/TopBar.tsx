import { Code2, Play, Pause, RotateCcw, Settings, Moon, Sun, Package, Sparkles, Github, ChevronDown, LayoutDashboard, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { AgentStep } from "@shared/schema";

interface Workspace {
  id: string;
  name: string;
  userId: string;
  createdAt: string;
}

interface TopBarProps {
  workspaceId?: string;
  workspaceName?: string;
  agentStatus?: AgentStep;
  onRunAgent?: () => void;
  onPauseAgent?: () => void;
  onResetAgent?: () => void;
  onSettings?: () => void;
  onPackages?: () => void;
  onTemplates?: () => void;
  onGitHub?: () => void;
  followingUserName?: string | null;
  onStopFollowing?: () => void;
}

export default function TopBar({
  workspaceId,
  workspaceName = "my-project",
  agentStatus = "idle",
  onRunAgent,
  onPauseAgent,
  onResetAgent,
  onSettings,
  onPackages,
  onTemplates,
  onGitHub,
  followingUserName,
  onStopFollowing,
}: TopBarProps) {
  const [darkMode, setDarkMode] = useState(false);
  const [, navigate] = useLocation();

  // Fetch all workspaces for the switcher (with aggressive refetching)
  const { data: workspaces = [] } = useQuery<Workspace[]>({
    queryKey: ["/api/workspaces"],
    refetchOnWindowFocus: true,
    staleTime: 30000, // Consider data stale after 30 seconds
  });

  // Detect when current workspace is deleted and redirect to dashboard
  useEffect(() => {
    if (workspaceId && workspaces.length > 0) {
      const currentWorkspaceExists = workspaces.some(w => w.id === workspaceId);
      if (!currentWorkspaceExists) {
        // Current workspace was deleted, redirect to dashboard
        navigate("/dashboard");
      }
    }
  }, [workspaceId, workspaces, navigate]);

  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
    document.documentElement.classList.toggle("dark");
  };

  const statusColors: Record<AgentStep, string> = {
    idle: "bg-muted text-muted-foreground",
    planning: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    coding: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
    testing: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
    fixing: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
    complete: "bg-green-500/10 text-green-600 dark:text-green-400",
    failed: "bg-destructive/10 text-destructive",
  };

  const handleSwitchWorkspace = (id: string) => {
    navigate(`/ide/${id}`);
  };

  const handleGoToDashboard = () => {
    navigate("/dashboard");
  };

  return (
    <div className="h-14 border-b bg-background flex items-center justify-between px-4 gap-4">
      <div className="flex items-center gap-3">
        <Code2 className="w-6 h-6 text-primary" data-testid="icon-logo" />
        
        {/* Workspace Switcher */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button 
              variant="ghost" 
              className="flex flex-col items-start h-auto py-1 px-2 hover-elevate"
              data-testid="button-workspace-switcher"
            >
              <div className="flex items-center gap-1">
                <span className="text-sm font-semibold">{workspaceName}</span>
                <ChevronDown className="w-3 h-3" />
              </div>
              <span className="text-xs text-muted-foreground">Applit</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64" data-testid="menu-workspace-switcher">
            <DropdownMenuLabel>Switch Workspace</DropdownMenuLabel>
            <DropdownMenuSeparator />
            
            {workspaces.length > 0 ? (
              workspaces.map((workspace) => (
                <DropdownMenuItem
                  key={workspace.id}
                  onClick={() => handleSwitchWorkspace(workspace.id)}
                  className={workspace.id === workspaceId ? "bg-accent" : ""}
                  data-testid={`menu-item-workspace-${workspace.id}`}
                >
                  <FolderOpen className="w-4 h-4 mr-2" />
                  {workspace.name}
                  {workspace.id === workspaceId && (
                    <Badge variant="secondary" className="ml-auto">Current</Badge>
                  )}
                </DropdownMenuItem>
              ))
            ) : (
              <DropdownMenuItem disabled>
                No workspaces found
              </DropdownMenuItem>
            )}
            
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleGoToDashboard} data-testid="menu-item-dashboard">
              <LayoutDashboard className="w-4 h-4 mr-2" />
              Go to Dashboard
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex items-center gap-2">
        <Badge className={statusColors[agentStatus]} data-testid="badge-agent-status">
          {agentStatus === "idle" ? "Ready" : agentStatus.charAt(0).toUpperCase() + agentStatus.slice(1)}
        </Badge>
        
        {followingUserName && (
          <Badge 
            className="bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center gap-1.5 pr-1" 
            data-testid="badge-following-user"
          >
            Following {followingUserName}
            <Button
              size="icon"
              variant="ghost"
              className="h-4 w-4 hover:bg-blue-500/20 rounded-sm"
              onClick={onStopFollowing}
              data-testid="button-stop-following"
            >
              ✕
            </Button>
          </Badge>
        )}
        
        {(agentStatus === "idle" || agentStatus === "complete" || agentStatus === "failed") ? (
          <Button 
            size="sm" 
            onClick={onRunAgent}
            data-testid="button-run-agent"
          >
            <Play className="w-4 h-4 mr-1" />
            Run Agent
          </Button>
        ) : (
          <Button 
            size="sm" 
            variant="secondary"
            onClick={onPauseAgent}
            data-testid="button-pause-agent"
          >
            <Pause className="w-4 h-4 mr-1" />
            Pause
          </Button>
        )}
        
        <Button 
          size="icon" 
          variant="ghost"
          onClick={onResetAgent}
          data-testid="button-reset-agent"
        >
          <RotateCcw className="w-4 h-4" />
        </Button>
        
        <div className="w-px h-6 bg-border" />
        
        <Button 
          size="icon" 
          variant="ghost"
          onClick={onTemplates}
          data-testid="button-templates"
        >
          <Sparkles className="w-4 h-4" />
        </Button>
        
        <Button 
          size="icon" 
          variant="ghost"
          onClick={onGitHub}
          data-testid="button-github"
        >
          <Github className="w-4 h-4" />
        </Button>
        
        <Button 
          size="icon" 
          variant="ghost"
          onClick={onPackages}
          data-testid="button-packages"
        >
          <Package className="w-4 h-4" />
        </Button>
        
        <Button 
          size="icon" 
          variant="ghost"
          onClick={toggleDarkMode}
          data-testid="button-theme-toggle"
        >
          {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </Button>
        
        <Button 
          size="icon" 
          variant="ghost"
          onClick={onSettings}
          data-testid="button-settings"
        >
          <Settings className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
