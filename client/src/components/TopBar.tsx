import { Code2, Play, Pause, RotateCcw, Settings, Moon, Sun, Package, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { AgentStep } from "@shared/schema";

interface TopBarProps {
  workspaceName?: string;
  agentStatus?: AgentStep;
  onRunAgent?: () => void;
  onPauseAgent?: () => void;
  onResetAgent?: () => void;
  onSettings?: () => void;
  onPackages?: () => void;
  onTemplates?: () => void;
}

export default function TopBar({
  workspaceName = "my-project",
  agentStatus = "idle",
  onRunAgent,
  onPauseAgent,
  onResetAgent,
  onSettings,
  onPackages,
  onTemplates,
}: TopBarProps) {
  const [darkMode, setDarkMode] = useState(false);

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

  return (
    <div className="h-14 border-b bg-background flex items-center justify-between px-4 gap-4">
      <div className="flex items-center gap-3">
        <Code2 className="w-6 h-6 text-primary" data-testid="icon-logo" />
        <div className="flex flex-col">
          <span className="text-sm font-semibold" data-testid="text-workspace-name">{workspaceName}</span>
          <span className="text-xs text-muted-foreground">AI Web IDE</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Badge className={statusColors[agentStatus]} data-testid="badge-agent-status">
          {agentStatus === "idle" ? "Ready" : agentStatus.charAt(0).toUpperCase() + agentStatus.slice(1)}
        </Badge>
        
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
