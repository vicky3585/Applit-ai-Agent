/**
 * LogEntry Component (Phase 2)
 * Displays a single structured log entry with level-based icons and colors
 */

import { useState } from "react";
import { AlertCircle, CheckCircle, Info, AlertTriangle, Bug, Terminal, ChevronDown, ChevronRight } from "lucide-react";
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

interface CommandMetadata {
  command?: string;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  duration?: number;
}

function isCommandMetadata(metadata: any): metadata is CommandMetadata {
  return metadata && 'command' in metadata;
}

export function LogEntry({ entry, onClick }: LogEntryProps) {
  const [stdoutExpanded, setStdoutExpanded] = useState(false);
  const [stderrExpanded, setStderrExpanded] = useState(false);
  
  const config = levelConfig[entry.level];
  const Icon = config.icon;
  
  const timestamp = new Date(entry.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const isCommandLog = entry.phase === "command_execution" && isCommandMetadata(entry.metadata);

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
        
        {/* Enhanced Command Execution Display */}
        {isCommandLog && entry.metadata && (
          <div className="mt-2 space-y-2">
            <div className="flex items-center gap-2 text-xs">
              <Terminal className="w-3 h-3" />
              <code className="font-mono bg-muted px-1.5 py-0.5 rounded">
                {entry.metadata.command}
              </code>
              <span className={cn(
                "px-1.5 py-0.5 rounded font-medium",
                entry.metadata.exitCode === 0 
                  ? "bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-400" 
                  : "bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-400"
              )}>
                Exit {entry.metadata.exitCode}
              </span>
              {entry.metadata.duration !== undefined && (
                <span className="text-muted-foreground">
                  ({entry.metadata.duration}ms)
                </span>
              )}
            </div>
            
            {entry.metadata.stdout && entry.metadata.stdout.trim() && (
              <div className="space-y-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setStdoutExpanded(!stdoutExpanded);
                  }}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  {stdoutExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  <span>stdout ({entry.metadata.stdout.split('\n').length} lines)</span>
                </button>
                {stdoutExpanded && (
                  <pre className="text-xs p-2 rounded bg-muted/50 overflow-x-auto font-mono max-h-48 overflow-y-auto border">
                    {entry.metadata.stdout}
                  </pre>
                )}
              </div>
            )}
            
            {entry.metadata.stderr && entry.metadata.stderr.trim() && (
              <div className="space-y-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setStderrExpanded(!stderrExpanded);
                  }}
                  className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
                >
                  {stderrExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  <span>stderr ({entry.metadata.stderr.split('\n').length} lines)</span>
                </button>
                {stderrExpanded && (
                  <pre className="text-xs p-2 rounded bg-red-50 dark:bg-red-950/20 overflow-x-auto font-mono max-h-48 overflow-y-auto border border-red-200 dark:border-red-900">
                    {entry.metadata.stderr}
                  </pre>
                )}
              </div>
            )}
          </div>
        )}
        
        {/* Generic Metadata Display (for non-command logs) */}
        {entry.metadata && Object.keys(entry.metadata).length > 0 && !isCommandLog && (
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
