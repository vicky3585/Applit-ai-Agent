/**
 * LogEntry Component (Phase 2)
 * Displays a single structured log entry with level-based icons and colors
 */

import { AlertCircle, CheckCircle, Info, AlertTriangle, Bug } from "lucide-react";
import type { LogEntry as LogEntryType } from "@shared/schema";
import { cn } from "@/lib/utils";

interface LogEntryProps {
  entry: LogEntryType;
  onClick?: () => void;
}

const levelConfig = {
  info: {
    icon: Info,
    color: "text-blue-500",
    bgColor: "bg-blue-50 dark:bg-blue-950/20",
    borderColor: "border-blue-200 dark:border-blue-900",
  },
  success: {
    icon: CheckCircle,
    color: "text-green-500",
    bgColor: "bg-green-50 dark:bg-green-950/20",
    borderColor: "border-green-200 dark:border-green-900",
  },
  warn: {
    icon: AlertTriangle,
    color: "text-yellow-500",
    bgColor: "bg-yellow-50 dark:bg-yellow-950/20",
    borderColor: "border-yellow-200 dark:border-yellow-900",
  },
  error: {
    icon: AlertCircle,
    color: "text-red-500",
    bgColor: "bg-red-50 dark:bg-red-950/20",
    borderColor: "border-red-200 dark:border-red-900",
  },
  debug: {
    icon: Bug,
    color: "text-gray-500",
    bgColor: "bg-gray-50 dark:bg-gray-950/20",
    borderColor: "border-gray-200 dark:border-gray-900",
  },
};

export function LogEntry({ entry, onClick }: LogEntryProps) {
  const config = levelConfig[entry.level];
  const Icon = config.icon;
  
  const timestamp = new Date(entry.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <div
      className={cn(
        "flex items-start gap-2 p-2 rounded-md border text-sm hover-elevate cursor-pointer transition-colors",
        config.bgColor,
        config.borderColor
      )}
      onClick={onClick}
      data-testid={`log-entry-${entry.id}`}
    >
      <Icon className={cn("w-4 h-4 mt-0.5 flex-shrink-0", config.color)} />
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
          <span>{timestamp}</span>
          <span className="text-xs px-1.5 py-0.5 rounded-sm bg-muted font-mono">
            {entry.phase}
          </span>
        </div>
        
        <p className="text-foreground whitespace-pre-wrap break-words">
          {entry.message}
        </p>
        
        {entry.metadata && Object.keys(entry.metadata).length > 0 && (
          <details className="mt-2 text-xs">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              Metadata
            </summary>
            <pre className="mt-1 p-2 rounded bg-muted overflow-x-auto font-mono">
              {JSON.stringify(entry.metadata, null, 2)}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}
